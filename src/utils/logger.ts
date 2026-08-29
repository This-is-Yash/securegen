import * as vscode from 'vscode';

export class Logger {
    private static channel: vscode.OutputChannel;

    public static initialize(channelName: string = 'Secure Coding Assistant'): void {
        if (!this.channel) {
            this.channel = vscode.window.createOutputChannel(channelName);
        }
    }

    public static info(message: string): void {
        this.log(`[INFO] ${message}`);
    }

    public static warn(message: string): void {
        this.log(`[WARN] ${message}`);
    }

    public static error(message: string, error?: unknown): void {
        const errorDetails = error instanceof Error ? ` - ${error.message}` : (error ? ` - ${String(error)}` : '');
        this.log(`[ERROR] ${message}${errorDetails}`);
    }

    public static show(): void {
        this.channel?.show(true);
    }

    private static log(formattedMessage: string): void {
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] ${formattedMessage}`;
        if (this.channel) {
            this.channel.appendLine(line);
        } else {
            console.log(line);
        }
    }
}
