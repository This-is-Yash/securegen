import logging
from typing import Dict, List, Optional, Tuple
from app.models.schemas import Vulnerability
from app.services.base_scanner import BaseScanner
from app.services.semgrep_scanner import SemgrepScanner

logger = logging.getLogger("security_analyzer")


class SecurityAnalyzer:
    """
    Central orchestrator managing multiple static security scanning engines.
    Supports pluggable scanners (Semgrep, Bandit, ESLint Security, etc.).
    """

    def __init__(self, default_scanner: Optional[BaseScanner] = None):
        self._scanners: Dict[str, BaseScanner] = {}
        # Register default Semgrep scanner
        primary = default_scanner or SemgrepScanner()
        self.register_scanner(primary)
        self._default_scanner_name = primary.name

    def register_scanner(self, scanner: BaseScanner):
        self._scanners[scanner.name] = scanner
        logger.info("Registered static scanner engine: %s", scanner.name)

    def get_scanner(self, name: Optional[str] = None) -> BaseScanner:
        scanner_name = name or self._default_scanner_name
        if scanner_name not in self._scanners:
            raise ValueError(f"Scanner '{scanner_name}' is not registered. Available: {list(self._scanners.keys())}")
        return self._scanners[scanner_name]

    def scan_code(
        self,
        code: str,
        file_path: str,
        language: str,
        rules_config: Optional[str] = None,
        scanner_name: Optional[str] = None,
    ) -> Tuple[List[Vulnerability], float, List[str], Optional[str], str]:
        """
        Delegate scan to appropriate registered scanner engine.
        """
        scanner = self.get_scanner(scanner_name)
        return scanner.scan(
            code=code,
            file_path=file_path,
            language=language,
            rules_config=rules_config,
        )


# Global default instance for dependency injection
_global_analyzer: Optional[SecurityAnalyzer] = None


def get_security_analyzer() -> SecurityAnalyzer:
    """FastAPI dependency provider for SecurityAnalyzer."""
    global _global_analyzer
    if _global_analyzer is None:
        _global_analyzer = SecurityAnalyzer()
    return _global_analyzer
