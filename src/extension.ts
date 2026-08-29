import * as vscode from 'vscode';
import { Logger } from './utils/logger';
import { scanCodeCommand } from './commands/scanCode';
import { analyzeSelectionCommand } from './commands/analyzeSelection';
import { analyzeWorkspaceCommand } from './commands/analyzeWorkspace';
import { explainVulnerabilityCommand } from './commands/explainVulnerability';
import { remediateVulnerabilityCommand } from './commands/remediateVulnerability';
import { generateCodeCommand } from './commands/generateCode';
import {
    generateSecurityTestsCommand,
    runSecurityTestsCommand,
    verifySecurityCommand
} from './commands/securityTests';
import { ScannerService } from './services/scannerService';
import { BackendService } from './services/backendService';
import { DiagnosticManager } from './diagnostics/diagnosticManager';
import { SecurityHoverProvider } from './providers/securityHoverProvider';
import { SecurityCodeActionProvider } from './providers/securityCodeActionProvider';
import { BackendManager } from './services/backendManager';
import { SecureGenDashboard } from './views/secureGenDashboard';

export async function activate(context: vscode.ExtensionContext) {
    Logger.initialize('SecureGen');
    Logger.info('SecureGen extension activating...');

    const backendManager = new BackendManager();
    const backendService = new BackendService(backendManager);

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = '$(shield) SecureGen';
    statusBar.tooltip = 'Open SecureGen security dashboard';
    statusBar.command = 'secureScan.openDashboard';
    statusBar.show();
    const diagnosticManager = new DiagnosticManager();
    const scannerService = new ScannerService(backendService);
    const ensureBackend = async (): Promise<boolean> => {
        const ready = await backendService.ensureReady(context);
        if (!ready) {
            statusBar.text = '$(warning) SecureGen';
            SecureGenDashboard.show(context, 'Backend setup required');
        }
        return ready;
    };

    const dashboardDisposable = vscode.commands.registerCommand(
        'secureScan.openDashboard',
        () => SecureGenDashboard.show(context, 'Security engine ready')
    );

    // Start the managed backend in the background. The first run may install
    // the bundled Python dependencies into extension global storage.
    void backendService.ensureReady(context).then((ready) => {
        statusBar.text = ready ? '$(shield) SecureGen' : '$(warning) SecureGen';
        statusBar.tooltip = ready
            ? 'SecureGen is ready — open dashboard'
            : 'SecureGen backend needs setup — open dashboard';
    });

    // Command: Scan Current File
    const scanFileDisposable = vscode.commands.registerCommand(
        'secureScan.scanFile',
        async () => {
            if (!(await ensureBackend())) return;
            await scanCodeCommand(scannerService, diagnosticManager);
        }
    );

    // Command: Analyze Selected Code
    const analyzeSelectionDisposable = vscode.commands.registerCommand(
        'secureScan.analyzeSelection',
        async () => {
            if (!(await ensureBackend())) return;
            await analyzeSelectionCommand(scannerService, diagnosticManager);
        }
    );

    // Command: Analyze Entire Workspace
    const analyzeWorkspaceDisposable = vscode.commands.registerCommand(
        'secureScan.analyzeWorkspace',
        async () => {
            if (!(await ensureBackend())) return;
            await analyzeWorkspaceCommand(context, backendService, diagnosticManager);
        }
    );

    // Command: Clear All Diagnostics
    const clearDiagnosticsDisposable = vscode.commands.registerCommand(
        'secureScan.clearDiagnostics',
        () => {
            diagnosticManager.clearAll();
            vscode.window.setStatusBarMessage('$(check) SecureGen: Security diagnostics cleared.', 4000);
        }
    );

    // Command: Explain Vulnerability with AI
    const explainVulnerabilityDisposable = vscode.commands.registerCommand(
        'secureScan.explainVulnerability',
        async (args) => {
            if (!(await ensureBackend())) return;
            await explainVulnerabilityCommand(context, backendService, diagnosticManager, args);
        }
    );

    // Command: Remediate Vulnerability with AI
    const remediateVulnerabilityDisposable = vscode.commands.registerCommand(
        'secureScan.remediateVulnerability',
        async (args) => {
            if (!(await ensureBackend())) return;
            await remediateVulnerabilityCommand(backendService, diagnosticManager, args);
        }
    );

    // Command: Generate Secure Code with AI
    const generateCodeDisposable = vscode.commands.registerCommand(
        'secureScan.generateCode',
        async () => {
            if (!(await ensureBackend())) return;
            await generateCodeCommand(backendService);
        }
    );

    // Command: Generate Security Tests
    const generateTestsDisposable = vscode.commands.registerCommand(
        'secureScan.generateTests',
        async (args) => {
            if (!(await ensureBackend())) return;
            await generateSecurityTestsCommand(backendService, diagnosticManager, args);
        }
    );

    // Command: Run Security Tests
    const runTestsDisposable = vscode.commands.registerCommand(
        'secureScan.runTests',
        async (testToRun) => {
            if (!(await ensureBackend())) return;
            await runSecurityTestsCommand(backendService, testToRun);
        }
    );

    // Command: Verify Security Loop
    const verifySecurityDisposable = vscode.commands.registerCommand(
        'secureScan.verifySecurity',
        async () => {
            if (!(await ensureBackend())) return;
            await verifySecurityCommand(backendService, diagnosticManager);
        }
    );

    // Supported Document Selectors
    const supportedSelector: vscode.DocumentSelector = [
        { language: 'python', scheme: 'file' },
        { language: 'javascript', scheme: 'file' },
        { language: 'typescript', scheme: 'file' },
        { language: 'javascriptreact', scheme: 'file' },
        { language: 'typescriptreact', scheme: 'file' }
    ];

    // Register Hover Provider
    const hoverProviderDisposable = vscode.languages.registerHoverProvider(
        supportedSelector,
        new SecurityHoverProvider(diagnosticManager)
    );

    // Register Code Action Provider (Quick Fixes / Ctrl+.)
    const codeActionProviderDisposable = vscode.languages.registerCodeActionsProvider(
        supportedSelector,
        new SecurityCodeActionProvider(diagnosticManager),
        {
            providedCodeActionKinds: SecurityCodeActionProvider.providedCodeActionKinds
        }
    );

    // Document close listener
    const docCloseDisposable = vscode.workspace.onDidCloseTextDocument((doc) => {
        diagnosticManager.clearFileDiagnostics(doc.uri);
    });

    // Real-time scan on file save if enabled
    const docSaveDisposable = vscode.workspace.onDidSaveTextDocument(async (doc) => {
        const config = vscode.workspace.getConfiguration('secureScan');
        const enableRealTime = config.get<boolean>('enableRealTimeScanning', false);
        if (enableRealTime) {
            Logger.info(`Auto-scanning saved file: ${doc.fileName}`);
            await scanCodeCommand(scannerService, diagnosticManager);
        }
    });

    context.subscriptions.push(
        dashboardDisposable,
        scanFileDisposable,
        analyzeSelectionDisposable,
        analyzeWorkspaceDisposable,
        clearDiagnosticsDisposable,
        explainVulnerabilityDisposable,
        remediateVulnerabilityDisposable,
        generateCodeDisposable,
        generateTestsDisposable,
        runTestsDisposable,
        verifySecurityDisposable,
        hoverProviderDisposable,
        codeActionProviderDisposable,
        docCloseDisposable,
        docSaveDisposable,
        diagnosticManager,
        statusBar,
        backendManager
    );

    Logger.info('SecureGen extension fully activated with Workspace Analysis, Security Test Generation, and Verification Loop.');
}

export function deactivate() {
    Logger.info('SecureGen extension deactivated.');
}
