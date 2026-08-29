import * as vscode from 'vscode';
import { BackendService } from '../services/backendService';
import { DiagnosticManager } from '../diagnostics/diagnosticManager';
import { WorkspaceReportPanel } from '../views/workspaceReportPanel';
import { Logger } from '../utils/logger';

export async function analyzeWorkspaceCommand(
    context: vscode.ExtensionContext,
    backendService: BackendService,
    diagnosticManager: DiagnosticManager
): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('SecureGen: No active workspace folder open. Open a project folder to analyze.');
        return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `SecureGen: Discovering & analyzing entire workspace...`,
            cancellable: false
        },
        async (progress) => {
            Logger.info(`Starting workspace analysis for: ${rootPath}`);
            progress.report({ message: 'Discovering project metadata & running static security scanner...' });

            const report = await backendService.analyzeWorkspace({
                workspacePath: rootPath,
                maxFiles: 200
            });

            if (!report.success) {
                vscode.window.showErrorMessage(`SecureGen: Workspace analysis failed - ${report.errorMessage}`);
                return;
            }

            // Publish diagnostics grouped by file
            diagnosticManager.clearAll();
            const findingsByFile = new Map<string, typeof report.vulnerabilities>();

            for (const vuln of report.vulnerabilities) {
                const absPath = vscode.Uri.file(rootPath + '/' + vuln.file).fsPath;
                const list = findingsByFile.get(absPath) || [];
                list.push(vuln);
                findingsByFile.set(absPath, list);
            }

            for (const [fileFsPath, vulns] of findingsByFile.entries()) {
                diagnosticManager.setDiagnostics(vscode.Uri.file(fileFsPath), vulns);
            }

            // Open the interactive Workspace Security Summary Report
            WorkspaceReportPanel.createOrShow(context.extensionUri, report);

            const msg = `🛡️ Workspace Analysis Complete: ${report.totalFindings} findings detected (Health Score: ${report.securityHealthScore}/100)`;
            if (report.totalFindings > 0) {
                vscode.window.showWarningMessage(msg);
            } else {
                vscode.window.showInformationMessage(msg);
            }
        }
    );
}
