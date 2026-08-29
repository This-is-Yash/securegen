export const SUPPORTED_LANGUAGES = ['python', 'javascript', 'typescript', 'javascriptreact', 'typescriptreact'] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export function isSupportedLanguage(languageId: string): boolean {
    return SUPPORTED_LANGUAGES.includes(languageId.toLowerCase() as SupportedLanguage);
}

export function normalizeLanguageId(languageId: string): 'python' | 'javascript' | 'typescript' | 'unsupported' {
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
