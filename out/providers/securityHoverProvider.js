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
exports.SecurityHoverProvider = void 0;
const vscode = __importStar(require("vscode"));
class SecurityHoverProvider {
    diagnosticManager;
    constructor(diagnosticManager) {
        this.diagnosticManager = diagnosticManager;
    }
    provideHover(document, position, token) {
        const diagnostics = this.diagnosticManager.getDiagnostics(document.uri);
        const matchingDiags = diagnostics.filter((diag) => diag.range.contains(position));
        if (matchingDiags.length === 0) {
            return null;
        }
        const hoverContents = [];
        for (const diag of matchingDiags) {
            const vuln = diag.vulnerability;
            const md = new vscode.MarkdownString();
            md.isTrusted = true;
            md.supportHtml = true;
            const cweId = vuln?.cwe || 'CWE-UNKNOWN';
            const severity = vuln?.severity || 'HIGH';
            md.appendMarkdown(`### 🛡️ SecureGen: **${severity}** (${cweId})\n\n`);
            md.appendMarkdown(`${diag.message}\n\n`);
            md.appendMarkdown(`---\n\n`);
            const commandArgs = encodeURIComponent(JSON.stringify({
                documentUri: document.uri.toString(),
                position: { line: position.line, character: position.character }
            }));
            md.appendMarkdown(`[⚡ **Quick Fix**](command:secureScan.remediateVulnerability?${commandArgs}) &nbsp;|&nbsp; ` +
                `[🧪 **Generate Test**](command:secureScan.generateTests?${commandArgs}) &nbsp;|&nbsp; ` +
                `[💡 **Explain**](command:secureScan.explainVulnerability?${commandArgs}) &nbsp;|&nbsp; ` +
                `[🔗 MITRE](https://cwe.mitre.org/data/definitions/${cweId.replace(/^CWE-/, '')}.html)\n`);
            hoverContents.push(md);
        }
        return new vscode.Hover(hoverContents);
    }
}
exports.SecurityHoverProvider = SecurityHoverProvider;
//# sourceMappingURL=securityHoverProvider.js.map