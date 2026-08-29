import * as vscode from 'vscode';
import { DiagnosticManager } from '../diagnostics/diagnosticManager';
import { Vulnerability } from '../types/vulnerability';

export class SecurityHoverProvider implements vscode.HoverProvider {
    private diagnosticManager: DiagnosticManager;

    constructor(diagnosticManager: DiagnosticManager) {
        this.diagnosticManager = diagnosticManager;
    }

    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
        const diagnostics = this.diagnosticManager.getDiagnostics(document.uri);
        const matchingDiags = diagnostics.filter((diag) => diag.range.contains(position));

        if (matchingDiags.length === 0) {
            return null;
        }

        const hoverContents: vscode.MarkdownString[] = [];

        for (const diag of matchingDiags) {
            const vuln: Vulnerability | undefined = (diag as any).vulnerability;
            const md = new vscode.MarkdownString();
            md.isTrusted = true;
            md.supportHtml = true;

            const cweId = vuln?.cwe || 'CWE-UNKNOWN';
            const severity = vuln?.severity || 'HIGH';

            md.appendMarkdown(`### 🛡️ SecureGen: **${severity}** (${cweId})\n\n`);
            md.appendMarkdown(`${diag.message}\n\n`);
            md.appendMarkdown(`---\n\n`);

            const commandArgs = encodeURIComponent(
                JSON.stringify({
                    documentUri: document.uri.toString(),
                    position: { line: position.line, character: position.character }
                })
            );

            md.appendMarkdown(
                `[⚡ **Quick Fix**](command:secureScan.remediateVulnerability?${commandArgs}) &nbsp;|&nbsp; ` +
                `[🧪 **Generate Test**](command:secureScan.generateTests?${commandArgs}) &nbsp;|&nbsp; ` +
                `[💡 **Explain**](command:secureScan.explainVulnerability?${commandArgs}) &nbsp;|&nbsp; ` +
                `[🔗 MITRE](https://cwe.mitre.org/data/definitions/${cweId.replace(/^CWE-/, '')}.html)\n`
            );

            hoverContents.push(md);
        }

        return new vscode.Hover(hoverContents);
    }
}
