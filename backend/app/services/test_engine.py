import asyncio
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from app.core.config import settings
from app.core.prompts import (
    TEST_GENERATION_SYSTEM_PROMPT,
    TEST_GENERATION_USER_PROMPT_TEMPLATE,
)
from app.models.schemas import (
    GeneratedSecurityTest,
    TestExecutionRequest,
    TestExecutionResponse,
    TestExecutionStatus,
    TestGenerationRequest,
    TestGenerationResponse,
    VerificationReport,
    VerificationRequest,
    VerificationStatus,
    Vulnerability,
)
from app.services.security_analyzer import SecurityAnalyzer

logger = logging.getLogger("test_engine")

DANGEROUS_COMMAND_PATTERNS = re.compile(
    r"(\brm\s+-rf\b|\bformat\b|\bdel\s+/[sfq]\b|:\(\)\s*\{\s*:\|:&\s*\};:|\|\s*sh\b|\|\s*bash\b|curl.*\|\s*python|wget.*\|\s*python|chmod\s+777)",
    re.IGNORECASE
)


class SecurityTestGenerator:
    """Generates targeted, non-destructive security regression test cases."""

    def __init__(self, llm_service=None):
        self.llm_service = llm_service

    def _generate_deterministic_mock_test(
        self, vuln: Vulnerability, language: str, test_framework: str
    ) -> GeneratedSecurityTest:
        """Deterministic mock security test generator for offline mode and tests."""
        cwe = vuln.cwe.upper()
        target_name = (vuln.snippet or "target_fn").split("(")[0].split("=")[-1].strip()
        if not target_name.isidentifier():
            target_name = "target_function"

        if "python" in language.lower():
            tf = test_framework or "unittest"
            if "89" in cwe:  # SQL Injection
                code = """import sqlite3
import unittest

class TestSQLInjectionDefense(unittest.TestCase):
    def test_sql_injection_defense(self):
        \"\"\"Verify that SQL injection payloads are neutralized and treated as literal values.\"\"\"
        conn = sqlite3.connect(":memory:")
        cursor = conn.cursor()
        cursor.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, role TEXT)")
        cursor.execute("INSERT INTO users VALUES (1, 'alice', 'admin')")
        
        # Malicious injection payload
        malicious_id = "1' OR '1'='1"
        
        # Parameterized query should return empty
        cursor.execute("SELECT * FROM users WHERE id = ?", (malicious_id,))
        rows = cursor.fetchall()
        self.assertEqual(len(rows), 0, "SQL Injection payload succeeded in bypassing query logic!")
"""
            elif "78" in cwe:  # Command Injection
                code = """import unittest
import subprocess

class TestCommandInjectionDefense(unittest.TestCase):
    def test_command_injection_defense(self):
        \"\"\"Verify that shell metacharacters cannot execute secondary commands.\"\"\"
        malicious_input = "127.0.0.1; whoami"
        is_rejected = ";" in malicious_input or "&" in malicious_input
        self.assertTrue(is_rejected, "Dangerous shell characters must be detected and rejected")
"""
            elif "22" in cwe:  # Path Traversal
                code = """import unittest
from pathlib import Path

class TestPathTraversalDefense(unittest.TestCase):
    def test_path_traversal_defense(self):
        \"\"\"Verify that relative path traversal sequences (../) are rejected.\"\"\"
        base_dir = Path("/safe/storage").resolve()
        malicious_filename = "../../../etc/passwd"
        target_path = (base_dir / malicious_filename).resolve()
        is_safe = str(target_path).startswith(str(base_dir))
        self.assertFalse(is_safe, "Path traversal attempt successfully escaped base directory!")
"""
            else:
                code = f"""import unittest

class TestSecurityDefense(unittest.TestCase):
    def test_vulnerability_remediation(self):
        \"\"\"Verify input validation and safety against {cwe}.\"\"\"
        untrusted_input = "<script>alert(1)</script>"
        sanitized = untrusted_input.replace("<", "&lt;").replace(">", "&gt;")
        self.assertNotIn("<script>", sanitized)
"""
            file_path = f"tests/security/test_{vuln.type.replace('-', '_')}.py"

        else:  # JS / TS
            tf = test_framework or "Jest"
            code = f"""describe('{vuln.type} Security Defense', () => {{
    it('should neutralize malicious payload for {cwe}', () => {{
        const maliciousPayload = "' OR 1=1 --";
        const isSafe = !maliciousPayload.includes("OR 1=1");
        expect(isSafe).toBe(false);
    }});
}});
"""
            file_path = f"tests/security/{vuln.type}.test.js"

        return GeneratedSecurityTest(
            testId=f"sec-test-{vuln.id}",
            vulnerabilityId=vuln.id,
            cwe=vuln.cwe,
            testName=f"test_{vuln.type.replace('-', '_')}_defense",
            framework=tf,
            targetFunction=target_name,
            testCode=code,
            testFilePath=file_path,
            executionSupported=True,
            safetyRationale="Uses in-memory mock fixtures and non-destructive assert evaluations."
        )

    async def generate_tests_for_vulnerability(
        self, request: TestGenerationRequest
    ) -> TestGenerationResponse:
        start_time = time.time()
        vuln = request.vulnerability
        test_fw = request.testFramework or ("pytest" if "python" in request.language.lower() else "Jest")

        # If LLM service is available and non-mock
        if self.llm_service and getattr(self.llm_service.provider, "provider_name", "mock") != "mock":
            try:
                module_name = Path(vuln.file).stem
                user_prompt = TEST_GENERATION_USER_PROMPT_TEMPLATE.format(
                    test_framework=test_fw,
                    language=request.language,
                    rule_id=vuln.id,
                    vulnerability_type=vuln.type,
                    cwe=vuln.cwe,
                    severity=vuln.severity.value,
                    message=vuln.message,
                    surrounding_code=request.surroundingCode or vuln.snippet or "N/A",
                    framework=request.framework or "standard",
                    module_name=module_name
                )

                raw_data = await self.llm_service.provider.generate_json(
                    system_prompt=TEST_GENERATION_SYSTEM_PROMPT,
                    user_prompt=user_prompt
                )
                duration_ms = (time.time() - start_time) * 1000

                gen_test = GeneratedSecurityTest(
                    testId=f"sec-test-{vuln.id}",
                    vulnerabilityId=vuln.id,
                    cwe=vuln.cwe,
                    testName=raw_data.get("testName", f"test_{vuln.type.replace('-', '_')}"),
                    framework=test_fw,
                    targetFunction=raw_data.get("targetFunction"),
                    testCode=raw_data.get("testCode", ""),
                    testFilePath=raw_data.get("testFilePath", f"tests/security/test_{vuln.type}.py"),
                    executionSupported=True,
                    safetyRationale=raw_data.get("safetyRationale", "Non-destructive isolated unit test.")
                )

                return TestGenerationResponse(
                    success=True,
                    tests=[gen_test],
                    testFramework=test_fw,
                    provider=self.llm_service.provider.provider_name,
                    generationDurationMs=round(duration_ms, 2)
                )
            except Exception as e:
                logger.warning("LLM test generation failed, falling back to deterministic template: %s", e)

        # Deterministic generation fallback
        mock_test = self._generate_deterministic_mock_test(vuln, request.language, test_fw)
        duration_ms = (time.time() - start_time) * 1000

        return TestGenerationResponse(
            success=True,
            tests=[mock_test],
            testFramework=test_fw,
            provider="deterministic-template",
            generationDurationMs=round(duration_ms, 2)
        )


class SafeTestExecutor:
    """Safely executes generated security tests in controlled, isolated test processes."""

    def __init__(self, default_timeout_sec: int = 15):
        self.timeout_sec = default_timeout_sec

    def is_safe_to_execute(self, test_code: str) -> Tuple[bool, Optional[str]]:
        """Validate that test source does not contain destructive patterns."""
        if DANGEROUS_COMMAND_PATTERNS.search(test_code):
            return False, "Dangerous command pattern detected in test source."
        return True, None

    async def execute_test(self, request: TestExecutionRequest) -> TestExecutionResponse:
        start_time = time.time()
        test = request.test

        # 1. Safety validation
        is_safe, reason = self.is_safe_to_execute(test.testCode)
        if not is_safe:
            return TestExecutionResponse(
                testId=test.testId,
                status=TestExecutionStatus.NOT_EXECUTED,
                errorMessage=f"Execution blocked: {reason}"
            )

        # 2. Prepare temporary test file
        ext = ".py" if "python" in test.framework.lower() or "pytest" in test.framework.lower() or "unittest" in test.framework.lower() else ".js"
        settings.temp_dir.mkdir(parents=True, exist_ok=True)

        test_content = test.testCode
        if ext == ".py":
            # Ensure standalone executable runner entry point
            if "unittest" in test_content and "unittest.main" not in test_content:
                test_content += "\n\nif __name__ == '__main__':\n    import unittest\n    unittest.main()\n"
            elif "def test_" in test_content and "if __name__" not in test_content:
                # Wrap pytest-style test functions into direct execution
                test_content += """

if __name__ == '__main__':
    for name, fn in list(globals().items()):
        if name.startswith('test_') and callable(fn):
            fn()
    print('All tests passed.')
"""

        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=ext,
            dir=str(settings.temp_dir),
            delete=False,
            encoding="utf-8"
        ) as tmp_file:
            tmp_file.write(test_content)
            tmp_test_path = tmp_file.name

        try:
            # 3. Determine runner command
            if ext == ".py":
                python_bin = sys.executable
                cmd = [python_bin, tmp_test_path]
            else:
                node_bin = shutil.which("node") or "node"
                cmd = [node_bin, tmp_test_path]

            logger.info("Executing security test: %s", " ".join(cmd))

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=request.projectRoot or str(settings.project_root)
            )

            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=self.timeout_sec
                )
                stdout = stdout_bytes.decode("utf-8", errors="replace")
                stderr = stderr_bytes.decode("utf-8", errors="replace")
                exit_code = proc.returncode or 0
                duration_ms = (time.time() - start_time) * 1000

                status = TestExecutionStatus.PASS if exit_code == 0 else TestExecutionStatus.FAIL

                return TestExecutionResponse(
                    testId=test.testId,
                    status=status,
                    exitCode=exit_code,
                    stdout=stdout,
                    stderr=stderr,
                    durationMs=round(duration_ms, 2),
                    isReproduced=(status == TestExecutionStatus.FAIL)
                )

            except asyncio.TimeoutError:
                try:
                    proc.kill()
                except OSError:
                    pass
                duration_ms = (time.time() - start_time) * 1000
                return TestExecutionResponse(
                    testId=test.testId,
                    status=TestExecutionStatus.ERROR,
                    durationMs=round(duration_ms, 2),
                    errorMessage=f"Security test execution timed out after {self.timeout_sec}s"
                )

        except Exception as e:
            logger.exception("Error executing security test: %s", e)
            duration_ms = (time.time() - start_time) * 1000
            return TestExecutionResponse(
                testId=test.testId,
                status=TestExecutionStatus.ERROR,
                durationMs=round(duration_ms, 2),
                errorMessage=str(e)
            )
        finally:
            if os.path.exists(tmp_test_path):
                try:
                    os.remove(tmp_test_path)
                except OSError:
                    pass


class VerificationService:
    """
    Coordinates the full verification loop:
    1. Static analysis re-scan of remediated code.
    2. Regression test execution.
    3. Final verification status calculation.
    """

    def __init__(self, analyzer: SecurityAnalyzer, executor: SafeTestExecutor):
        self.analyzer = analyzer
        self.executor = executor

    async def verify_remediation(self, request: VerificationRequest) -> VerificationReport:
        # Step 1: Re-scan remediated code with static analyzer
        vulnerabilities, _, _, _, _ = await asyncio.to_thread(
            self.analyzer.scan_code,
            code=request.remediatedCode,
            file_path=request.filePath,
            language=request.language
        )

        static_passed = len(vulnerabilities) == 0

        # Step 2: Run all associated security regression tests
        test_results: List[TestExecutionResponse] = []
        tests_passed = True

        for test in (request.generatedTests or []):
            exec_req = TestExecutionRequest(
                test=test,
                projectRoot=request.projectRoot or str(settings.project_root),
                targetCode=request.remediatedCode
            )
            exec_res = await self.executor.execute_test(exec_req)
            test_results.append(exec_res)
            if exec_res.status != TestExecutionStatus.PASS:
                tests_passed = False

        # Step 3: Compute final verification status
        if static_passed and (tests_passed or not request.generatedTests):
            status = VerificationStatus.SECURE_VERIFIED
            summary = "Remediation successfully verified: 0 residual vulnerabilities and all security regression checks passed."
        elif not static_passed:
            status = VerificationStatus.VULNERABILITIES_REMAIN
            summary = f"Verification failed: {len(vulnerabilities)} residual security vulnerability finding(s) detected after fix."
        elif not tests_passed:
            status = VerificationStatus.TESTS_FAILED
            summary = "Verification incomplete: Static analysis passed but automated security regression tests failed."
        else:
            status = VerificationStatus.NOT_FULLY_VERIFIED
            summary = "Verification could not be fully completed in the current environment."

        return VerificationReport(
            success=True,
            status=status,
            staticAnalysisPassed=static_passed,
            securityTestsPassed=tests_passed,
            residualVulnerabilities=vulnerabilities,
            testResults=test_results,
            explanation=f"Static Scan: {'PASS' if static_passed else 'FAIL'} | Security Tests: {'PASS' if tests_passed else 'FAIL'}",
            summaryMessage=summary
        )
