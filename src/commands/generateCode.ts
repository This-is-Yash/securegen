import * as vscode from 'vscode';
import { BackendService } from '../services/backendService';
import { GenerationRequest } from '../types/vulnerability';
import { Logger } from '../utils/logger';
import { normalizeLanguageId, isSupportedLanguage } from '../utils/validation';

export async function generateCodeCommand(backendService: BackendService): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    let targetLang = 'python';

    if (editor && isSupportedLanguage(editor.document.languageId)) {
        targetLang = normalizeLanguageId(editor.document.languageId);
    } else {
        const selectedLang = await vscode.window.showQuickPick(
            ['python', 'javascript', 'typescript'],
            { placeHolder: 'Select target programming language for code generation' }
        );
        if (!selectedLang) {
            return;
        }
        targetLang = selectedLang;
    }

    const prompt = await vscode.window.showInputBox({
        prompt: 'Describe the feature or function you want to generate securely',
        placeHolder: 'e.g. Function to authenticate user against SQLite database using hashed passwords',
        validateInput: (text) => text.trim().length < 5 ? 'Prompt must be at least 5 characters' : null
    });

    if (!prompt) {
        return;
    }

    const constraintsInput = await vscode.window.showInputBox({
        prompt: 'Optional: Enter specific security constraints (comma separated)',
        placeHolder: 'e.g. Parameterized SQL only, Rate limiting, Strict type hints, No shell execution'
    });

    const constraints = constraintsInput
        ? constraintsInput.split(',').map((c) => c.trim()).filter(Boolean)
        : [];

    const existingContext = editor ? editor.document.getText() : undefined;

    const request: GenerationRequest = {
        prompt: prompt,
        language: targetLang,
        securityConstraints: constraints,
        existingContext: existingContext
    };

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `SecureGen: Generating security-aware ${targetLang} code...`,
            cancellable: false
        },
        async () => {
            Logger.info(`Requesting secure code generation: "${prompt.slice(0, 40)}..."`);
            const response = await backendService.generateSecureCode(request);

            if (!response.success || !response.generatedCode) {
                vscode.window.showErrorMessage(`SecureGen: Code generation failed - ${response.errorMessage || response.securityAssurance}`);
                return;
            }

            if (editor) {
                // Insert at cursor
                const position = editor.selection.active;
                await editor.edit((editBuilder) => {
                    editBuilder.insert(position, `\n${response.generatedCode}\n`);
                });
            } else {
                // Open new document
                const doc = await vscode.workspace.openTextDocument({
                    content: response.generatedCode,
                    language: targetLang
                });
                await vscode.window.showTextDocument(doc);
            }

            const controlsList = response.securityControls.join('; ');
            vscode.window.showInformationMessage(
                `🛡️ Secure Code Generated! Defenses applied: ${controlsList || response.securityAssurance}`
            );
            Logger.info(`Inserted generated secure code for: "${prompt}"`);
        }
    );
}
