import asyncio
from fastapi import APIRouter, Depends, HTTPException, status
from app.models.schemas import ScanRequest, ScanResponse
from app.services.security_analyzer import SecurityAnalyzer, get_security_analyzer
from app.core.logging import logger

router = APIRouter(prefix="/api", tags=["Analysis"])


@router.post("/analyze", response_model=ScanResponse, status_code=status.HTTP_200_OK)
async def analyze_code(
    request: ScanRequest,
    analyzer: SecurityAnalyzer = Depends(get_security_analyzer)
) -> ScanResponse:
    """
    Analyze code snippet or file for security vulnerabilities using the registered static analysis engines.
    """
    try:
        logger.info("Received scan request for %s (%s)", request.filePath, request.language)
        # Execute blocking static scan in separate thread to prevent event loop starvation
        vulnerabilities, duration_ms, warnings, engine_version, rules_config = (
            await asyncio.to_thread(
                analyzer.scan_code,
                code=request.code,
                file_path=request.filePath,
                language=request.language,
                rules_config=request.ruleset,
            )
        )
        return ScanResponse(
            success=True,
            vulnerabilities=vulnerabilities,
            scannedFile=request.filePath,
            language=request.language,
            scanDurationMs=round(duration_ms, 2),
            totalFindings=len(vulnerabilities),
            errorMessage=None,
            engineVersion=engine_version,
            rulesConfig=rules_config,
            warnings=warnings if warnings else [],
        )
    except TimeoutError as exc:
        logger.error("Scan timed out: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail=str(exc),
        )
    except Exception as exc:
        logger.exception("Unexpected error during static analysis: %s", exc)
        return ScanResponse(
            success=False,
            vulnerabilities=[],
            scannedFile=request.filePath,
            language=request.language,
            scanDurationMs=0.0,
            totalFindings=0,
            errorMessage=f"Internal scanning error: {str(exc)}",
        )
