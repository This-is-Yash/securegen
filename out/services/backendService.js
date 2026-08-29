"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendService = void 0;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
class BackendService {
    backendManager;
    managedBaseUrl;
    constructor(backendManager) {
        this.backendManager = backendManager;
    }
    async ensureReady(context) {
        if (!this.backendManager)
            return true;
        const ready = await this.backendManager.start(context);
        if (ready)
            this.managedBaseUrl = this.backendManager.getBaseUrl();
        return ready;
    }
    getBaseUrl() {
        if (this.managedBaseUrl)
            return this.managedBaseUrl;
        const config = vscode.workspace.getConfiguration('secureScan');
        return config.get('backendUrl', 'http://127.0.0.1:8000');
    }
    async checkHealth() {
        try {
            const baseUrl = this.getBaseUrl();
            const url = new URL('/health', baseUrl);
            const response = await this.httpGet(url.toString());
            const data = JSON.parse(response);
            return data.status === 'healthy';
        }
        catch (error) {
            logger_1.Logger.warn(`Backend health check failed: ${error}`);
            return false;
        }
    }
    async scanCode(request) {
        const baseUrl = this.getBaseUrl();
        const url = new URL('/api/analyze', baseUrl);
        logger_1.Logger.info(`Sending scan request to backend for ${request.filePath}`);
        try {
            const rawResponse = await this.httpPost(url.toString(), JSON.stringify(request));
            return JSON.parse(rawResponse);
        }
        catch (error) {
            logger_1.Logger.error(`Scan request failed`, error);
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
    async analyzeWorkspace(request) {
        const baseUrl = this.getBaseUrl();
        const url = new URL('/api/workspace/analyze', baseUrl);
        logger_1.Logger.info(`Sending workspace analysis request for ${request.workspacePath}`);
        try {
            const rawResponse = await this.httpPost(url.toString(), JSON.stringify(request));
            return JSON.parse(rawResponse);
        }
        catch (error) {
            logger_1.Logger.error(`Workspace analysis request failed`, error);
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
    async generateSecurityTests(request) {
        const baseUrl = this.getBaseUrl();
        const url = new URL('/api/tests/generate', baseUrl);
        logger_1.Logger.info(`Requesting security test generation for ${request.vulnerability.id}`);
        try {
            const rawResponse = await this.httpPost(url.toString(), JSON.stringify(request));
            return JSON.parse(rawResponse);
        }
        catch (error) {
            logger_1.Logger.error(`Test generation request failed`, error);
            return {
                success: false,
                tests: [],
                testFramework: request.testFramework || 'generic',
                errorMessage: String(error),
                warnings: []
            };
        }
    }
    async executeSecurityTest(request) {
        const baseUrl = this.getBaseUrl();
        const url = new URL('/api/tests/execute', baseUrl);
        logger_1.Logger.info(`Executing security test: ${request.test.testName}`);
        try {
            const rawResponse = await this.httpPost(url.toString(), JSON.stringify(request));
            return JSON.parse(rawResponse);
        }
        catch (error) {
            logger_1.Logger.error(`Test execution failed`, error);
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
    async verifyRemediation(request) {
        const baseUrl = this.getBaseUrl();
        const url = new URL('/api/verify', baseUrl);
        logger_1.Logger.info(`Verifying remediation for ${request.vulnerabilityId}`);
        try {
            const rawResponse = await this.httpPost(url.toString(), JSON.stringify(request));
            return JSON.parse(rawResponse);
        }
        catch (error) {
            logger_1.Logger.error(`Verification request failed`, error);
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
    async explainVulnerability(request) {
        const baseUrl = this.getBaseUrl();
        const url = new URL('/api/explain', baseUrl);
        logger_1.Logger.info(`Sending AI explanation request for ${request.vulnerability.id}`);
        try {
            const rawResponse = await this.httpPost(url.toString(), JSON.stringify(request));
            return JSON.parse(rawResponse);
        }
        catch (error) {
            logger_1.Logger.error(`Explanation request failed`, error);
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
    async remediateVulnerability(request) {
        const baseUrl = this.getBaseUrl();
        const url = new URL('/api/remediate', baseUrl);
        logger_1.Logger.info(`Sending AI remediation request for ${request.vulnerability.id}`);
        try {
            const rawResponse = await this.httpPost(url.toString(), JSON.stringify(request));
            return JSON.parse(rawResponse);
        }
        catch (error) {
            logger_1.Logger.error(`Remediation request failed`, error);
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
    async generateSecureCode(request) {
        const baseUrl = this.getBaseUrl();
        const url = new URL('/api/generate', baseUrl);
        logger_1.Logger.info(`Sending secure code generation request for: "${request.prompt.slice(0, 40)}..."`);
        try {
            const rawResponse = await this.httpPost(url.toString(), JSON.stringify(request));
            return JSON.parse(rawResponse);
        }
        catch (error) {
            logger_1.Logger.error(`Code generation request failed`, error);
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
    httpGet(urlStr) {
        return new Promise((resolve, reject) => {
            const url = new URL(urlStr);
            const client = url.protocol === 'https:' ? https : http;
            const req = client.get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    }
                    else {
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
    httpPost(urlStr, body) {
        return new Promise((resolve, reject) => {
            const url = new URL(urlStr);
            const client = url.protocol === 'https:' ? https : http;
            const req = client.request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    }
                    else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });
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
exports.BackendService = BackendService;
//# sourceMappingURL=backendService.js.map