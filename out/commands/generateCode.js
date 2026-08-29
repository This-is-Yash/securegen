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
exports.generateCodeCommand = generateCodeCommand;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
const validation_1 = require("../utils/validation");
async function generateCodeCommand(backendService) {
    const editor = vscode.window.activeTextEditor;
    let targetLang = 'python';
    if (editor && (0, validation_1.isSupportedLanguage)(editor.document.languageId)) {
        targetLang = (0, validation_1.normalizeLanguageId)(editor.document.languageId);
    }
    else {
        const selectedLang = await vscode.window.showQuickPick(['python', 'javascript', 'typescript'], { placeHolder: 'Select target programming language for code generation' });
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
    const request = {
        prompt: prompt,
        language: targetLang,
        securityConstraints: constraints,
        existingContext: existingContext
    };
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `SecureGen: Generating security-aware ${targetLang} code...`,
        cancellable: false
    }, async () => {
        logger_1.Logger.info(`Requesting secure code generation: "${prompt.slice(0, 40)}..."`);
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
        }
        else {
            // Open new document
            const doc = await vscode.workspace.openTextDocument({
                content: response.generatedCode,
                language: targetLang
            });
            await vscode.window.showTextDocument(doc);
        }
        const controlsList = response.securityControls.join('; ');
        vscode.window.showInformationMessage(`🛡️ Secure Code Generated! Defenses applied: ${controlsList || response.securityAssurance}`);
        logger_1.Logger.info(`Inserted generated secure code for: "${prompt}"`);
    });
}
//# sourceMappingURL=generateCode.js.map