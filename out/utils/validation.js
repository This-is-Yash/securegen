"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORTED_LANGUAGES = void 0;
exports.isSupportedLanguage = isSupportedLanguage;
exports.normalizeLanguageId = normalizeLanguageId;
exports.SUPPORTED_LANGUAGES = ['python', 'javascript', 'typescript', 'javascriptreact', 'typescriptreact'];
function isSupportedLanguage(languageId) {
    return exports.SUPPORTED_LANGUAGES.includes(languageId.toLowerCase());
}
function normalizeLanguageId(languageId) {
    const lang = languageId.toLowerCase();
    if (lang === 'python') {
        return 'python';
    }
    if (lang === 'javascript' || lang === 'javascriptreact') {
        return 'javascript';
    }
    if (lang === 'typescript' || lang === 'typescriptreact') {
        return 'typescript';
    }
    return 'unsupported';
}
//# sourceMappingURL=validation.js.map