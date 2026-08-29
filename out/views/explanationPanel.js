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
exports.ExplanationPanel = void 0;
const vscode = __importStar(require("vscode"));
class ExplanationPanel {
    static currentPanel;
    panel;
    disposables = [];
    static createOrShow(extensionUri, explanation, vulnerability) {
        const column = vscode.window.activeTextEditor
            ? vscode.ViewColumn.Beside
            : vscode.ViewColumn.One;
        if (ExplanationPanel.currentPanel) {
            ExplanationPanel.currentPanel.panel.reveal(column);
            ExplanationPanel.currentPanel.update(explanation, vulnerability);
            return;
        }
        const panel = vscode.window.createWebviewPanel('secureScanExplanation', `Security: ${vulnerability.cwe}`, column, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        ExplanationPanel.currentPanel = new ExplanationPanel(panel, explanation, vulnerability);
    }
    constructor(panel, explanation, vulnerability) {
        this.panel = panel;
        this.update(explanation, vulnerability);
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }
    update(explanation, vulnerability) {
        this.panel.title = `🛡️ ${vulnerability.cwe} Analysis`;
        this.panel.webview.html = this.getHtmlForWebview(explanation, vulnerability);
    }
    getSeverityBadgeClass(severity) {
        switch (severity.toUpperCase()) {
            case 'CRITICAL':
            case 'HIGH':
                return 'badge-danger';
            case 'MEDIUM':
                return 'badge-warning';
            case 'LOW':
            case 'INFO':
            default:
                return 'badge-info';
        }
    }
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    getHtmlForWebview(explanation, vuln) {
        const badgeClass = this.getSeverityBadgeClass(vuln.severity);
        const cweNum = vuln.cwe.replace(/^CWE-/, '');
        const mitreUrl = `https://cwe.mitre.org/data/definitions/${cweNum}.html`;
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Explanation</title>
    <style>
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }
        .header {
            border-bottom: 1px solid var(--vscode-panel-border, #333);
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        .title {
            font-size: 1.4em;
            font-weight: bold;
            margin: 0 0 10px 0;
            color: var(--vscode-editor-foreground);
        }
        .meta-bar {
            display: flex;
            gap: 10px;
            align-items: center;
            flex-wrap: wrap;
        }
        .badge {
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 0.85em;
            font-weight: 600;
            text-transform: uppercase;
        }
        .badge-danger {
            background-color: #f14c4c;
            color: #ffffff;
        }
        .badge-warning {
            background-color: #cca700;
            color: #000000;
        }
        .badge-info {
            background-color: #3794ff;
            color: #ffffff;
        }
        .cwe-link {
            color: var(--vscode-textLink-foreground, #3794ff);
            text-decoration: none;
            font-weight: 500;
        }
        .cwe-link:hover {
            text-decoration: underline;
        }
        .card {
            background-color: var(--vscode-editorWidget-background, #252526);
            border: 1px solid var(--vscode-editorWidget-border, #454545);
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 16px;
        }
        .card-title {
            font-size: 1.1em;
            font-weight: bold;
            margin-top: 0;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--vscode-symbolIcon-keywordForeground, #569cd6);
        }
        .code-snippet {
            background-color: var(--vscode-textCodeBlock-background, #1e1e1e);
            border: 1px solid var(--vscode-widget-border, #333);
            border-radius: 4px;
            padding: 10px;
            font-family: var(--vscode-editor-font-family, Consolas, 'Courier New', monospace);
            overflow-x: auto;
            white-space: pre-wrap;
            margin: 10px 0;
        }
        .footer {
            margin-top: 25px;
            padding-top: 15px;
            border-top: 1px solid var(--vscode-panel-border, #333);
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground, #888);
            display: flex;
            justify-content: space-between;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="title">${this.escapeHtml(explanation.title)}</h1>
        <div class="meta-bar">
            <span class="badge ${badgeClass}">${vuln.severity}</span>
            <a class="cwe-link" href="${mitreUrl}" target="_blank">🔗 ${vuln.cwe}</a>
            <span>•</span>
            <span>📍 ${this.escapeHtml(vuln.file)}:${vuln.startLine}-${vuln.endLine}</span>
            <span>•</span>
            <span>Rule: <code>${this.escapeHtml(vuln.id)}</code></span>
        </div>
    </div>

    ${vuln.snippet ? `
    <div class="card">
        <div class="card-title">⚠️ Vulnerable Code</div>
        <pre class="code-snippet"><code>${this.escapeHtml(vuln.snippet)}</code></pre>
    </div>` : ''}

    <div class="card">
        <div class="card-title">📖 Security Analysis & Overview</div>
        <p>${this.escapeHtml(explanation.explanation)}</p>
    </div>

    <div class="card">
        <div class="card-title">🔍 Technical Root Cause</div>
        <p>${this.escapeHtml(explanation.rootCause)}</p>
    </div>

    <div class="card">
        <div class="card-title">⚔️ Attack Vector & Exploitability</div>
        <p>${this.escapeHtml(explanation.attackVector)}</p>
    </div>

    <div class="card">
        <div class="card-title">🛡️ Prevention & Defensive Standards</div>
        <p>${this.escapeHtml(explanation.preventionStrategy)}</p>
    </div>

    <div class="footer">
        <span>Generated by <strong>${explanation.provider}</strong> (${explanation.model}) in ${explanation.generationDurationMs}ms</span>
        <span>Secure Coding Assistant</span>
    </div>
</body>
</html>`;
    }
    dispose() {
        ExplanationPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }
}
exports.ExplanationPanel = ExplanationPanel;
//# sourceMappingURL=explanationPanel.js.map