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
exports.analyzeSelectionCommand = analyzeSelectionCommand;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
const validation_1 = require("../utils/validation");
async function analyzeSelectionCommand(scannerService, diagnosticManager) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('SecureGen: No active editor found.');
        logger_1.Logger.warn('Selection analysis aborted: No active editor found.');
        return null;
    }
    const document = editor.document;
    const rawLanguageId = document.languageId;
    const normalizedLang = (0, validation_1.normalizeLanguageId)(rawLanguageId);
    if (!(0, validation_1.isSupportedLanguage)(rawLanguageId)) {
        vscode.window.showWarningMessage(`SecureGen: Language "${rawLanguageId}" is not supported. Supported: Python, JavaScript, TypeScript.`);
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
    return await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `SecureGen: Analyzing selection in ${fileName} (L${startLine}-L${endLine})...`,
        cancellable: false
    }, async () => {
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
        }
        else {
            vscode.window.showWarningMessage(`SecureGen: Found ${result.totalFindings} potential issue(s) in selection. See Problems panel.`);
        }
        return result;
    });
}
//# sourceMappingURL=analyzeSelection.js.map