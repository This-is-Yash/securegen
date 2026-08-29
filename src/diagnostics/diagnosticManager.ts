import * as vscode from 'vscode';
import { SeverityLevel, Vulnerability } from '../types/vulnerability';
import { Logger } from '../utils/logger';

export class DiagnosticManager {
    private diagnosticCollection: vscode.DiagnosticCollection;

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
    public mapSeverity(severity: SeverityLevel): vscode.DiagnosticSeverity {
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
    public createDiagnostic(vuln: Vulnerability, document?: vscode.TextDocument): vscode.Diagnostic {
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
        } else if (document && endLineIdx < document.lineCount) {
            endCol = document.lineAt(endLineIdx).text.length;
        }

        const range = new vscode.Range(
            new vscode.Position(startLineIdx, startCol),
            new vscode.Position(endLineIdx, endCol)
        );

        const diagnosticSeverity = this.mapSeverity(vuln.severity);
        const message = `[${vuln.severity}] ${vuln.cwe}: ${vuln.message}`;

        const diagnostic = new vscode.Diagnostic(range, message, diagnosticSeverity);
        diagnostic.source = 'SecureScan';
        diagnostic.code = {
            value: vuln.id,
            target: vscode.Uri.parse(`https://cwe.mitre.org/data/definitions/${vuln.cwe.replace(/^CWE-/, '')}.html`)
        };

        // Attach finding metadata to diagnostic for downstream quick-fix / explanation providers
        (diagnostic as any).vulnerability = vuln;

        return diagnostic;
    }

    /**
     * Update the DiagnosticCollection for a given document URI with scanned vulnerabilities.
     */
    public setDiagnostics(uri: vscode.Uri, vulnerabilities: Vulnerability[], document?: vscode.TextDocument): void {
        const diagnostics = vulnerabilities.map((v) => this.createDiagnostic(v, document));
        this.diagnosticCollection.set(uri, diagnostics);
        Logger.info(`Updated diagnostics for ${uri.fsPath}: ${diagnostics.length} finding(s) registered in Problems panel.`);
    }

    /**
     * Clear diagnostics for a specific file.
     */
    public clearFileDiagnostics(uri: vscode.Uri): void {
        this.diagnosticCollection.delete(uri);
        Logger.info(`Cleared diagnostics for ${uri.fsPath}`);
    }

    /**
     * Clear all registered diagnostics across all files.
     */
    public clearAll(): void {
        this.diagnosticCollection.clear();
        Logger.info('Cleared all SecureScan diagnostics.');
    }

    /**
     * Get diagnostics for a URI.
     */
    public getDiagnostics(uri: vscode.Uri): readonly vscode.Diagnostic[] {
        return this.diagnosticCollection.get(uri) || [];
    }

    /**
     * Dispose the underlying DiagnosticCollection.
     */
    public dispose(): void {
        this.diagnosticCollection.dispose();
    }
}
