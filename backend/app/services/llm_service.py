import json
import logging
import re
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
import httpx

from app.core.config import settings
from app.core.prompts import (
    EXPLANATION_SYSTEM_PROMPT,
    EXPLANATION_USER_PROMPT_TEMPLATE,
    REMEDIATION_SYSTEM_PROMPT,
    REMEDIATION_USER_PROMPT_TEMPLATE,
    GENERATION_SYSTEM_PROMPT,
    GENERATION_USER_PROMPT_TEMPLATE,
    TEST_GENERATION_SYSTEM_PROMPT,
    TEST_GENERATION_USER_PROMPT_TEMPLATE,
)
from app.models.schemas import (
    ExplanationRequest,
    ExplanationResponse,
    RemediationRequest,
    RemediationResponse,
    GenerationRequest,
    GenerationResponse,
    TestGenerationRequest,
    TestGenerationResponse,
)

logger = logging.getLogger("llm_service")


def extract_json_payload(raw_text: str) -> Dict[str, Any]:
    """Extract and parse a JSON dictionary from an LLM response string."""
    text = raw_text.strip()

    # Handle markdown ```json code blocks
    json_block = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if json_block:
        text = json_block.group(1).strip()

    # Extract outermost { ... }
    start_idx = text.find("{")
    end_idx = text.rfind("}")
    if start_idx != -1 and end_idx != -1:
        text = text[start_idx : end_idx + 1]

    return json.loads(text)


class BaseLLMProvider(ABC):
    """Abstract interface for LLM backends."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @abstractmethod
    async def generate_json(self, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
        pass



def request_from_prompt_sql_fix(prompt: str) -> str:
    """Apply a conservative SQLite-style parameterization to the supplied demo code."""
    match = re.search(
        r'query\s*=\s*"([^"]*)\'\s*\+\s*username\s*\+\s*\'"',
        prompt,
        flags=re.IGNORECASE,
    )
    if match:
        query_body = match.group(1)
        fixed = f'query = "{query_body}?"\n\n    return conn.execute(query, (username,)).fetchall()'
        # Preserve the function/import context from the prompt when available.
        code_match = re.search(r'```python\s*(.*?)```', prompt, flags=re.DOTALL | re.IGNORECASE)
        if code_match:
            code = code_match.group(1).strip()
            code = re.sub(
                r'query\s*=\s*"[^"]*"\s*\+\s*username\s*\+\s*"[^"]*"',
                f'query = "{query_body}?"',
                code,
                count=1,
            )
            code = re.sub(
                r'return\s+conn\.execute\(query\)\.fetchall\(\)',
                'return conn.execute(query, (username,)).fetchall()',
                code,
                count=1,
            )
            return code
        return fixed
    return "query = \"SELECT * FROM users WHERE username = ?\"\nreturn conn.execute(query, (username,)).fetchall()"

class MockLLMProvider(BaseLLMProvider):
    """
    Deterministic mock provider for offline development, automated testing,
    and environments without external LLM API access.
    """

    @property
    def provider_name(self) -> str:
        return "mock"

    async def generate_json(self, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
        prompt_lower = user_prompt.lower()

        # Vulnerability Explanation Mocking
        if "analyze the following security vulnerability" in prompt_lower:
            cwe_match = re.search(r"cwe-(\d+)", prompt_lower)
            cwe_id = f"CWE-{cwe_match.group(1)}" if cwe_match else "CWE-UNKNOWN"
            cwe_num = cwe_match.group(1) if cwe_match else "0"

            return {
                "title": f"Security Vulnerability: {cwe_id} Detected",
                "explanation": "The code dynamically interpolates untrusted inputs into an execution context without proper parameterization or sanitization.",
                "rootCause": "Direct string concatenation or formatting allows malicious payloads to alter the intended control flow or query structure.",
                "attackVector": "An adversary can supply specially crafted inputs containing syntax delimiters to break out of data boundaries and execute arbitrary commands or queries.",
                "preventionStrategy": "Always use strongly-typed parameter binding, input validation with strict allowlists, and safe standard library APIs.",
                "cweInfo": {
                    "cweId": cwe_id,
                    "description": f"Standard taxonomy and defense recommendations for {cwe_id}.",
                    "mitreUrl": f"https://cwe.mitre.org/data/definitions/{cwe_num}.html"
                }
            }

        # Remediation Mocking
        if "remediate the following security vulnerability" in prompt_lower:
            if "cwe-89" in prompt_lower:
                # Deterministic offline remediation for the bundled demo/test path.
                fixed = request_from_prompt_sql_fix(user_prompt)
                explanation = "Replaced dynamic SQL construction with a parameterized query and bound the user input as data."
            elif "cwe-78" in prompt_lower:
                fixed = "subprocess.run(['ping', host_ip], check=True)"
                explanation = "Replaced shell string concatenation with subprocess array execution to prevent shell expansion."
            else:
                fixed = "// Remediated secure implementation\n// Applied parameterization and input validation"
                explanation = "Applied secure defensive coding pattern to neutralize untrusted input."

            return {
                "fixedCode": fixed,
                "explanation": explanation
            }

        # Test Generation Mocking
        if "generate an automated security regression test" in prompt_lower:
            return {
                "testName": "test_security_regression_defense",
                "targetFunction": "target_function",
                "testFilePath": "tests/security/test_regression.py",
                "testCode": "import unittest\n\nclass TestSecurity(unittest.TestCase):\n    def test_defense(self):\n        self.assertTrue(True)\n",
                "safetyRationale": "Non-destructive assertion test against mock fixtures."
            }

        # Code Generation Mocking
        return {
            "generatedCode": "def execute_task(param: str) -> dict:\n    \"\"\"Securely processes parameter with strict validation.\"\"\"\n    if not param or not param.isalnum():\n        raise ValueError('Invalid parameter: alphanumeric required')\n    return {'status': 'success', 'data': param}",
            "securityAssurance": "Implemented strict input validation (alphanumeric check), type hints, defensive error handling, and parameterized data return.",
            "securityControls": [
                "Strict alphanumeric input validation",
                "No dynamic code evaluation or subprocess shell execution",
                "Defensive error handling and type safety"
            ]
        }


class OpenAICompatibleProvider(BaseLLMProvider):
    """Supports OpenAI, Groq, DeepSeek, LocalAI, vLLM, and any OpenAI-compatible API."""

    def __init__(self, api_key: str, base_url: str, model: str):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model

    @property
    def provider_name(self) -> str:
        return "openai"

    async def generate_json(self, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": settings.llm_temperature,
            "response_format": {"type": "json_object"}
        }

        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            return extract_json_payload(content)


class OllamaProvider(BaseLLMProvider):
    """Supports local self-hosted models via Ollama."""

    def __init__(self, base_url: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model

    @property
    def provider_name(self) -> str:
        return "ollama"

    async def generate_json(self, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
        url = f"{self.base_url}/api/chat"
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "stream": False,
            "format": "json",
            "options": {"temperature": settings.llm_temperature}
        }

        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            content = data["message"]["content"]
            return extract_json_payload(content)


class LLMService:
    """
    High-level orchestrator for AI-powered security explanation, remediation,
    secure code generation, and automated security test generation.
    """

    def __init__(self, provider: Optional[BaseLLMProvider] = None):
        self.provider = provider or self._init_provider()

    def _init_provider(self) -> BaseLLMProvider:
        p_name = settings.llm_provider.lower()
        if p_name == "openai" and settings.openai_api_key:
            return OpenAICompatibleProvider(
                api_key=settings.openai_api_key,
                base_url=settings.openai_base_url,
                model=settings.llm_model or "gpt-4o"
            )
        elif p_name == "ollama":
            return OllamaProvider(
                base_url=settings.ollama_base_url,
                model=settings.llm_model or "codellama"
            )
        else:
            return MockLLMProvider()

    async def explain_vulnerability(self, request: ExplanationRequest) -> ExplanationResponse:
        start_time = time.time()
        vuln = request.vulnerability
        cwe_num = vuln.cwe.replace("CWE-", "").strip()

        user_prompt = EXPLANATION_USER_PROMPT_TEMPLATE.format(
            language=request.language,
            rule_id=vuln.id,
            vulnerability_type=vuln.type,
            cwe=vuln.cwe,
            cwe_number=cwe_num,
            severity=vuln.severity.value,
            message=vuln.message,
            file_path=vuln.file,
            start_line=vuln.startLine,
            end_line=vuln.endLine,
            snippet=vuln.snippet or "N/A",
            surrounding_code=request.surroundingCode or vuln.snippet or "N/A"
        )

        try:
            raw_data = await self.provider.generate_json(
                system_prompt=EXPLANATION_SYSTEM_PROMPT,
                user_prompt=user_prompt
            )
            duration_ms = (time.time() - start_time) * 1000

            return ExplanationResponse(
                success=True,
                vulnerabilityId=vuln.id,
                title=raw_data.get("title", f"Security Finding: {vuln.cwe}"),
                explanation=raw_data.get("explanation", "Potential security issue detected."),
                rootCause=raw_data.get("rootCause", "Unsafe input handling."),
                attackVector=raw_data.get("attackVector", "Payload injection."),
                preventionStrategy=raw_data.get("preventionStrategy", "Use parameterized APIs."),
                cweInfo=raw_data.get("cweInfo", {"cweId": vuln.cwe}),
                provider=self.provider.provider_name,
                model=settings.llm_model,
                generationDurationMs=round(duration_ms, 2)
            )
        except Exception as exc:
            logger.exception("Failed to generate vulnerability explanation: %s", exc)
            duration_ms = (time.time() - start_time) * 1000
            return ExplanationResponse(
                success=False,
                vulnerabilityId=vuln.id,
                title="Explanation Unavailable",
                explanation=f"Error generating explanation: {str(exc)}",
                rootCause="Unknown",
                attackVector="Unknown",
                preventionStrategy="Follow general secure coding practices.",
                provider=self.provider.provider_name,
                model=settings.llm_model,
                generationDurationMs=round(duration_ms, 2),
                errorMessage=str(exc)
            )

    async def generate_remediation(self, request: RemediationRequest) -> RemediationResponse:
        start_time = time.time()
        vuln = request.vulnerability

        user_prompt = REMEDIATION_USER_PROMPT_TEMPLATE.format(
            language=request.language,
            vulnerability_type=vuln.type,
            cwe=vuln.cwe,
            severity=vuln.severity.value,
            message=vuln.message,
            surrounding_code=request.surroundingCode
        )

        try:
            raw_data = await self.provider.generate_json(
                system_prompt=REMEDIATION_SYSTEM_PROMPT,
                user_prompt=user_prompt
            )
            duration_ms = (time.time() - start_time) * 1000

            return RemediationResponse(
                success=True,
                vulnerabilityId=vuln.id,
                originalSnippet=request.surroundingCode,
                fixedCode=raw_data.get("fixedCode", "// No fix generated"),
                explanation=raw_data.get("explanation", "Applied security remediation."),
                provider=self.provider.provider_name,
                model=settings.llm_model,
                generationDurationMs=round(duration_ms, 2)
            )
        except Exception as exc:
            logger.exception("Failed to generate remediation: %s", exc)
            duration_ms = (time.time() - start_time) * 1000
            return RemediationResponse(
                success=False,
                vulnerabilityId=vuln.id,
                originalSnippet=request.surroundingCode,
                fixedCode=request.surroundingCode,
                explanation="Remediation failed.",
                provider=self.provider.provider_name,
                model=settings.llm_model,
                generationDurationMs=round(duration_ms, 2),
                errorMessage=str(exc)
            )

    async def generate_secure_code(self, request: GenerationRequest) -> GenerationResponse:
        start_time = time.time()
        constraints_str = "\n".join(f"- {c}" for c in (request.securityConstraints or [])) or "Standard OWASP Top 10 guidelines"

        user_prompt = GENERATION_USER_PROMPT_TEMPLATE.format(
            language=request.language,
            user_prompt=request.prompt,
            security_constraints=constraints_str,
            existing_context=request.existingContext or "N/A",
            framework_context=request.frameworkContext or "Standard application structure"
        )

        try:
            raw_data = await self.provider.generate_json(
                system_prompt=GENERATION_SYSTEM_PROMPT.format(language=request.language),
                user_prompt=user_prompt
            )
            duration_ms = (time.time() - start_time) * 1000

            return GenerationResponse(
                success=True,
                generatedCode=raw_data.get("generatedCode", ""),
                securityAssurance=raw_data.get("securityAssurance", "Secure patterns applied."),
                securityControls=raw_data.get("securityControls", []),
                provider=self.provider.provider_name,
                model=settings.llm_model,
                generationDurationMs=round(duration_ms, 2)
            )
        except Exception as exc:
            logger.exception("Failed to generate secure code: %s", exc)
            duration_ms = (time.time() - start_time) * 1000
            return GenerationResponse(
                success=False,
                generatedCode="",
                securityAssurance="Generation failed.",
                provider=self.provider.provider_name,
                model=settings.llm_model,
                generationDurationMs=round(duration_ms, 2),
                errorMessage=str(exc)
            )


# Dependency Provider
_global_llm_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    global _global_llm_service
    if _global_llm_service is None:
        _global_llm_service = LLMService()
    return _global_llm_service
