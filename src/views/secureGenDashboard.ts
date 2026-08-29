import * as vscode from 'vscode';

export class SecureGenDashboard {
    private static panel: vscode.WebviewPanel | undefined;

    public static show(context: vscode.ExtensionContext, status: string = 'Security engine ready') {
        const column = vscode.ViewColumn.Beside;
        if (this.panel) {
            this.panel.reveal(column);
            this.panel.webview.html = this.html(status);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'secureGenDashboard',
            'SecureGen • Security Center',
            column,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.html = this.html(status);
        this.panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'problems') {
                await vscode.commands.executeCommand('workbench.actions.view.problems');
                return;
            }
            if (message.command === 'refresh') {
                this.refresh(status);
                return;
            }

            const commands: Record<string, string> = {
                scan: 'secureScan.scanFile',
                workspace: 'secureScan.analyzeWorkspace',
                generate: 'secureScan.generateCode',
                tests: 'secureScan.generateTests',
                verify: 'secureScan.verifySecurity',
                explain: 'secureScan.explainVulnerability',
                remediate: 'secureScan.remediateVulnerability'
            };
            if (message.command && commands[message.command]) {
                await vscode.commands.executeCommand(commands[message.command]);
                this.refresh('Action completed — review the results below.');
            }
        });
        this.panel.onDidDispose(() => { this.panel = undefined; });
    }

    private static refresh(status: string) {
        if (!this.panel) return;
        this.panel.webview.html = this.html(status);
    }

    private static collectStats() {
        const diagnostics = vscode.languages.getDiagnostics();
        let total = 0;
        let errors = 0;
        let warnings = 0;
        let info = 0;
        let files = 0;

        for (const [uri, items] of diagnostics) {
            const secure = items.filter(d => d.source === 'SecureScan');
            if (!secure.length) continue;
            files++;
            total += secure.length;
            for (const d of secure) {
                if (d.severity === vscode.DiagnosticSeverity.Error) errors++;
                else if (d.severity === vscode.DiagnosticSeverity.Warning) warnings++;
                else info++;
            }
        }
        return { total, errors, warnings, info, files };
    }

    private static escapeHtml(text: string): string {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    private static html(status: string): string {
        const s = this.collectStats();
        const score = s.total === 0 ? 100 : Math.max(0, Math.round(100 - (s.errors * 12 + s.warnings * 5 + s.info * 2)));
        const scoreLabel = score >= 90 ? 'Excellent' : score >= 70 ? 'Good' : score >= 40 ? 'Needs attention' : 'Critical';
        const workspaceName = vscode.workspace.name || 'Current workspace';

        return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
:root{color-scheme:dark}
*{box-sizing:border-box} body{margin:0;padding:30px;font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:radial-gradient(circle at 90% 0,#17254a 0,transparent 35%),radial-gradient(circle at 0 100%,#12372f 0,transparent 28%),var(--vscode-editor-background);line-height:1.45}
.shell{max-width:1100px;margin:auto}.hero{position:relative;overflow:hidden;padding:30px;border:1px solid color-mix(in srgb,var(--vscode-focusBorder) 30%,transparent);border-radius:24px;background:linear-gradient(135deg,rgba(75,92,150,.28),rgba(15,20,30,.78));box-shadow:0 22px 70px rgba(0,0,0,.32)}
.hero:after{content:'';position:absolute;width:190px;height:190px;border-radius:50%;right:-60px;top:-90px;background:rgba(104,91,255,.18);filter:blur(4px)}.brand{display:flex;align-items:center;gap:15px}.logo{width:56px;height:56px;border-radius:17px;display:grid;place-items:center;font-size:28px;font-weight:900;background:linear-gradient(135deg,#7c5cff,#21d6b3);box-shadow:0 12px 35px rgba(100,90,255,.32);color:white}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:11px;color:var(--vscode-descriptionForeground)}h1{margin:2px 0;font-size:30px;letter-spacing:-.03em}.sub{color:var(--vscode-descriptionForeground)}
.status{display:inline-flex;align-items:center;gap:8px;margin-top:20px;padding:8px 12px;border-radius:999px;background:rgba(20,30,44,.8);border:1px solid rgba(120,150,190,.2);color:#7ee7d4;font-size:12px}.dot{width:7px;height:7px;border-radius:50%;background:#4fe1bd;box-shadow:0 0 12px #4fe1bd}
.grid{display:grid;grid-template-columns:1.15fr 1fr 1fr 1fr;gap:14px;margin-top:16px}.card{padding:20px;border:1px solid var(--vscode-panel-border);border-radius:18px;background:color-mix(in srgb,var(--vscode-editorWidget-background) 82%,transparent);box-shadow:0 10px 30px rgba(0,0,0,.12)}.score{grid-row:span 2;display:flex;flex-direction:column;justify-content:space-between;min-height:210px}.scoreNum{font-size:54px;font-weight:800;letter-spacing:-.05em;margin-top:12px}.scoreLabel{font-weight:700}.muted{color:var(--vscode-descriptionForeground);font-size:12px}.metric{font-size:30px;font-weight:800;margin-top:8px}.danger{color:#ff6b6b}.warn{color:#e9c46a}.ok{color:#5fe0b9}.info{color:#69a9ff}
.actions{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:18px}.action{border:1px solid var(--vscode-panel-border);border-radius:16px;padding:18px;background:var(--vscode-editorWidget-background);cursor:pointer;text-align:left;transition:transform .16s,border-color .16s,background .16s}.action:hover{transform:translateY(-2px);border-color:var(--vscode-focusBorder);background:var(--vscode-list-hoverBackground)}.action b{display:block;margin-bottom:4px}.action span{font-size:12px;color:var(--vscode-descriptionForeground)}
button{border:0;border-radius:10px;padding:9px 13px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);cursor:pointer;font-weight:650}button:hover{background:var(--vscode-button-hoverBackground)}.toolbar{display:flex;justify-content:space-between;align-items:center;margin:24px 0 10px}.workspace{font-size:13px}.footer{margin-top:20px;padding-top:16px;border-top:1px solid var(--vscode-panel-border);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--vscode-descriptionForeground);font-size:11px}
@media(max-width:800px){body{padding:16px}.grid{grid-template-columns:1fr 1fr}.score{grid-row:auto}.actions{grid-template-columns:1fr}}
</style></head>
<body><div class="shell">
<section class="hero"><div class="brand"><div class="logo">S</div><div><div class="eyebrow">Security command center</div><h1>SecureGen</h1><div class="sub">Find vulnerabilities. Understand them. Fix them. Verify them.</div></div></div><div class="status"><span class="dot"></span>${this.escapeHtml(status)}</div></section>
<div class="toolbar"><div class="workspace"><b>${this.escapeHtml(workspaceName)}</b><span class="muted"> • ${s.files} protected file${s.files === 1 ? '' : 's'}</span></div><div><button onclick="run('problems')">Open Problems</button> <button onclick="run('refresh')">↻ Refresh</button></div></div>
<section class="grid">
<div class="card score"><div><div class="muted">SECURITY SCORE</div><div class="scoreNum">${score}</div><div class="scoreLabel">${scoreLabel}</div></div><div class="muted">Based on SecureScan findings currently registered in VS Code.</div></div>
<div class="card"><div class="muted">CRITICAL / HIGH</div><div class="metric danger">${s.errors}</div><div class="muted">Action recommended</div></div>
<div class="card"><div class="muted">MEDIUM</div><div class="metric warn">${s.warnings}</div><div class="muted">Review when possible</div></div>
<div class="card"><div class="muted">LOW / INFO</div><div class="metric info">${s.info}</div><div class="muted">Informational findings</div></div>
</section>
<div class="toolbar"><div><b>Security actions</b><div class="muted">Run the workflow without leaving your editor.</div></div></div>
<section class="actions">
<div class="action" onclick="run('scan')"><b>⌕ Scan current file</b><span>Run local Semgrep rules against the active file.</span></div>
<div class="action" onclick="run('workspace')"><b>◈ Analyze workspace</b><span>Audit the project and surface findings in Problems.</span></div>
<div class="action" onclick="run('explain')"><b>✦ Explain finding</b><span>Get a plain-language security explanation for the current issue.</span></div>
<div class="action" onclick="run('remediate')"><b>🔧 Remediate finding</b><span>Generate a safer implementation and review the change.</span></div>
<div class="action" onclick="run('tests')"><b>🧪 Generate security tests</b><span>Create tests designed to exercise the vulnerability.</span></div>
<div class="action" onclick="run('verify')"><b>✓ Verify security</b><span>Re-scan and validate that the remediation holds.</span></div>
</section>
<div class="footer"><span>Local-first security workflow • SecureGen</span><span>Findings: ${s.total} • Errors: ${s.errors} • Warnings: ${s.warnings}</span></div>
</div><script>const vscode=acquireVsCodeApi();function run(command){vscode.postMessage({command})}</script></body></html>`;
    }
}
