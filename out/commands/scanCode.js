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
exports.scanCodeCommand = scanCodeCommand;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
const validation_1 = require("../utils/validation");
const vulnerability_1 = require("../types/vulnerability");
async function scanCodeCommand(scannerService, diagnosticManager) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.setStatusBarMessage('$(warning) SecureGen: Open a file to scan.', 4000);
        logger_1.Logger.warn('Scan aborted: No active editor found.');
        return null;
    }
    const document = editor.document;
    const rawLanguageId = document.languageId;
    const normalizedLang = (0, validation_1.normalizeLanguageId)(rawLanguageId);
    if (!(0, validation_1.isSupportedLanguage)(rawLanguageId)) {
        vscode.window.setStatusBarMessage(`$(warning) SecureGen: ${rawLanguageId} is not supported. Use Python, JavaScript, or TypeScript.`, 5000);
        logger_1.Logger.warn(`Scan skipped for unsupported language: ${rawLanguageId}`);
        return null;
    }
    const filePath = document.uri.fsPath;
    const fileName = document.fileName.split(/[\\/]/).pop() || document.fileName;
    const content = document.getText();
    // Reject oversized files before sending to backend
    const contentBytes = Buffer.byteLength(content, 'utf-8');
    if (contentBytes > vulnerability_1.MAX_CODE_PAYLOAD_BYTES) {
        const sizeMB = (contentBytes / (1024 * 1024)).toFixed(2);
        vscode.window.setStatusBarMessage(`$(warning) SecureGen: ${fileName} is too large (${sizeMB} MB). Maximum is 512 KB.`, 5000);
        logger_1.Logger.warn(`Scan aborted: File ${fileName} exceeds max payload (${contentBytes} bytes).`);
        return null;
    }
    return await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `SecureGen: Analyzing ${fileName}...`,
        cancellable: false
    }, async () => {
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
            vscode.window.setStatusBarMessage(`$(check) SecureGen: ${fileName} is clean • ${result.scanDurationMs}ms`, 6000);
        }
        else {
            vscode.window.setStatusBarMessage(`$(warning) SecureGen: ${result.totalFindings} issue(s) found in ${fileName} • see Problems`, 8000);
        }
        return result;
    });
}
//# sourceMappingURL=scanCode.js.map