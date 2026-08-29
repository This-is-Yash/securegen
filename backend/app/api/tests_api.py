import asyncio
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.logging import logger
from app.models.schemas import (
    TestExecutionRequest,
    TestExecutionResponse,
    TestGenerationRequest,
    TestGenerationResponse,
    VerificationReport,
    VerificationRequest,
)
from app.services.llm_service import LLMService, get_llm_service
from app.services.security_analyzer import SecurityAnalyzer, get_security_analyzer
from app.services.test_engine import (
    SafeTestExecutor,
    SecurityTestGenerator,
    VerificationService,
)

router = APIRouter(prefix="/api", tags=["Security Tests & Verification"])

# Dependencies
def get_test_generator(llm_service: LLMService = Depends(get_llm_service)) -> SecurityTestGenerator:
    return SecurityTestGenerator(llm_service=llm_service)


def get_test_executor() -> SafeTestExecutor:
    return SafeTestExecutor()


def get_verification_service(
    analyzer: SecurityAnalyzer = Depends(get_security_analyzer),
    executor: SafeTestExecutor = Depends(get_test_executor)
) -> VerificationService:
    return VerificationService(analyzer=analyzer, executor=executor)


@router.post("/tests/generate", response_model=TestGenerationResponse, status_code=status.HTTP_200_OK)
async def generate_security_tests(
    request: TestGenerationRequest,
    generator: SecurityTestGenerator = Depends(get_test_generator)
) -> TestGenerationResponse:
    """
    Generate targeted, non-destructive security regression tests tailored to the detected framework and vulnerability.
    """
    try:
        logger.info(
            "Generating security tests for %s (%s) in %s",
            request.vulnerability.id,
            request.vulnerability.cwe,
            request.language
        )
        response = await generator.generate_tests_for_vulnerability(request)
        return response
    except Exception as e:
        logger.exception("Failed to generate security tests: %s", e)
        return TestGenerationResponse(
            success=False,
            tests=[],
            testFramework=request.testFramework or "generic",
            errorMessage=str(e)
        )


@router.post("/tests/execute", response_model=TestExecutionResponse, status_code=status.HTTP_200_OK)
async def execute_security_test(
    request: TestExecutionRequest,
    executor: SafeTestExecutor = Depends(get_test_executor)
) -> TestExecutionResponse:
    """
    Execute a generated security regression test safely in a controlled, isolated runner.
    """
    try:
        logger.info("Safely executing security test '%s'", request.test.testName)
        response = await executor.execute_test(request)
        return response
    except Exception as e:
        logger.exception("Error during security test execution: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Execution error: {str(e)}"
        )


@router.post("/verify", response_model=VerificationReport, status_code=status.HTTP_200_OK)
async def verify_security_remediation(
    request: VerificationRequest,
    verifier: VerificationService = Depends(get_verification_service)
) -> VerificationReport:
    """
    Complete Verification Loop:
    1. Static analysis re-scan of remediated code.
    2. Regression test execution.
    3. Final verification status determination (SECURE_VERIFIED | VULNERABILITIES_REMAIN | TESTS_FAILED).
    """
    try:
        logger.info("Running complete verification for finding '%s'", request.vulnerabilityId)
        report = await verifier.verify_remediation(request)
        return report
    except Exception as e:
        logger.exception("Verification loop error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Verification failure: {str(e)}"
        )
