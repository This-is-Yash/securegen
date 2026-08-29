import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { isSupportedLanguage, normalizeLanguageId } from '../utils/validation';
import { ScannerService } from '../services/scannerService';
import { ScanResponse, MAX_CODE_PAYLOAD_BYTES } from '../types/vulnerability';
import { DiagnosticManager } from '../diagnostics/diagnosticManager';

export async function scanCodeCommand(
    scannerService: ScannerService,
    diagnosticManager: DiagnosticManager
): Promise<ScanResponse | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.setStatusBarMessage('$(warning) SecureGen: Open a file to scan.', 4000);
        Logger.warn('Scan aborted: No active editor found.');
        return null;
    }

    const document = editor.document;
    const rawLanguageId = document.languageId;
    const normalizedLang = normalizeLanguageId(rawLanguageId);

    if (!isSupportedLanguage(rawLanguageId)) {
        vscode.window.setStatusBarMessage(
            `$(warning) SecureGen: ${rawLanguageId} is not supported. Use Python, JavaScript, or TypeScript.`,
            5000
        );
        Logger.warn(`Scan skipped for unsupported language: ${rawLanguageId}`);
        return null;
    }

    const filePath = document.uri.fsPath;
    const fileName = document.fileName.split(/[\\/]/).pop() || document.fileName;
    const content = document.getText();

    // Reject oversized files before sending to backend
    const contentBytes = Buffer.byteLength(content, 'utf-8');
    if (contentBytes > MAX_CODE_PAYLOAD_BYTES) {
        const sizeMB = (contentBytes / (1024 * 1024)).toFixed(2);
        vscode.window.setStatusBarMessage(
            `$(warning) SecureGen: ${fileName} is too large (${sizeMB} MB). Maximum is 512 KB.`,
            5000
        );
        Logger.warn(`Scan aborted: File ${fileName} exceeds max payload (${contentBytes} bytes).`);
        return null;
    }

    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `SecureGen: Analyzing ${fileName}...`,
            cancellable: false
        },
        async () => {
            const result = await scannerService.scan({
                code: content,
                filePath: filePath,
                language: normalizedLang
            });

            if (!result.success) {
                vscode.window.showErrorMessage(`SecureScan failed: ${result.errorMessage || 'Unknown error'}`);
                return result;
            }

            // Publish findings to VS Code Diagnostics Collection (Problems Panel)
            diagnosticManager.setDiagnostics(document.uri, result.vulnerabilities, document);

            if (result.totalFindings === 0) {
                vscode.window.setStatusBarMessage(
                    `$(check) SecureGen: ${fileName} is clean • ${result.scanDurationMs}ms`,
                    6000
                );
            } else {
                vscode.window.setStatusBarMessage(
                    `$(warning) SecureGen: ${result.totalFindings} issue(s) found in ${fileName} • see Problems`,
                    8000
                );
            }

            return result;
        }
    );
}
