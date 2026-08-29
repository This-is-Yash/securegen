import asyncio
from fastapi import APIRouter, Depends, HTTPException, status
from app.models.schemas import GenerationRequest, GenerationResponse
from app.services.llm_service import LLMService, get_llm_service
from app.services.security_analyzer import SecurityAnalyzer, get_security_analyzer
from app.core.logging import logger

router = APIRouter(prefix="/api", tags=["Generation"])


@router.post("/generate", response_model=GenerationResponse, status_code=status.HTTP_200_OK)
async def generate_secure_code(
    request: GenerationRequest,
    llm_service: LLMService = Depends(get_llm_service),
    security_analyzer: SecurityAnalyzer = Depends(get_security_analyzer)
) -> GenerationResponse:
    """
    Generate security-hardened code and automatically perform post-generation static analysis.
    """
    try:
        logger.info("Received secure code generation request for prompt: '%s' (%s)", request.prompt[:50], request.language)
        response = await llm_service.generate_secure_code(request)

        # Self-Verification: Automatically run static security scan on AI-generated code
        if response.success and response.generatedCode:
            vulnerabilities, _, _, _, _ = await asyncio.to_thread(
                security_analyzer.scan_code,
                code=response.generatedCode,
                file_path=f"generated_{request.language}.tmp",
                language=request.language
            )

            if vulnerabilities:
                logger.warning(
                    "Self-Verification detected %d security issue(s) in AI-generated code. Flagging in response.",
                    len(vulnerabilities)
                )
                response.securityControls.append(
                    f"⚠️ Self-Audit Warning: {len(vulnerabilities)} potential finding(s) detected during automated review."
                )

        return response
    except TimeoutError as exc:
        logger.error("Code generation timed out: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail=f"Code generation timed out: {str(exc)}"
        )
    except Exception as exc:
        logger.exception("Failed to generate secure code: %s", exc)
        return GenerationResponse(
            success=False,
            generatedCode="",
            securityAssurance=f"Internal service error: {str(exc)}",
            errorMessage=str(exc)
        )
