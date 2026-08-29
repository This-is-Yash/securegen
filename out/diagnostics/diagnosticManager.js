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
exports.DiagnosticManager = void 0;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
class DiagnosticManager {
    diagnosticCollection;
    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('secureScan');
    }
    /**
     * Map platform SeverityLevel to VS Code DiagnosticSeverity.
     * CRITICAL → Error
     * HIGH → Error
     * MEDIUM → Warning
     * LOW → Information
     * INFO → Information / Hint
     */
    mapSeverity(severity) {
        switch (severity) {
            case 'CRITICAL':
            case 'HIGH':
                return vscode.DiagnosticSeverity.Error;
            case 'MEDIUM':
                return vscode.DiagnosticSeverity.Warning;
            case 'LOW':
                return vscode.DiagnosticSeverity.Information;
            case 'INFO':
            default:
                return vscode.DiagnosticSeverity.Hint;
        }
    }
    /**
     * Convert a Vulnerability finding into a VS Code Diagnostic object.
     */
    createDiagnostic(vuln, document) {
        // VS Code Range is 0-indexed; Vulnerability startLine/endLine are 1-indexed
        const startLineIdx = Math.max(0, vuln.startLine - 1);
        const endLineIdx = Math.max(0, vuln.endLine - 1);
        let startCol = 0;
        let endCol = Number.MAX_SAFE_INTEGER;
        if (vuln.startColumn !== undefined && vuln.startColumn > 0) {
            startCol = vuln.startColumn - 1;
        }
        if (vuln.endColumn !== undefined && vuln.endColumn > 0) {
            endCol = vuln.endColumn - 1;
        }
        else if (document && endLineIdx < document.lineCount) {
            endCol = document.lineAt(endLineIdx).text.length;
        }
        const range = new vscode.Range(new vscode.Position(startLineIdx, startCol), new vscode.Position(endLineIdx, endCol));
        const diagnosticSeverity = this.mapSeverity(vuln.severity);
        const message = `[${vuln.severity}] ${vuln.cwe}: ${vuln.message}`;
        const diagnostic = new vscode.Diagnostic(range, message, diagnosticSeverity);
        diagnostic.source = 'SecureScan';
        diagnostic.code = {
            value: vuln.id,
            target: vscode.Uri.parse(`https://cwe.mitre.org/data/definitions/${vuln.cwe.replace(/^CWE-/, '')}.html`)
        };
        // Attach finding metadata to diagnostic for downstream quick-fix / explanation providers
        diagnostic.vulnerability = vuln;
        return diagnostic;
    }
    /**
     * Update the DiagnosticCollection for a given document URI with scanned vulnerabilities.
     */
    setDiagnostics(uri, vulnerabilities, document) {
        const diagnostics = vulnerabilities.map((v) => this.createDiagnostic(v, document));
        this.diagnosticCollection.set(uri, diagnostics);
        logger_1.Logger.info(`Updated diagnostics for ${uri.fsPath}: ${diagnostics.length} finding(s) registered in Problems panel.`);
    }
    /**
     * Clear diagnostics for a specific file.
     */
    clearFileDiagnostics(uri) {
        this.diagnosticCollection.delete(uri);
        logger_1.Logger.info(`Cleared diagnostics for ${uri.fsPath}`);
    }
    /**
     * Clear all registered diagnostics across all files.
     */
    clearAll() {
        this.diagnosticCollection.clear();
        logger_1.Logger.info('Cleared all SecureScan diagnostics.');
    }
    /**
     * Get diagnostics for a URI.
     */
    getDiagnostics(uri) {
        return this.diagnosticCollection.get(uri) || [];
    }
    /**
     * Dispose the underlying DiagnosticCollection.
     */
    dispose() {
        this.diagnosticCollection.dispose();
    }
}
exports.DiagnosticManager = DiagnosticManager;
//# sourceMappingURL=diagnosticManager.js.map