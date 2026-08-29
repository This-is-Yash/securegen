import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import List, Optional, Tuple

from app.core.config import settings
from app.models.schemas import SeverityLevel, Vulnerability, VulnerabilitySource
from app.services.base_scanner import BaseScanner

logger = logging.getLogger("semgrep_scanner")

ALLOWED_REMOTE_RULESETS = frozenset({
    "auto",
    "p/security-audit",
    "p/owasp-top-ten",
    "p/cwe-top-25",
    "p/python",
    "p/javascript",
    "p/typescript",
    "p/default",
})


def map_semgrep_severity(raw_severity: str, metadata: dict) -> SeverityLevel:
    impact = str(metadata.get("impact", "")).upper()
    sev = str(raw_severity).upper()

    if impact == "CRITICAL" or sev == "CRITICAL":
        return SeverityLevel.CRITICAL
    if sev == "ERROR" or impact == "HIGH":
        return SeverityLevel.HIGH
    if sev == "WARNING" or impact == "MEDIUM":
        return SeverityLevel.MEDIUM
    if sev == "INFO" or impact == "LOW":
        return SeverityLevel.LOW
    return SeverityLevel.MEDIUM


def extract_cwe(metadata: dict) -> str:
    cwe = metadata.get("cwe")
    if isinstance(cwe, list) and cwe:
        return str(cwe[0])
    elif isinstance(cwe, str) and cwe.strip():
        return cwe.strip()

    category = metadata.get("category", "")
    if category:
        return f"OWASP-{category.upper()}"
    return "CWE-UNKNOWN"


class SemgrepScanner(BaseScanner):
    def __init__(self, timeout_sec: Optional[int] = None):
        self.timeout_sec = timeout_sec or settings.scan_timeout_seconds
        self.semgrep_bin = self._find_semgrep_binary()
        self.rules_root = settings.rules_root

    @property
    def name(self) -> str:
        return "semgrep"

    @property
    def supported_languages(self) -> List[str]:
        return ["python", "javascript", "typescript"]

    def is_available(self) -> bool:
        return bool(self.semgrep_bin and shutil.which(self.semgrep_bin) or Path(self.semgrep_bin).exists())

    def _find_semgrep_binary(self) -> str:
        # Check backend venv
        venv_bin = Path(__file__).resolve().parent.parent.parent / "venv" / "Scripts" / "semgrep.exe"
        if venv_bin.exists():
            return str(venv_bin)

        found = shutil.which("semgrep")
        if found:
            return found

        py_scripts = Path(sys.executable).parent / "Scripts" / "semgrep.exe"
        if py_scripts.exists():
            return str(py_scripts)

        return "semgrep"

    def _resolve_rules_config(self, language: str, rules_config: Optional[str]) -> str:
        if not rules_config or rules_config == "auto":
            normalized_lang = language.lower()
            if normalized_lang in ("javascript", "typescript", "javascriptreact", "typescriptreact"):
                lang_rules = self.rules_root / "javascript" / "rules.yaml"
            else:
                lang_rules = self.rules_root / "python" / "rules.yaml"

            if lang_rules.exists():
                return str(lang_rules)
            return "p/security-audit"

        if rules_config in ALLOWED_REMOTE_RULESETS:
            return rules_config

        candidate_path = Path(rules_config).resolve()
        rules_root_resolved = self.rules_root.resolve()
        try:
            candidate_path.relative_to(rules_root_resolved)
            if candidate_path.exists():
                return str(candidate_path)
        except ValueError:
            pass

        logger.warning(
            "Rejected invalid ruleset config '%s'. Falling back to default rules.",
            rules_config,
        )
        return "p/security-audit"

    def parse_semgrep_json(
        self, semgrep_data: dict, fallback_file: str
    ) -> Tuple[List[Vulnerability], List[str], Optional[str]]:
        vulnerabilities: List[Vulnerability] = []
        warnings: List[str] = []
        engine_version = semgrep_data.get("version")

        errors = semgrep_data.get("errors", [])
        for err in errors:
            err_msg = err.get("long_msg") or err.get("message") or str(err)
            err_type = err.get("type", "UnknownError")
            rule_id = err.get("rule_id", "")
            prefix = f"[{err_type}]" + (f" Rule {rule_id}:" if rule_id else ":")
            warnings.append(f"{prefix} {err_msg}")

        results = semgrep_data.get("results", [])
        for item in results:
            check_id = item.get("check_id", "security-finding")
            extra = item.get("extra", {})
            metadata = extra.get("metadata", {})
            raw_message = extra.get("message", "Potential security vulnerability detected.")
            raw_severity = extra.get("severity", "WARNING")

            start_pos = item.get("start", {})
            end_pos = item.get("end", {})
            start_line = start_pos.get("line", 1)
            end_line = end_pos.get("line", start_line)
            start_col = start_pos.get("col")
            end_col = end_pos.get("col")

            vulnerability_type = metadata.get("subcategory", [check_id.split(".")[-1]])
            if isinstance(vulnerability_type, list) and vulnerability_type:
                vulnerability_type = vulnerability_type[0]
            elif not isinstance(vulnerability_type, str):
                vulnerability_type = check_id.split(".")[-1]

            lines = extra.get("lines", "")
            severity = map_semgrep_severity(raw_severity, metadata)
            cwe = extract_cwe(metadata)

            vulnerabilities.append(
                Vulnerability(
                    id=check_id,
                    type=str(vulnerability_type),
                    severity=severity,
                    cwe=cwe,
                    message=raw_message,
                    file=item.get("path", fallback_file),
                    startLine=start_line,
                    endLine=end_line,
                    startColumn=start_col,
                    endColumn=end_col,
                    source=VulnerabilitySource.SEMGREP,
                    snippet=lines.strip() if (lines and lines != "requires login") else None,
                    metadata={
                        "confidence": metadata.get("confidence", "HIGH"),
                        "owasp": metadata.get("owasp", []),
                        "references": metadata.get("references", []),
                        "vulnerability_class": metadata.get("vulnerability_class", []),
                    },
                )
            )

        return vulnerabilities, warnings, engine_version

    def scan(
        self,
        code: str,
        file_path: str,
        language: str,
        rules_config: Optional[str] = None,
    ) -> Tuple[List[Vulnerability], float, List[str], Optional[str], str]:
        start_time = time.time()
        ext_map = {
            "python": ".py",
            "javascript": ".js",
            "typescript": ".ts",
        }
        ext = ext_map.get(language.lower(), ".py")
        config_arg = self._resolve_rules_config(language, rules_config)

        # Ensure temp directory exists
        settings.temp_dir.mkdir(parents=True, exist_ok=True)

        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=ext,
            dir=str(settings.temp_dir),
            delete=False,
            encoding="utf-8"
        ) as tmp_file:
            tmp_file.write(code)
            tmp_file_path = tmp_file.name

        try:
            cmd = [
                self.semgrep_bin,
                "scan",
                "--json",
                f"--config={config_arg}",
                "--metrics=off",
                "--quiet",
                tmp_file_path,
            ]

            logger.info("Executing static analysis: %s", " ".join(cmd))
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.timeout_sec,
                encoding="utf-8",
                errors="replace",
            )

            stdout = proc.stdout.strip()
            if not stdout:
                duration_ms = (time.time() - start_time) * 1000
                return [], duration_ms, [], None, config_arg

            json_start = stdout.find("{")
            json_end = stdout.rfind("}")
            if json_start != -1 and json_end != -1:
                json_str = stdout[json_start : json_end + 1]
                semgrep_data = json.loads(json_str)
            else:
                semgrep_data = json.loads(stdout)

            vulnerabilities, warnings, engine_version = self.parse_semgrep_json(
                semgrep_data, fallback_file=file_path
            )

            for v in vulnerabilities:
                v.file = file_path

            duration_ms = (time.time() - start_time) * 1000
            return vulnerabilities, duration_ms, warnings, engine_version, config_arg

        except subprocess.TimeoutExpired:
            raise TimeoutError(f"Semgrep analysis timed out after {self.timeout_sec}s")
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse Semgrep JSON output: %s", exc)
            duration_ms = (time.time() - start_time) * 1000
            return [], duration_ms, [f"JSON parse error: {exc}"], None, config_arg
        finally:
            if os.path.exists(tmp_file_path):
                try:
                    os.remove(tmp_file_path)
                except OSError:
                    pass
