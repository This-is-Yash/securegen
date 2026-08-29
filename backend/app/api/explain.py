import asyncio
from fastapi import APIRouter, Depends, HTTPException, status
from app.models.schemas import ExplanationRequest, ExplanationResponse
from app.services.llm_service import LLMService, get_llm_service
from app.core.logging import logger

router = APIRouter(prefix="/api", tags=["Explanation"])


@router.post("/explain", response_model=ExplanationResponse, status_code=status.HTTP_200_OK)
async def explain_vulnerability(
    request: ExplanationRequest,
    llm_service: LLMService = Depends(get_llm_service)
) -> ExplanationResponse:
    """
    Generate an AI-powered security explanation for a detected vulnerability.
    """
    try:
        logger.info(
            "Received explanation request for finding '%s' (%s, %s)",
            request.vulnerability.id,
            request.vulnerability.cwe,
            request.language
        )
        response = await llm_service.explain_vulnerability(request)
        return response
    except TimeoutError as exc:
        logger.error("LLM explanation timed out: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail=f"Explanation generation timed out: {str(exc)}"
        )
    except Exception as exc:
        logger.exception("Failed to generate vulnerability explanation: %s", exc)
        return ExplanationResponse(
            success=False,
            vulnerabilityId=request.vulnerability.id,
            title="Explanation Failed",
            explanation=f"Internal service error: {str(exc)}",
            rootCause="Unknown",
            attackVector="Unknown",
            preventionStrategy="Follow standard defensive coding guidelines.",
            errorMessage=str(exc)
        )
