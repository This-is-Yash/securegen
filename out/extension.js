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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const logger_1 = require("./utils/logger");
const scanCode_1 = require("./commands/scanCode");
const analyzeSelection_1 = require("./commands/analyzeSelection");
const analyzeWorkspace_1 = require("./commands/analyzeWorkspace");
const explainVulnerability_1 = require("./commands/explainVulnerability");
const remediateVulnerability_1 = require("./commands/remediateVulnerability");
const generateCode_1 = require("./commands/generateCode");
const securityTests_1 = require("./commands/securityTests");
const scannerService_1 = require("./services/scannerService");
const backendService_1 = require("./services/backendService");
const diagnosticManager_1 = require("./diagnostics/diagnosticManager");
const securityHoverProvider_1 = require("./providers/securityHoverProvider");
const securityCodeActionProvider_1 = require("./providers/securityCodeActionProvider");
const backendManager_1 = require("./services/backendManager");
const secureGenDashboard_1 = require("./views/secureGenDashboard");
async function activate(context) {
    logger_1.Logger.initialize('SecureGen');
    logger_1.Logger.info('SecureGen extension activating...');
    const backendManager = new backendManager_1.BackendManager();
    const backendService = new backendService_1.BackendService(backendManager);
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = '$(shield) SecureGen';
    statusBar.tooltip = 'Open SecureGen security dashboard';
    statusBar.command = 'secureScan.openDashboard';
    statusBar.show();
    const diagnosticManager = new diagnosticManager_1.DiagnosticManager();
    const scannerService = new scannerService_1.ScannerService(backendService);
    const ensureBackend = async () => {
        const ready = await backendService.ensureReady(context);
        if (!ready) {
            statusBar.text = '$(warning) SecureGen';
            secureGenDashboard_1.SecureGenDashboard.show(context, 'Backend setup required');
        }
        return ready;
    };
    const dashboardDisposable = vscode.commands.registerCommand('secureScan.openDashboard', () => secureGenDashboard_1.SecureGenDashboard.show(context, 'Security engine ready'));
    // Start the managed backend in the background. The first run may install
    // the bundled Python dependencies into extension global storage.
    void backendService.ensureReady(context).then((ready) => {
        statusBar.text = ready ? '$(shield) SecureGen' : '$(warning) SecureGen';
        statusBar.tooltip = ready
            ? 'SecureGen is ready — open dashboard'
            : 'SecureGen backend needs setup — open dashboard';
    });
    // Command: Scan Current File
    const scanFileDisposable = vscode.commands.registerCommand('secureScan.scanFile', async () => {
        if (!(await ensureBackend()))
            return;
        await (0, scanCode_1.scanCodeCommand)(scannerService, diagnosticManager);
    });
    // Command: Analyze Selected Code
    const analyzeSelectionDisposable = vscode.commands.registerCommand('secureScan.analyzeSelection', async () => {
        if (!(await ensureBackend()))
            return;
        await (0, analyzeSelection_1.analyzeSelectionCommand)(scannerService, diagnosticManager);
    });
    // Command: Analyze Entire Workspace
    const analyzeWorkspaceDisposable = vscode.commands.registerCommand('secureScan.analyzeWorkspace', async () => {
        if (!(await ensureBackend()))
            return;
        await (0, analyzeWorkspace_1.analyzeWorkspaceCommand)(context, backendService, diagnosticManager);
    });
    // Command: Clear All Diagnostics
    const clearDiagnosticsDisposable = vscode.commands.registerCommand('secureScan.clearDiagnostics', () => {
        diagnosticManager.clearAll();
        vscode.window.setStatusBarMessage('$(check) SecureGen: Security diagnostics cleared.', 4000);
    });
    // Command: Explain Vulnerability with AI
    const explainVulnerabilityDisposable = vscode.commands.registerCommand('secureScan.explainVulnerability', async (args) => {
        if (!(await ensureBackend()))
            return;
        await (0, explainVulnerability_1.explainVulnerabilityCommand)(context, backendService, diagnosticManager, args);
    });
    // Command: Remediate Vulnerability with AI
    const remediateVulnerabilityDisposable = vscode.commands.registerCommand('secureScan.remediateVulnerability', async (args) => {
        if (!(await ensureBackend()))
            return;
        await (0, remediateVulnerability_1.remediateVulnerabilityCommand)(backendService, diagnosticManager, args);
    });
    // Command: Generate Secure Code with AI
    const generateCodeDisposable = vscode.commands.registerCommand('secureScan.generateCode', async () => {
        if (!(await ensureBackend()))
            return;
        await (0, generateCode_1.generateCodeCommand)(backendService);
    });
    // Command: Generate Security Tests
    const generateTestsDisposable = vscode.commands.registerCommand('secureScan.generateTests', async (args) => {
        if (!(await ensureBackend()))
            return;
        await (0, securityTests_1.generateSecurityTestsCommand)(backendService, diagnosticManager, args);
    });
    // Command: Run Security Tests
    const runTestsDisposable = vscode.commands.registerCommand('secureScan.runTests', async (testToRun) => {
        if (!(await ensureBackend()))
            return;
        await (0, securityTests_1.runSecurityTestsCommand)(backendService, testToRun);
    });
    // Command: Verify Security Loop
    const verifySecurityDisposable = vscode.commands.registerCommand('secureScan.verifySecurity', async () => {
        if (!(await ensureBackend()))
            return;
        await (0, securityTests_1.verifySecurityCommand)(backendService, diagnosticManager);
    });
    // Supported Document Selectors
    const supportedSelector = [
        { language: 'python', scheme: 'file' },
        { language: 'javascript', scheme: 'file' },
        { language: 'typescript', scheme: 'file' },
        { language: 'javascriptreact', scheme: 'file' },
        { language: 'typescriptreact', scheme: 'file' }
    ];
    // Register Hover Provider
    const hoverProviderDisposable = vscode.languages.registerHoverProvider(supportedSelector, new securityHoverProvider_1.SecurityHoverProvider(diagnosticManager));
    // Register Code Action Provider (Quick Fixes / Ctrl+.)
    const codeActionProviderDisposable = vscode.languages.registerCodeActionsProvider(supportedSelector, new securityCodeActionProvider_1.SecurityCodeActionProvider(diagnosticManager), {
        providedCodeActionKinds: securityCodeActionProvider_1.SecurityCodeActionProvider.providedCodeActionKinds
    });
    // Document close listener
    const docCloseDisposable = vscode.workspace.onDidCloseTextDocument((doc) => {
        diagnosticManager.clearFileDiagnostics(doc.uri);
    });
    // Real-time scan on file save if enabled
    const docSaveDisposable = vscode.workspace.onDidSaveTextDocument(async (doc) => {
        const config = vscode.workspace.getConfiguration('secureScan');
        const enableRealTime = config.get('enableRealTimeScanning', false);
        if (enableRealTime) {
            logger_1.Logger.info(`Auto-scanning saved file: ${doc.fileName}`);
            await (0, scanCode_1.scanCodeCommand)(scannerService, diagnosticManager);
        }
    });
    context.subscriptions.push(dashboardDisposable, scanFileDisposable, analyzeSelectionDisposable, analyzeWorkspaceDisposable, clearDiagnosticsDisposable, explainVulnerabilityDisposable, remediateVulnerabilityDisposable, generateCodeDisposable, generateTestsDisposable, runTestsDisposable, verifySecurityDisposable, hoverProviderDisposable, codeActionProviderDisposable, docCloseDisposable, docSaveDisposable, diagnosticManager, statusBar, backendManager);
    logger_1.Logger.info('SecureGen extension fully activated with Workspace Analysis, Security Test Generation, and Verification Loop.');
}
function deactivate() {
    logger_1.Logger.info('SecureGen extension deactivated.');
}
//# sourceMappingURL=extension.js.map