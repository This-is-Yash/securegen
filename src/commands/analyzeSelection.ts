import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { isSupportedLanguage, normalizeLanguageId } from '../utils/validation';
import { ScannerService } from '../services/scannerService';
import { ScanResponse } from '../types/vulnerability';
import { DiagnosticManager } from '../diagnostics/diagnosticManager';

export async function analyzeSelectionCommand(
    scannerService: ScannerService,
    diagnosticManager: DiagnosticManager
): Promise<ScanResponse | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('SecureGen: No active editor found.');
        Logger.warn('Selection analysis aborted: No active editor found.');
        return null;
    }

    const document = editor.document;
    const rawLanguageId = document.languageId;
    const normalizedLang = normalizeLanguageId(rawLanguageId);

    if (!isSupportedLanguage(rawLanguageId)) {
        vscode.window.showWarningMessage(
            `SecureGen: Language "${rawLanguageId}" is not supported. Supported: Python, JavaScript, TypeScript.`
        );
        return null;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showInformationMessage('SecureGen: No code selected. Please highlight a snippet to analyze.');
        return null;
    }

    const selectedText = document.getText(selection);
    const fileName = document.fileName.split(/[\\/]/).pop() || document.fileName;
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;

    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `SecureGen: Analyzing selection in ${fileName} (L${startLine}-L${endLine})...`,
            cancellable: false
        },
        async () => {
            const result = await scannerService.scan({
                code: selectedText,
                filePath: `${fileName}#L${startLine}-L${endLine}`,
                language: normalizedLang
            });

            if (!result.success) {
                vscode.window.showErrorMessage(`SecureScan failed: ${result.errorMessage || 'Unknown error'}`);
                return result;
            }

            // Offset line numbers in vulnerabilities to match the selection location in the parent document
            const adjustedVulns = result.vulnerabilities.map((v) => ({
                ...v,
                startLine: selection.start.line + v.startLine,
                endLine: selection.start.line + v.endLine,
                file: document.uri.fsPath
            }));

            // Merge or set diagnostics
            diagnosticManager.setDiagnostics(document.uri, adjustedVulns, document);

            if (result.totalFindings === 0) {
                vscode.window.showInformationMessage(`SecureGen: No vulnerabilities detected in selection.`);
            } else {
                vscode.window.showWarningMessage(
                    `SecureGen: Found ${result.totalFindings} potential issue(s) in selection. See Problems panel.`
                );
            }

            return result;
        }
    );
}
