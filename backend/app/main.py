"""
GenAI-Assisted Secure Coding Extension - Backend Application
Complete Architecture: Static Analysis, Workspace Discovery, AI Explanation,
Automated Remediation, Security-Aware Generation, Test Generation & Full Verification Loop.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import setup_logging, logger
from app.core.errors import (
    SecurityAnalysisError,
    security_analysis_exception_handler,
    generic_exception_handler
)
from app.api.health import router as health_router
from app.api.analyze import router as analyze_router
from app.api.explain import router as explain_router
from app.api.remediate import router as remediate_router
from app.api.generate import router as generate_router
from app.api.workspace import router as workspace_router
from app.api.tests_api import router as tests_router

# Initialize structured logging
setup_logging()

# Create FastAPI application factory
app = FastAPI(
    title=settings.app_name,
    description="Modular backend service providing static analysis, workspace discovery, AI explanation, remediation, security-aware code generation, automated test generation, and full verification.",
    version=settings.app_version,
    debug=settings.debug,
)

# Configure CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Accept"],
)

# Register Custom Exception Handlers
app.add_exception_handler(SecurityAnalysisError, security_analysis_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# Register Modular Routers
app.include_router(health_router)
app.include_router(analyze_router)
app.include_router(explain_router)
app.include_router(remediate_router)
app.include_router(generate_router)
app.include_router(workspace_router)
app.include_router(tests_router)


@app.get("/", tags=["Root"])
async def root():
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": settings.app_env,
        "endpoints": {
            "health": "/health",
            "analyze": "/api/analyze",
            "workspace_analyze": "/api/workspace/analyze",
            "explain": "/api/explain",
            "remediate": "/api/remediate",
            "generate": "/api/generate",
            "generate_tests": "/api/tests/generate",
            "execute_tests": "/api/tests/execute",
            "verify": "/api/verify",
            "docs": "/docs",
        }
    }


@app.on_event("startup")
async def on_startup():
    logger.info("Secure Coding Backend started successfully in %s mode.", settings.app_env)
