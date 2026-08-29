import * as vscode from 'vscode';
import { BackendService } from '../services/backendService';
import { DiagnosticManager } from '../diagnostics/diagnosticManager';
import {
    GeneratedSecurityTest,
    TestGenerationRequest,
    TestExecutionRequest,
    VerificationRequest,
    Vulnerability
} from '../types/vulnerability';
import { Logger } from '../utils/logger';
import { normalizeLanguageId } from '../utils/validation';

export async function generateSecurityTestsCommand(
    backendService: BackendService,
    diagnosticManager: DiagnosticManager,
    args?: any
): Promise<GeneratedSecurityTest[] | undefined> {
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

    const vuln: Vulnerability = (targetDiag as any).vulnerability || {
        id: typeof targetDiag.code === 'string' ? targetDiag.code : (targetDiag.code as any)?.value || 'security-finding',
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
    const lang = normalizeLanguageId(document.languageId);
    const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const request: TestGenerationRequest = {
        vulnerability: vuln,
        language: lang,
        surroundingCode: surroundingCode,
        projectRoot: rootPath
    };

    let generatedTests: GeneratedSecurityTest[] | undefined;

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `SecureGen: Generating automated security tests for ${vuln.cwe}...`,
            cancellable: false
        },
        async () => {
            Logger.info(`Generating security tests for ${vuln.id}`);
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

            vscode.window.showInformationMessage(
                `🧪 Generated ${response.tests.length} security test(s) using ${firstTest.framework}! Saved preview.`
            );
        }
    );

    return generatedTests;
}

export async function runSecurityTestsCommand(
    backendService: BackendService,
    testToRun?: GeneratedSecurityTest
): Promise<void> {
    const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    let targetTest = testToRun;
    if (!targetTest) {
        vscode.window.showInformationMessage('SecureGen: Please select a vulnerability or generate a test first to run.');
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `SecureGen: Safely executing security test ${targetTest.testName}...`,
            cancellable: false
        },
        async () => {
            const req: TestExecutionRequest = {
                test: targetTest!,
                projectRoot: rootPath
            };

            const result = await backendService.executeSecurityTest(req);

            if (result.status === 'PASS') {
                vscode.window.showInformationMessage(`✅ Security Test PASSED: ${targetTest!.testName} (${result.durationMs}ms)`);
            } else if (result.status === 'FAIL') {
                vscode.window.showWarningMessage(`⚠️ Security Test FAILED (Vulnerability Reproduced): ${targetTest!.testName}\n${result.stderr || result.stdout}`);
            } else {
                vscode.window.showErrorMessage(`❌ Security Test Error (${result.status}): ${result.errorMessage || result.stderr}`);
            }
        }
    );
}

export async function verifySecurityCommand(
    backendService: BackendService,
    diagnosticManager: DiagnosticManager
): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('SecureGen: Open a remediated file to verify.');
        return;
    }

    const document = editor.document;
    const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const lang = normalizeLanguageId(document.languageId);
    const currentCode = document.getText();

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `SecureGen: Executing Full Security Verification Loop...`,
            cancellable: false
        },
        async () => {
            Logger.info(`Executing verification loop for ${document.fileName}`);

            const req: VerificationRequest = {
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
            } else if (report.status === 'VULNERABILITIES_REMAIN') {
                vscode.window.showErrorMessage(`⚠️ Verification Failed: ${report.summaryMessage}`);
            } else if (report.status === 'TESTS_FAILED') {
                vscode.window.showWarningMessage(`⚠️ Static scan passed, but regression tests failed: ${report.summaryMessage}`);
            } else {
                vscode.window.showInformationMessage(`ℹ️ Verification status: ${report.status} - ${report.summaryMessage}`);
            }
        }
    );
}
