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
exports.SecurityCodeActionProvider = void 0;
const vscode = __importStar(require("vscode"));
class SecurityCodeActionProvider {
    static providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.Empty
    ];
    diagnosticManager;
    constructor(diagnosticManager) {
        this.diagnosticManager = diagnosticManager;
    }
    provideCodeActions(document, range, context, token) {
        const diagnostics = context.diagnostics.filter((diag) => diag.source === 'SecureScan');
        if (diagnostics.length === 0) {
            return [];
        }
        const actions = [];
        for (const diag of diagnostics) {
            const vuln = diag.vulnerability;
            const cweId = vuln?.cwe || 'CWE-UNKNOWN';
            // 1. Quick Fix Code Action
            const fixAction = new vscode.CodeAction(`⚡ SecureGen: Remediate ${cweId} with AI`, vscode.CodeActionKind.QuickFix);
            fixAction.diagnostics = [diag];
            fixAction.isPreferred = true;
            fixAction.command = {
                command: 'secureScan.remediateVulnerability',
                title: `Fix ${cweId}`,
                arguments: [{ documentUri: document.uri.toString(), position: { line: diag.range.start.line, character: diag.range.start.character } }]
            };
            actions.push(fixAction);
            // 2. Generate Security Test Code Action
            const testAction = new vscode.CodeAction(`🧪 SecureGen: Generate Security Regression Test for ${cweId}`, vscode.CodeActionKind.Empty);
            testAction.diagnostics = [diag];
            testAction.command = {
                command: 'secureScan.generateTests',
                title: `Generate Test for ${cweId}`,
                arguments: [{ documentUri: document.uri.toString(), position: { line: diag.range.start.line, character: diag.range.start.character } }]
            };
            actions.push(testAction);
            // 3. Explain Code Action
            const explainAction = new vscode.CodeAction(`💡 SecureGen: Explain ${cweId} with AI`, vscode.CodeActionKind.Empty);
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
exports.SecurityCodeActionProvider = SecurityCodeActionProvider;
//# sourceMappingURL=securityCodeActionProvider.js.map