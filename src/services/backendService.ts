import * as http from 'http';
import * as https from 'https';
import * as vscode from 'vscode';
import {
    ScanRequest,
    ScanResponse,
    WorkspaceAnalysisRequest,
    WorkspaceSecurityReport,
    TestGenerationRequest,
    TestGenerationResponse,
    TestExecutionRequest,
    TestExecutionResponse,
    VerificationRequest,
    VerificationReport,
    ExplanationRequest,
    ExplanationResponse,
    RemediationRequest,
    RemediationResponse,
    GenerationRequest,
    GenerationResponse
} from '../types/vulnerability';
import { Logger } from '../utils/logger';
import { BackendManager } from './backendManager';

export class BackendService {
    private managedBaseUrl: string | undefined;

    constructor(private readonly backendManager?: BackendManager) {}

    public async ensureReady(context: vscode.ExtensionContext): Promise<boolean> {
        if (!this.backendManager) return true;
        const ready = await this.backendManager.start(context);
        if (ready) this.managedBaseUrl = this.backendManager.getBaseUrl();
        return ready;
    }

    private getBaseUrl(): string {
        if (this.managedBaseUrl) return this.managedBaseUrl;
        const config = vscode.workspace.getConfiguration('secureScan');
        return config.get<string>('backendUrl', 'http://127.0.0.1:8000');
    }

    public async checkHealth(): Promise<boolean> {
        try {
            const baseUrl = this.getBaseUrl();
            const url = new URL('/health', baseUrl);
            const response = await this.httpGet(url.toString());
            const data = JSON.parse(response);
            return data.status === 'healthy';
        } catch (error) {
            Logger.warn(`Backend health check failed: ${error}`);
            return false;
        }
    }

    public async scanCode(request: ScanRequest): Promise<ScanResponse> {
        const baseUrl = this.getBaseUrl();
        const url = new URL('/api/analyze', baseUrl);
        Logger.info(`Sending scan request to backend for ${request.filePath}`);

        try {
            const rawResponse = await this.httpPost(url.toString(), JSON.stringify(request));
            return JSON.parse(rawResponse);
        } catch (error) {
            Logger.error(`Scan request failed`, error);
            return {
                success: false,
                vulnerabilities: [],
                scannedFile: request.filePath,
                language: request.language,
                scanDurationMs: 0,
                totalFindings: 0,
                errorMessage: error instanceof Error ? error.message : String(error)
            };
        }
    }

    public async analyzeWorkspace(request: WorkspaceAnalysisRequest): Promise<WorkspaceSecurityReport> {
        const baseUrl = this.getBaseUrl();
        const url = new URL('/api/workspace/analyze', baseUrl);
        Logger.info(`Sending workspace analysis request for ${request.workspacePath}`);

        try {
            const rawResponse = await this.httpPost(url.toString(), JSON.stringify(request));
            return JSON.parse(rawResponse);
        } catch (error) {
            Logger.error(`Workspace analysis request failed`, error);
            return {
                success: false,
                project: {
                    projectName: 'Workspace',
                    rootPath: request.workspacePath,
                    languages: [],
                    frameworks: [],
                    testFrameworks: [],
                    packageManagers: [],
                    dependencies: [],
                    totalFiles: 0,
                    analyzedFiles: 0,
                    ignoredFiles: 0,
                    entryPoints: [],
                    testDirectories: [],
                    securitySensitiveFiles: []
                },
                vulnerabilities: [],
                criticalCount: 0,
                highCount: 0,
                mediumCount: 0,
                lowCount: 0,
                totalFindings: 0,
                scanDurationMs: 0,
                securityHealthScore: 0,
                errorMessage: error instanceof Error ? error.message : String(error),
                warnings: []
            };
        }
    }

    public async generateSecurityTests(request: TestGenerationRequest): Promise<TestGenerationResponse> {
        const baseUrl = this.getBaseUrl();
        const url = new URL('/api/tests/generate', baseUrl);
        Logger.info(`Requesting security test generation for ${request.vulnerability.id}`);

        try {
            const rawResponse = await this.httpPost(url.toString(), JSON.stringify(request));
            return JSON.parse(rawResponse);
        } catch (error) {
            Logger.error(`Test generation request failed`, error);
            return {
                success: false,
                tests: [],
                testFramework: request.testFramework || 'generic',
                errorMessage: String(error),
                warnings: []
            };
        }
    }

    public async executeSecurityTest(request: TestExecutionRequest): Promise<TestExecutionResponse> {
        const baseUrl = this.getBaseUrl();
        const url = new URL('/api/tests/execute', baseUrl);
        Logger.info(`Executing security test: ${request.test.testName}`);

        try {
            const rawResponse = await this.httpPost(url.toString(), JSON.stringify(request));
            return JSON.parse(rawResponse);
        } catch (error) {
            Logger.error(`Test execution failed`, error);
            return {
                testId: request.test.testId,
                status: 'ERROR',
                exitCode: 1,
                stdout: '',
                stderr: String(error),
                durationMs: 0,
                errorMessage: String(error)
            };
        }
    }

    public async verifyRemediation(request: VerificationRequest): Promise<VerificationReport> {
        const baseUrl = this.getBaseUrl();
        const url = new URL('/api/verify', baseUrl);
        Logger.info(`Verifying remediation for ${request.vulnerabilityId}`);

        try {
            const rawResponse = await this.httpPost(url.toString(), JSON.stringify(request));
            return JSON.parse(rawResponse);
        } catch (error) {
            Logger.error(`Verification request failed`, error);
            return {
                success: false,
                status: 'NOT_FULLY_VERIFIED',
                staticAnalysisPassed: false,
                securityTestsPassed: false,
                residualVulnerabilities: [],
                testResults: [],
                explanation: 'Backend error during verification loop.',
                summaryMessage: String(error)
            };
        }
    }

    public async explainVulnerability(request: ExplanationRequest): Promise<ExplanationResponse> {
        const baseUrl = this.getBaseUrl();
        const url = new URL('/api/explain', baseUrl);
        Logger.info(`Sending AI explanation request for ${request.vulnerability.id}`);

        try {
            const rawResponse = await this.httpPost(url.toString(), JSON.stringify(request));
            return JSON.parse(rawResponse);
        } catch (error) {
            Logger.error(`Explanation request failed`, error);
            return {
                success: false,
                vulnerabilityId: request.vulnerability.id,
                title: 'Explanation Request Failed',
                explanation: `Error contacting backend: ${error instanceof Error ? error.message : String(error)}`,
                rootCause: 'Connection error',
                attackVector: 'N/A',
                preventionStrategy: 'Ensure backend service is running.',
                provider: 'error',
                model: 'none',
                generationDurationMs: 0,
                errorMessage: String(error)
            };
        }
    }

    public async remediateVulnerability(request: RemediationRequest): Promise<RemediationResponse> {
        const baseUrl = this.getBaseUrl();
        const url = new URL('/api/remediate', baseUrl);
        Logger.info(`Sending AI remediation request for ${request.vulnerability.id}`);

        try {
            const rawResponse = await this.httpPost(url.toString(), JSON.stringify(request));
            return JSON.parse(rawResponse);
        } catch (error) {
            Logger.error(`Remediation request failed`, error);
            return {
                success: false,
                vulnerabilityId: request.vulnerability.id,
                originalSnippet: request.surroundingCode,
                fixedCode: request.surroundingCode,
                explanation: `Error contacting backend: ${error instanceof Error ? error.message : String(error)}`,
                provider: 'error',
                model: 'none',
                generationDurationMs: 0,
                errorMessage: String(error)
            };
        }
    }

    public async generateSecureCode(request: GenerationRequest): Promise<GenerationResponse> {
        const baseUrl = this.getBaseUrl();
        const url = new URL('/api/generate', baseUrl);
        Logger.info(`Sending secure code generation request for: "${request.prompt.slice(0, 40)}..."`);

        try {
            const rawResponse = await this.httpPost(url.toString(), JSON.stringify(request));
            return JSON.parse(rawResponse);
        } catch (error) {
            Logger.error(`Code generation request failed`, error);
            return {
                success: false,
                generatedCode: '',
                securityAssurance: `Error contacting backend: ${error instanceof Error ? error.message : String(error)}`,
                securityControls: [],
                provider: 'error',
                model: 'none',
                generationDurationMs: 0,
                errorMessage: String(error)
            };
        }
    }

    private httpGet(urlStr: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const url = new URL(urlStr);
            const client = url.protocol === 'https:' ? https : http;

            const req = client.get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', (err) => reject(err));
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Request timed out after 10s'));
            });
        });
    }

    private httpPost(urlStr: string, body: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const url = new URL(urlStr);
            const client = url.protocol === 'https:' ? https : http;

            const req = client.request(
                url,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(body)
                    }
                },
                (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(data);
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                        }
                    });
                }
            );

            req.on('error', (err) => reject(err));
            req.setTimeout(60000, () => {
                req.destroy();
                reject(new Error('Backend request timed out after 60s'));
            });

            req.write(body);
            req.end();
        });
    }
}
