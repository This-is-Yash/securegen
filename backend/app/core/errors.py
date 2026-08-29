from fastapi import Request, status
from fastapi.responses import JSONResponse
from app.core.logging import logger


class SecurityAnalysisError(Exception):
    """Base exception for static security analyzer errors."""
    def __init__(self, message: str, details: dict = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class ScannerExecutionError(SecurityAnalysisError):
    """Exception raised when an underlying static scanner crashes."""
    pass


class InvalidRulesetError(SecurityAnalysisError):
    """Exception raised when a requested ruleset is unauthorized or invalid."""
    pass


async def security_analysis_exception_handler(request: Request, exc: SecurityAnalysisError) -> JSONResponse:
    logger.error("SecurityAnalysisError: %s | URL: %s", exc.message, request.url)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error": "AnalysisError",
            "message": exc.message,
            "details": exc.details
        }
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled server error: %s | URL: %s", exc, request.url)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error": "InternalServerError",
            "message": "An unexpected error occurred during processing."
        }
    )
