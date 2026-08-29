import * as vscode from 'vscode';
import { DiagnosticManager } from '../diagnostics/diagnosticManager';
import { Vulnerability } from '../types/vulnerability';

export class SecurityCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.Empty
    ];

    private diagnosticManager: DiagnosticManager;

    constructor(diagnosticManager: DiagnosticManager) {
        this.diagnosticManager = diagnosticManager;
    }

    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        const diagnostics = context.diagnostics.filter(
            (diag) => diag.source === 'SecureScan'
        );

        if (diagnostics.length === 0) {
            return [];
        }

        const actions: vscode.CodeAction[] = [];

        for (const diag of diagnostics) {
            const vuln: Vulnerability | undefined = (diag as any).vulnerability;
            const cweId = vuln?.cwe || 'CWE-UNKNOWN';

            // 1. Quick Fix Code Action
            const fixAction = new vscode.CodeAction(
                `⚡ SecureGen: Remediate ${cweId} with AI`,
                vscode.CodeActionKind.QuickFix
            );
            fixAction.diagnostics = [diag];
            fixAction.isPreferred = true;
            fixAction.command = {
                command: 'secureScan.remediateVulnerability',
                title: `Fix ${cweId}`,
                arguments: [{ documentUri: document.uri.toString(), position: { line: diag.range.start.line, character: diag.range.start.character } }]
            };
            actions.push(fixAction);

            // 2. Generate Security Test Code Action
            const testAction = new vscode.CodeAction(
                `🧪 SecureGen: Generate Security Regression Test for ${cweId}`,
                vscode.CodeActionKind.Empty
            );
            testAction.diagnostics = [diag];
            testAction.command = {
                command: 'secureScan.generateTests',
                title: `Generate Test for ${cweId}`,
                arguments: [{ documentUri: document.uri.toString(), position: { line: diag.range.start.line, character: diag.range.start.character } }]
            };
            actions.push(testAction);

            // 3. Explain Code Action
            const explainAction = new vscode.CodeAction(
                `💡 SecureGen: Explain ${cweId} with AI`,
                vscode.CodeActionKind.Empty
            );
            explainAction.diagnostics = [diag];
            explainAction.command = {
                command: 'secureScan.explainVulnerability',
                title: `Explain ${cweId}`,
                arguments: [{ documentUri: document.uri.toString(), position: { line: diag.range.start.line, character: diag.range.start.character } }]
            };
            actions.push(explainAction);
        }

        return actions;
    }
}
