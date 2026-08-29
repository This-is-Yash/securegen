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
exports.RemediationPanel = void 0;
const vscode = __importStar(require("vscode"));
class RemediationPanel {
    panel;
    onApply;
    static current;
    constructor(panel, onApply) {
        this.panel = panel;
        this.onApply = onApply;
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'apply')
                await this.onApply();
            if (message.command === 'close')
                panel.dispose();
        });
        panel.onDidDispose(() => { RemediationPanel.current = undefined; });
    }
    static show(vulnerability, explanation, originalCode, fixedCode, onApply) {
        if (this.current)
            this.current.panel.dispose();
        const panel = vscode.window.createWebviewPanel('secureGenRemediation', `SecureGen • ${vulnerability}`, vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
        this.current = new RemediationPanel(panel, onApply);
        panel.webview.html = this.html(vulnerability, explanation, originalCode, fixedCode);
    }
    static esc(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    static html(vulnerability, explanation, original, fixed) {
        return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:radial-gradient(circle at top right,#18233d,#0b0e13 60%);padding:24px;line-height:1.55}
.hero,.card{border:1px solid #2a3855;border-radius:18px;background:rgba(17,24,39,.78);padding:18px;margin-bottom:14px}
.hero{background:linear-gradient(135deg,rgba(124,92,255,.18),rgba(36,214,181,.08))}
h1{font-size:23px;margin:0 0 6px}.tag{display:inline-block;padding:5px 9px;border-radius:999px;background:#291f48;color:#c7bbff;font-size:12px;font-weight:700}
pre{white-space:pre-wrap;overflow:auto;background:#080b10;border-radius:12px;padding:14px;border:1px solid #222c3d}
button{border:0;border-radius:11px;padding:11px 16px;margin-right:8px;cursor:pointer;font-weight:700}
.primary{background:#7c5cff;color:white}.secondary{background:#202c43;color:white}
.actions{position:sticky;bottom:0;padding:14px 0;background:linear-gradient(transparent,#0b0e13 30%)}
</style></head><body>
<div class="hero"><span class="tag">AI REMEDIATION</span><h1>SecureGen fix review</h1><div>${this.esc(vulnerability)}</div></div>
<div class="card"><b>Why this fix</b><p>${this.esc(explanation)}</p></div>
<div class="card"><b>Before</b><pre>${this.esc(original)}</pre></div>
<div class="card"><b>After</b><pre>${this.esc(fixed)}</pre></div>
<div class="actions"><button class="primary" onclick="vscode.postMessage({command:'apply'})">Apply secure fix</button><button class="secondary" onclick="vscode.postMessage({command:'close'})">Cancel</button></div>
<script>const vscode=acquireVsCodeApi();</script></body></html>`;
    }
}
exports.RemediationPanel = RemediationPanel;
//# sourceMappingURL=remediationPanel.js.map