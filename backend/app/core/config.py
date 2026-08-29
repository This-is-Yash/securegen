import os
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel, Field


class Settings(BaseModel):
    # App Information
    app_name: str = "Secure Coding Assistant API"
    app_version: str = "0.2.0"
    app_env: str = os.getenv("APP_ENV", "development")
    debug: bool = os.getenv("DEBUG", "False").lower() in ("true", "1", "yes")

    # Server Configuration
    host: str = os.getenv("HOST", "127.0.0.1")
    port: int = int(os.getenv("PORT", "8000"))

    # Security & CORS
    allowed_origins: List[str] = [
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "vscode-webview://*",
    ]

    # Scanner Configuration
    scan_timeout_seconds: int = int(os.getenv("SCAN_TIMEOUT_SEC", "30"))
    max_code_size_bytes: int = int(os.getenv("MAX_CODE_SIZE_BYTES", "524288"))  # 512 KB

    # LLM Configuration (Phase 9)
    llm_provider: str = os.getenv("LLM_PROVIDER", "mock")  # mock | openai | gemini | ollama
    llm_model: str = os.getenv("LLM_MODEL", "mock-security-model")
    llm_temperature: float = float(os.getenv("LLM_TEMPERATURE", "0.2"))
    llm_timeout_seconds: int = int(os.getenv("LLM_TIMEOUT_SEC", "45"))

    # Provider API Keys & Endpoints
    openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY", None)
    openai_base_url: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    gemini_api_key: Optional[str] = os.getenv("GEMINI_API_KEY", None)
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")

    # Path Resolution
    project_root: Path = Path(__file__).resolve().parent.parent.parent.parent
    rules_root: Path = project_root / "security-rules"
    temp_dir: Path = Path(__file__).resolve().parent.parent.parent / ".tmp"

    class Config:
        arbitrary_types_allowed = True


# Global settings singleton
settings = Settings()
