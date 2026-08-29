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
exports.WorkspaceReportPanel = void 0;
const vscode = __importStar(require("vscode"));
class WorkspaceReportPanel {
    static currentPanel;
    panel;
    disposables = [];
    static createOrShow(extensionUri, report) {
        const column = vscode.ViewColumn.Two;
        if (WorkspaceReportPanel.currentPanel) {
            WorkspaceReportPanel.currentPanel.panel.reveal(column);
            WorkspaceReportPanel.currentPanel.update(report);
            return;
        }
        const panel = vscode.window.createWebviewPanel('workspaceSecurityReport', `🛡️ ${report.project.projectName} Security Report`, column, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        WorkspaceReportPanel.currentPanel = new WorkspaceReportPanel(panel, report);
    }
    constructor(panel, report) {
        this.panel = panel;
        this.update(report);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'explain':
                    vscode.commands.executeCommand('secureScan.explainVulnerability');
                    break;
                case 'remediate':
                    vscode.commands.executeCommand('secureScan.remediateVulnerability');
                    break;
                case 'generateTest':
                    vscode.commands.executeCommand('secureScan.generateTests');
                    break;
                case 'verify':
                    vscode.commands.executeCommand('secureScan.verifySecurity');
                    break;
            }
        }, null, this.disposables);
    }
    update(report) {
        this.panel.title = `🛡️ Security: ${report.project.projectName}`;
        this.panel.webview.html = this.getHtmlForWebview(report);
    }
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    getHtmlForWebview(report) {
        const p = report.project;
        const healthColor = report.securityHealthScore > 80 ? '#4ec9b0' : (report.securityHealthScore > 50 ? '#cca700' : '#f14c4c');
        const findingsHtml = report.vulnerabilities.length > 0
            ? report.vulnerabilities.map((v, i) => `
                <tr>
                    <td><strong>#${i + 1}</strong></td>
                    <td><span class="badge badge-${v.severity.toLowerCase()}">${v.severity}</span></td>
                    <td><a href="https://cwe.mitre.org/data/definitions/${v.cwe.replace(/^CWE-/, '')}.html" target="_blank">${this.escapeHtml(v.cwe)}</a></td>
                    <td><code>${this.escapeHtml(v.file)}:${v.startLine}</code></td>
                    <td>${this.escapeHtml(v.message)}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="5" style="text-align:center; padding: 20px; color:#4ec9b0;">✅ Zero security vulnerabilities detected!</td></tr>';
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Workspace Security Report</title>
    <style>
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.5;
        }
        .header-box {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--vscode-panel-border, #333);
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        .title { font-size: 1.5em; font-weight: bold; margin: 0; }
        .score-circle {
            font-size: 1.8em;
            font-weight: bold;
            color: ${healthColor};
            border: 2px solid ${healthColor};
            border-radius: 50%;
            width: 70px;
            height: 70px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .stat-card {
            background-color: var(--vscode-editorWidget-background, #252526);
            border: 1px solid var(--vscode-editorWidget-border, #454545);
            border-radius: 6px;
            padding: 12px;
        }
        .stat-title { font-size: 0.85em; color: var(--vscode-descriptionForeground, #888); }
        .stat-val { font-size: 1.3em; font-weight: bold; margin-top: 4px; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        th, td {
            text-align: left;
            padding: 8px 10px;
            border-bottom: 1px solid var(--vscode-editorWidget-border, #333);
        }
        th { background-color: var(--vscode-editorWidget-background, #252526); }
        .badge {
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.8em;
            font-weight: bold;
            text-transform: uppercase;
        }
        .badge-critical, .badge-high { background-color: #f14c4c; color: #fff; }
        .badge-medium { background-color: #cca700; color: #000; }
        .badge-low, .badge-info { background-color: #3794ff; color: #fff; }
        .btn-row {
            margin-top: 20px;
            display: flex;
            gap: 10px;
        }
        button {
            background-color: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
            border: none;
            padding: 8px 14px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        }
        button:hover { background-color: var(--vscode-button-hoverBackground, #1177bb); }
    </style>
</head>
<body>
    <div class="header-box">
        <div>
            <h1 class="title">🛡️ ${this.escapeHtml(p.projectName)} Security Summary</h1>
            <p style="margin: 4px 0 0 0; color: var(--vscode-descriptionForeground, #888);">
                Root: <code>${this.escapeHtml(p.rootPath)}</code> • Scanned ${p.analyzedFiles} files (${p.ignoredFiles} ignored/filtered)
            </p>
        </div>
        <div class="score-circle">${report.securityHealthScore}</div>
    </div>

    <div class="grid">
        <div class="stat-card">
            <div class="stat-title">Languages</div>
            <div class="stat-val">${p.languages.join(', ') || 'N/A'}</div>
        </div>
        <div class="stat-card">
            <div class="stat-title">Frameworks</div>
            <div class="stat-val">${p.frameworks.join(', ') || 'None detected'}</div>
        </div>
        <div class="stat-card">
            <div class="stat-title">Test Framework</div>
            <div class="stat-val">${p.testFrameworks.join(', ') || 'unittest / Jest'}</div>
        </div>
        <div class="stat-card">
            <div class="stat-title">Total Findings</div>
            <div class="stat-val">${report.totalFindings} <span style="font-size:0.7em; color:#f14c4c;">(${report.highCount + report.criticalCount} High/Crit)</span></div>
        </div>
    </div>

    <div class="btn-row">
        <button onclick="vscode.postMessage({command: 'generateTest'})">🧪 Generate Security Tests</button>
        <button onclick="vscode.postMessage({command: 'verify'})">🛡️ Verify Security Loop</button>
        <button onclick="vscode.postMessage({command: 'explain'})">💡 Explain Finding</button>
        <button onclick="vscode.postMessage({command: 'remediate'})">⚡ Remediate Finding</button>
    </div>

    <h2 style="margin-top: 30px;">Vulnerability Findings (${report.totalFindings})</h2>
    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Severity</th>
                <th>CWE</th>
                <th>Location</th>
                <th>Issue Description</th>
            </tr>
        </thead>
        <tbody>
            ${findingsHtml}
        </tbody>
    </table>

    <script>
        const vscode = acquireVsCodeApi();
    </script>
</body>
</html>`;
    }
    dispose() {
        WorkspaceReportPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }
}
exports.WorkspaceReportPanel = WorkspaceReportPanel;
//# sourceMappingURL=workspaceReportPanel.js.map