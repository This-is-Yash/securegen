from enum import Enum
from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field


class SeverityLevel(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"


class VulnerabilitySource(str, Enum):
    SEMGREP = "semgrep"
    CUSTOM_RULE = "custom-rule"
    AI = "ai"


SupportedLanguage = Literal["python", "javascript", "typescript", "java", "go", "php", "ruby", "generic"]


class Vulnerability(BaseModel):
    id: str = Field(..., description="Unique rule/finding identifier")
    type: str = Field(..., description="Vulnerability category or rule name")
    severity: SeverityLevel = Field(..., description="Severity classification")
    cwe: str = Field(..., description="CWE classification (e.g. CWE-89)")
    message: str = Field(..., description="Human-readable description of the security issue")
    file: str = Field(..., description="Path or relative name of scanned file")
    startLine: int = Field(..., description="1-indexed starting line number")
    endLine: int = Field(..., description="1-indexed ending line number")
    source: VulnerabilitySource = Field(default=VulnerabilitySource.SEMGREP, description="Detection engine source")
    startColumn: Optional[int] = Field(None, description="Start column index")
    endColumn: Optional[int] = Field(None, description="End column index")
    snippet: Optional[str] = Field(None, description="Vulnerable code snippet")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional rule metadata")


class ScanRequest(BaseModel):
    code: str = Field(..., description="Source code text to analyze", max_length=524_288)
    filePath: str = Field(default="snippet", description="File path or virtual name")
    language: SupportedLanguage = Field(..., description="Programming language")
    ruleset: Optional[str] = Field(default="auto", description="Semgrep ruleset or path")


class ScanResponse(BaseModel):
    success: bool = True
    vulnerabilities: List[Vulnerability] = Field(default_factory=list)
    scannedFile: str
    language: str
    scanDurationMs: float
    totalFindings: int
    errorMessage: Optional[str] = None
    engineVersion: Optional[str] = Field(None, description="Semgrep engine version used for this scan")
    rulesConfig: Optional[str] = Field(None, description="Rules configuration used for this scan")
    warnings: Optional[List[str]] = Field(default_factory=list, description="Non-fatal warnings or engine errors")


# --- Workspace Discovery & Analysis Models ---

class ProjectMetadata(BaseModel):
    projectName: str = "Workspace"
    rootPath: str
    languages: List[str] = Field(default_factory=list)
    frameworks: List[str] = Field(default_factory=list)
    testFrameworks: List[str] = Field(default_factory=list)
    packageManagers: List[str] = Field(default_factory=list)
    dependencies: List[str] = Field(default_factory=list)
    totalFiles: int = 0
    analyzedFiles: int = 0
    ignoredFiles: int = 0
    entryPoints: List[str] = Field(default_factory=list)
    testDirectories: List[str] = Field(default_factory=list)
    securitySensitiveFiles: List[str] = Field(default_factory=list)


class WorkspaceAnalysisRequest(BaseModel):
    workspacePath: str = Field(..., description="Absolute path to workspace root")
    maxFiles: Optional[int] = Field(default=200, description="Max files to analyze")
    ruleset: Optional[str] = Field(default="auto", description="Ruleset to apply")


class WorkspaceSecurityReport(BaseModel):
    success: bool = True
    project: ProjectMetadata
    vulnerabilities: List[Vulnerability] = Field(default_factory=list)
    criticalCount: int = 0
    highCount: int = 0
    mediumCount: int = 0
    lowCount: int = 0
    totalFindings: int = 0
    scanDurationMs: float = 0.0
    securityHealthScore: int = 100  # 0-100
    errorMessage: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)


# --- Security Test Generation & Execution Models ---

class TestExecutionStatus(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    ERROR = "ERROR"
    NOT_EXECUTED = "NOT_EXECUTED"


class GeneratedSecurityTest(BaseModel):
    testId: str = Field(..., description="Unique test identifier")
    vulnerabilityId: str = Field(..., description="Target vulnerability ID")
    cwe: str = Field(..., description="Target CWE identifier")
    testName: str = Field(..., description="Descriptive test name")
    framework: str = Field(..., description="Test framework (pytest, jest, unittest, etc.)")
    targetFunction: Optional[str] = Field(None, description="Target function or module being tested")
    testCode: str = Field(..., description="Executable test source code")
    testFilePath: str = Field(..., description="Target path where test should reside (e.g. tests/security/...)")
    executionSupported: bool = True
    safetyRationale: str = Field(default="Runs against isolated test mocks/inputs", description="Safety assurance")
    executionStatus: TestExecutionStatus = Field(default=TestExecutionStatus.NOT_EXECUTED)
    executionOutput: Optional[str] = None
    executionDurationMs: float = 0.0


class TestGenerationRequest(BaseModel):
    vulnerability: Vulnerability
    language: str
    framework: Optional[str] = None
    testFramework: Optional[str] = None
    surroundingCode: Optional[str] = None
    projectRoot: Optional[str] = None


class TestGenerationResponse(BaseModel):
    success: bool = True
    tests: List[GeneratedSecurityTest] = Field(default_factory=list)
    testFramework: str
    provider: str = "mock"
    model: str = "mock-model"
    generationDurationMs: float = 0.0
    errorMessage: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)


class TestExecutionRequest(BaseModel):
    test: GeneratedSecurityTest
    projectRoot: str
    targetCode: Optional[str] = None


class TestExecutionResponse(BaseModel):
    testId: str
    status: TestExecutionStatus
    exitCode: int = 0
    stdout: str = ""
    stderr: str = ""
    durationMs: float = 0.0
    isReproduced: bool = Field(default=False, description="True if test reproduced the vulnerability before fix")
    errorMessage: Optional[str] = None


# --- Verification Loop Models ---

class VerificationStatus(str, Enum):
    SECURE_VERIFIED = "SECURE_VERIFIED"
    VULNERABILITIES_REMAIN = "VULNERABILITIES_REMAIN"
    TESTS_FAILED = "TESTS_FAILED"
    NOT_FULLY_VERIFIED = "NOT_FULLY_VERIFIED"


class VerificationRequest(BaseModel):
    filePath: str
    originalCode: str
    remediatedCode: str
    language: str
    vulnerabilityId: str
    generatedTests: Optional[List[GeneratedSecurityTest]] = Field(default_factory=list)
    projectRoot: Optional[str] = None


class VerificationReport(BaseModel):
    success: bool = True
    status: VerificationStatus
    staticAnalysisPassed: bool = False
    securityTestsPassed: bool = False
    residualVulnerabilities: List[Vulnerability] = Field(default_factory=list)
    testResults: List[TestExecutionResponse] = Field(default_factory=list)
    explanation: str = ""
    summaryMessage: str = ""


# --- LLM Explanation & Remediation Models ---

class ExplanationRequest(BaseModel):
    vulnerability: Vulnerability = Field(..., description="The detected vulnerability to explain")
    surroundingCode: Optional[str] = Field(None, description="Contextual source code surrounding the vulnerability")
    language: str = Field(..., description="Programming language")


class ExplanationResponse(BaseModel):
    success: bool = True
    vulnerabilityId: str
    title: str = Field(..., description="Concise summary title of the security risk")
    explanation: str = Field(..., description="Clear explanation of why this code is vulnerable")
    rootCause: str = Field(..., description="Technical root cause analysis")
    attackVector: str = Field(..., description="How an attacker could exploit this vulnerability")
    preventionStrategy: str = Field(..., description="Best practice guidance to prevent this flaw")
    cweInfo: Dict[str, str] = Field(default_factory=dict, description="CWE taxonomy and references")
    provider: str = Field(default="mock", description="LLM provider used")
    model: str = Field(default="mock-model", description="LLM model identifier")
    generationDurationMs: float = 0.0
    errorMessage: Optional[str] = None


class RemediationRequest(BaseModel):
    vulnerability: Vulnerability = Field(..., description="The vulnerability to remediate")
    surroundingCode: str = Field(..., description="Original source code block")
    language: str = Field(..., description="Programming language")


class RemediationResponse(BaseModel):
    success: bool = True
    vulnerabilityId: str
    originalSnippet: str
    fixedCode: str = Field(..., description="Remediated, secure replacement code")
    explanation: str = Field(..., description="Why this fix resolves the vulnerability without breaking functionality")
    diff: Optional[str] = Field(None, description="Unified diff representation of changes")
    provider: str = Field(default="mock")
    model: str = Field(default="mock-model")
    generationDurationMs: float = 0.0
    errorMessage: Optional[str] = None


class GenerationRequest(BaseModel):
    prompt: str = Field(..., description="Natural language programming task or prompt")
    language: str = Field(..., description="Target programming language")
    securityConstraints: Optional[List[str]] = Field(default_factory=list, description="Specific security requirements to enforce")
    existingContext: Optional[str] = Field(None, description="Optional surrounding file context")
    frameworkContext: Optional[str] = Field(None, description="Project framework and dependency context")


class GenerationResponse(BaseModel):
    success: bool = True
    generatedCode: str = Field(..., description="Security-aware generated source code")
    securityAssurance: str = Field(..., description="Explanation of security patterns and defenses implemented")
    securityControls: List[str] = Field(default_factory=list, description="List of defensive controls applied")
    provider: str = Field(default="mock")
    model: str = Field(default="mock-model")
    generationDurationMs: float = 0.0
    errorMessage: Optional[str] = None
