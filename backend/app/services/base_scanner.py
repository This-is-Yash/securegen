from abc import ABC, abstractmethod
from typing import List, Optional, Tuple
from app.models.schemas import Vulnerability


class BaseScanner(ABC):
    """Abstract interface for all static analysis security scanners."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Name of the scanning engine (e.g. semgrep, bandit, eslint)."""
        pass

    @property
    @abstractmethod
    def supported_languages(self) -> List[str]:
        """List of supported programming language identifiers."""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if the scanner binary or runtime is installed and operational."""
        pass

    @abstractmethod
    def scan(
        self,
        code: str,
        file_path: str,
        language: str,
        rules_config: Optional[str] = None
    ) -> Tuple[List[Vulnerability], float, List[str], Optional[str], str]:
        """
        Execute static analysis scan on code.

        Returns:
            Tuple of:
                - List[Vulnerability]: List of detected vulnerabilities
                - float: Scan duration in milliseconds
                - List[str]: Any non-fatal engine warnings or error strings
                - Optional[str]: Engine version string
                - str: Resolved rule configuration identifier
        """
        pass
