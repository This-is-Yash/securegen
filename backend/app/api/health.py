from fastapi import APIRouter
from pydantic import BaseModel
from app.core.config import settings

router = APIRouter(tags=["Health"])


class HealthResponse(BaseModel):
    status: str
    version: str
    service: str
    environment: str


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Service health check endpoint to verify backend operational readiness.
    """
    return HealthResponse(
        status="healthy",
        version=settings.app_version,
        service="secure-coding-backend",
        environment=settings.app_env,
    )
