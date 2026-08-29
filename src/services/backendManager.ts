import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

export class BackendManager implements vscode.Disposable {
    private process: ReturnType<typeof spawn> | undefined;
    private baseUrl = 'http://127.0.0.1:8000';
    private starting: Promise<boolean> | undefined;

    public getBaseUrl(): string {
        return this.baseUrl;
    }

    public async start(context: vscode.ExtensionContext): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('secureScan');
        const autoStart = config.get<boolean>('autoStartBackend', true);
        const configuredUrl = config.get<string>('backendUrl', '').trim();

        if (!autoStart || (configuredUrl && configuredUrl !== 'http://127.0.0.1:8000')) {
            this.baseUrl = configuredUrl || 'http://127.0.0.1:8000';
            return this.checkHealth();
        }

        if (await this.checkHealth()) {
            Logger.info('SecureGen backend is already running.');
            return true;
        }

        if (this.starting) return this.starting;

        this.starting = this.bootstrap(context).catch((error) => {
            Logger.error(`SecureGen backend setup failed: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }).finally(() => {
            this.starting = undefined;
        });
        return this.starting;
    }

    private async bootstrap(context: vscode.ExtensionContext): Promise<boolean> {
        const backendPath = path.join(context.extensionPath, 'backend');
        const mainPy = path.join(backendPath, 'app', 'main.py');

        if (!fs.existsSync(mainPy)) {
            Logger.error(`Bundled backend not found: ${mainPy}`);
            return false;
        }

        const python = await this.findPython(context);
        if (!python) {
            vscode.window.showErrorMessage(
                'SecureGen needs Python 3.10+ to start its local security engine. Install Python, then run “SecureGen: Start Backend”.'
            );
            return false;
        }

        const storage = path.join(context.globalStorageUri.fsPath, 'runtime');
        const venvDir = path.join(storage, 'venv');
        const venvPython = process.platform === 'win32'
            ? path.join(venvDir, 'Scripts', 'python.exe')
            : path.join(venvDir, 'bin', 'python');

        fs.mkdirSync(storage, { recursive: true });

        if (!fs.existsSync(venvPython)) {
            await this.run(python.command, [...python.args, '-m', 'venv', venvDir], backendPath, 120000);
        }

        const installMarker = path.join(venvDir, '.securegen-deps-installed');
        if (!fs.existsSync(installMarker)) {
            const pipArgs = ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', path.join(backendPath, 'requirements.txt')];
            await this.run(venvPython, pipArgs, backendPath, 300000);
            fs.writeFileSync(installMarker, new Date().toISOString(), 'utf8');
        }

        const port = await this.findFreePort(8000);
        this.baseUrl = `http://127.0.0.1:${port}`;

        const env = {
            ...process.env,
            HOST: '127.0.0.1',
            PORT: String(port),
            APP_ENV: 'production',
            PYTHONUNBUFFERED: '1'
        };

        this.process = spawn(
            venvPython,
            ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port)],
            {
                cwd: backendPath,
                env,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe']
            }
        );

        this.process.stdout?.on('data', data => Logger.info(`[backend] ${String(data).trim()}`));
        this.process.stderr?.on('data', data => Logger.warn(`[backend] ${String(data).trim()}`));
        this.process.on('exit', (code) => {
            Logger.info(`SecureGen backend exited with code ${code}`);
            this.process = undefined;
        });

        for (let i = 0; i < 30; i++) {
            if (await this.checkHealth()) {
                Logger.info(`SecureGen backend ready at ${this.baseUrl}`);
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        Logger.error('SecureGen backend did not become healthy in time.');
        return false;
    }

    private async findPython(context: vscode.ExtensionContext): Promise<{command: string, args: string[]}|undefined> {
        const configured = vscode.workspace.getConfiguration('secureScan').get<string>('pythonPath', '').trim();
        const candidates: Array<{command: string, args: string[]}> = configured
            ? [{ command: configured, args: [] }]
            : process.platform === 'win32'
                ? [{ command: 'py', args: ['-3'] }, { command: 'python', args: [] }]
                : [{ command: 'python3', args: [] }, { command: 'python', args: [] }];

        for (const candidate of candidates) {
            try {
                const { stdout } = await execFileAsync(candidate.command, [...candidate.args, '--version'], { timeout: 10000 });
                if (/Python\s+3\.(10|11|12|13|14)\b/i.test(stdout)) return candidate;
            } catch { /* try next */ }
        }
        return undefined;
    }

    private async run(command: string, args: string[], cwd: string, timeout: number): Promise<void> {
        Logger.info(`SecureGen setup: ${command} ${args.join(' ')}`);
        await execFileAsync(command, args, { cwd, timeout, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
    }

    private async checkHealth(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(1500) });
            if (!response.ok) return false;
            const data = await response.json() as {status?: string};
            return data.status === 'healthy';
        } catch {
            return false;
        }
    }

    private async findFreePort(start: number): Promise<number> {
        // Let the OS choose a free ephemeral port only when 8000 is busy.
        try {
            const response = await fetch(`http://127.0.0.1:${start}/health`, { signal: AbortSignal.timeout(300) });
            if (response.ok) return start;
        } catch { /* port is likely free */ }
        return start + 1;
    }

    public dispose(): void {
        if (this.process && !this.process.killed) {
            this.process.kill();
            this.process = undefined;
        }
    }
}
