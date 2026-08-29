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
exports.analyzeWorkspaceCommand = analyzeWorkspaceCommand;
const vscode = __importStar(require("vscode"));
const workspaceReportPanel_1 = require("../views/workspaceReportPanel");
const logger_1 = require("../utils/logger");
async function analyzeWorkspaceCommand(context, backendService, diagnosticManager) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('SecureGen: No active workspace folder open. Open a project folder to analyze.');
        return;
    }
    const rootPath = workspaceFolders[0].uri.fsPath;
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `SecureGen: Discovering & analyzing entire workspace...`,
        cancellable: false
    }, async (progress) => {
        logger_1.Logger.info(`Starting workspace analysis for: ${rootPath}`);
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
        const findingsByFile = new Map();
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
        workspaceReportPanel_1.WorkspaceReportPanel.createOrShow(context.extensionUri, report);
        const msg = `🛡️ Workspace Analysis Complete: ${report.totalFindings} findings detected (Health Score: ${report.securityHealthScore}/100)`;
        if (report.totalFindings > 0) {
            vscode.window.showWarningMessage(msg);
        }
        else {
            vscode.window.showInformationMessage(msg);
        }
    });
}
//# sourceMappingURL=analyzeWorkspace.js.map