import asyncio
import time
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.logging import logger
from app.models.schemas import (
    SeverityLevel,
    Vulnerability,
    WorkspaceAnalysisRequest,
    WorkspaceSecurityReport,
)
from app.services.codebase_analyzer import CodebaseAnalyzer, get_codebase_analyzer
from app.services.security_analyzer import SecurityAnalyzer, get_security_analyzer

router = APIRouter(prefix="/api/workspace", tags=["Workspace"])


@router.post("/analyze", response_model=WorkspaceSecurityReport, status_code=status.HTTP_200_OK)
async def analyze_workspace(
    request: WorkspaceAnalysisRequest,
    analyzer: CodebaseAnalyzer = Depends(get_codebase_analyzer),
    security_analyzer: SecurityAnalyzer = Depends(get_security_analyzer)
) -> WorkspaceSecurityReport:
    """
    Perform deep workspace analysis:
    1. Discovers project metadata (languages, frameworks, dependencies, test frameworks).
    2. Runs static security analysis on all discovered source files.
    3. Aggregates findings and calculates security health metrics.
    """
    start_time = time.time()
    workspace_root = Path(request.workspacePath).resolve()

    if not workspace_root.exists() or not workspace_root.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Workspace path '{request.workspacePath}' does not exist or is not a directory."
        )

    try:
        logger.info("Analyzing workspace: %s", workspace_root)

        # Step 1: Discover metadata and relevant source files
        project_meta, source_files = analyzer.analyze_workspace(
            workspace_root, max_files=request.maxFiles or 200
        )

        all_vulnerabilities: List[Vulnerability] = []
        all_warnings: List[str] = []

        # Step 2: Run static security scanner on analyzable source files
        for file_path in source_files:
            try:
                code_text = file_path.read_text(encoding="utf-8", errors="ignore")
                rel_path = file_path.relative_to(workspace_root).as_posix()
                ext = file_path.suffix.lower()

                lang = "python" if ext == ".py" else ("javascript" if ext in (".js", ".jsx") else "typescript")

                vulns, _, warnings, _, _ = await asyncio.to_thread(
                    security_analyzer.scan_code,
                    code=code_text,
                    file_path=rel_path,
                    language=lang,
                    rules_config=request.ruleset or "auto"
                )

                all_vulnerabilities.extend(vulns)
                if warnings:
                    all_warnings.extend(warnings)

            except Exception as fe:
                logger.warning("Failed to scan file %s: %s", file_path, fe)

        # Step 3: Compute severity metrics and security health score
        critical_count = sum(1 for v in all_vulnerabilities if v.severity == SeverityLevel.CRITICAL)
        high_count = sum(1 for v in all_vulnerabilities if v.severity == SeverityLevel.HIGH)
        medium_count = sum(1 for v in all_vulnerabilities if v.severity == SeverityLevel.MEDIUM)
        low_count = sum(1 for v in all_vulnerabilities if v.severity in (SeverityLevel.LOW, SeverityLevel.INFO))

        # Health score formula: 100 - (Crit*25 + High*15 + Med*5 + Low*1)
        penalty = (critical_count * 25) + (high_count * 15) + (medium_count * 5) + (low_count * 1)
        health_score = max(0, 100 - penalty)

        duration_ms = (time.time() - start_time) * 1000

        return WorkspaceSecurityReport(
            success=True,
            project=project_meta,
            vulnerabilities=all_vulnerabilities,
            criticalCount=critical_count,
            highCount=high_count,
            mediumCount=medium_count,
            lowCount=low_count,
            totalFindings=len(all_vulnerabilities),
            scanDurationMs=round(duration_ms, 2),
            securityHealthScore=health_score,
            warnings=list(set(all_warnings))
        )

    except Exception as e:
        logger.exception("Workspace analysis failed: %s", e)
        duration_ms = (time.time() - start_time) * 1000
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error analyzing workspace: {str(e)}"
        )
