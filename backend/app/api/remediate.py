import asyncio
from fastapi import APIRouter, Depends, HTTPException, status
from app.models.schemas import RemediationRequest, RemediationResponse
from app.services.llm_service import LLMService, get_llm_service
from app.core.logging import logger

router = APIRouter(prefix="/api", tags=["Remediation"])


@router.post("/remediate", response_model=RemediationResponse, status_code=status.HTTP_200_OK)
async def remediate_vulnerability(
    request: RemediationRequest,
    llm_service: LLMService = Depends(get_llm_service)
) -> RemediationResponse:
    """
    Generate an AI-powered secure code remediation for a detected vulnerability.
    """
    try:
        logger.info(
            "Received remediation request for finding '%s' (%s, %s)",
            request.vulnerability.id,
            request.vulnerability.cwe,
            request.language
        )
        response = await llm_service.generate_remediation(request)
        return response
    except TimeoutError as exc:
        logger.error("LLM remediation timed out: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail=f"Remediation generation timed out: {str(exc)}"
        )
    except Exception as exc:
        logger.exception("Failed to generate vulnerability remediation: %s", exc)
        return RemediationResponse(
            success=False,
            vulnerabilityId=request.vulnerability.id,
            originalSnippet=request.surroundingCode,
            fixedCode=request.surroundingCode,
            explanation=f"Internal service error: {str(exc)}",
            errorMessage=str(exc)
        )
