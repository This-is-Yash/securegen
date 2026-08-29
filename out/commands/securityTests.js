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
exports.generateSecurityTestsCommand = generateSecurityTestsCommand;
exports.runSecurityTestsCommand = runSecurityTestsCommand;
exports.verifySecurityCommand = verifySecurityCommand;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
const validation_1 = require("../utils/validation");
async function generateSecurityTestsCommand(backendService, diagnosticManager, args) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('SecureGen: Open a file containing a security finding to generate tests.');
        return undefined;
    }
    const document = editor.document;
    const diagnostics = diagnosticManager.getDiagnostics(document.uri);
    if (diagnostics.length === 0) {
        vscode.window.showInformationMessage('SecureGen: No active vulnerabilities in this file to generate tests for. Scan first.');
        return undefined;
    }
    let targetPos = editor.selection.active;
    if (args && args.position) {
        targetPos = new vscode.Position(args.position.line, args.position.character);
    }
    const targetDiag = diagnostics.find((d) => d.range.contains(targetPos)) || diagnostics[0];
    const vuln = targetDiag.vulnerability || {
        id: typeof targetDiag.code === 'string' ? targetDiag.code : targetDiag.code?.value || 'security-finding',
        type: 'vulnerability',
        severity: 'HIGH',
        cwe: targetDiag.message.match(/CWE-\d+/)?.[0] || 'CWE-UNKNOWN',
        message: targetDiag.message,
        file: document.uri.fsPath,
        startLine: targetDiag.range.start.line + 1,
        endLine: targetDiag.range.end.line + 1,
        source: 'semgrep',
        snippet: document.getText(targetDiag.range)
    };
    const surroundingCode = document.getText(targetDiag.range);
    const lang = (0, validation_1.normalizeLanguageId)(document.languageId);
    const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const request = {
        vulnerability: vuln,
        language: lang,
        surroundingCode: surroundingCode,
        projectRoot: rootPath
    };
    let generatedTests;
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `SecureGen: Generating automated security tests for ${vuln.cwe}...`,
        cancellable: false
    }, async () => {
        logger_1.Logger.info(`Generating security tests for ${vuln.id}`);
        const response = await backendService.generateSecurityTests(request);
        if (!response.success || response.tests.length === 0) {
            vscode.window.showErrorMessage(`SecureGen: Test generation failed - ${response.errorMessage || 'No tests produced.'}`);
            return;
        }
        generatedTests = response.tests;
        const firstTest = response.tests[0];
        // Offer to save or open the generated test
        const doc = await vscode.workspace.openTextDocument({
            content: firstTest.testCode,
            language: lang
        });
        await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
        vscode.window.showInformationMessage(`🧪 Generated ${response.tests.length} security test(s) using ${firstTest.framework}! Saved preview.`);
    });
    return generatedTests;
}
async function runSecurityTestsCommand(backendService, testToRun) {
    const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    let targetTest = testToRun;
    if (!targetTest) {
        vscode.window.showInformationMessage('SecureGen: Please select a vulnerability or generate a test first to run.');
        return;
    }
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `SecureGen: Safely executing security test ${targetTest.testName}...`,
        cancellable: false
    }, async () => {
        const req = {
            test: targetTest,
            projectRoot: rootPath
        };
        const result = await backendService.executeSecurityTest(req);
        if (result.status === 'PASS') {
            vscode.window.showInformationMessage(`✅ Security Test PASSED: ${targetTest.testName} (${result.durationMs}ms)`);
        }
        else if (result.status === 'FAIL') {
            vscode.window.showWarningMessage(`⚠️ Security Test FAILED (Vulnerability Reproduced): ${targetTest.testName}\n${result.stderr || result.stdout}`);
        }
        else {
            vscode.window.showErrorMessage(`❌ Security Test Error (${result.status}): ${result.errorMessage || result.stderr}`);
        }
    });
}
async function verifySecurityCommand(backendService, diagnosticManager) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('SecureGen: Open a remediated file to verify.');
        return;
    }
    const document = editor.document;
    const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const lang = (0, validation_1.normalizeLanguageId)(document.languageId);
    const currentCode = document.getText();
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `SecureGen: Executing Full Security Verification Loop...`,
        cancellable: false
    }, async () => {
        logger_1.Logger.info(`Executing verification loop for ${document.fileName}`);
        const req = {
            filePath: document.uri.fsPath,
            originalCode: currentCode,
            remediatedCode: currentCode,
            language: lang,
            vulnerabilityId: 'verification-check',
            projectRoot: rootPath
        };
        const report = await backendService.verifyRemediation(req);
        if (report.status === 'SECURE_VERIFIED') {
            diagnosticManager.clearFileDiagnostics(document.uri);
            vscode.window.showInformationMessage(`🛡️ SECURITY VERIFIED: 0 residual vulnerabilities. All checks passed!`);
        }
        else if (report.status === 'VULNERABILITIES_REMAIN') {
            vscode.window.showErrorMessage(`⚠️ Verification Failed: ${report.summaryMessage}`);
        }
        else if (report.status === 'TESTS_FAILED') {
            vscode.window.showWarningMessage(`⚠️ Static scan passed, but regression tests failed: ${report.summaryMessage}`);
        }
        else {
            vscode.window.showInformationMessage(`ℹ️ Verification status: ${report.status} - ${report.summaryMessage}`);
        }
    });
}
//# sourceMappingURL=securityTests.js.map