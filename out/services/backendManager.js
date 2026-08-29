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
exports.BackendManager = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const logger_1 = require("../utils/logger");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
class BackendManager {
    process;
    baseUrl = 'http://127.0.0.1:8000';
    starting;
    getBaseUrl() {
        return this.baseUrl;
    }
    async start(context) {
        const config = vscode.workspace.getConfiguration('secureScan');
        const autoStart = config.get('autoStartBackend', true);
        const configuredUrl = config.get('backendUrl', '').trim();
        if (!autoStart || (configuredUrl && configuredUrl !== 'http://127.0.0.1:8000')) {
            this.baseUrl = configuredUrl || 'http://127.0.0.1:8000';
            return this.checkHealth();
        }
        if (await this.checkHealth()) {
            logger_1.Logger.info('SecureGen backend is already running.');
            return true;
        }
        if (this.starting)
            return this.starting;
        this.starting = this.bootstrap(context).catch((error) => {
            logger_1.Logger.error(`SecureGen backend setup failed: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }).finally(() => {
            this.starting = undefined;
        });
        return this.starting;
    }
    async bootstrap(context) {
        const backendPath = path.join(context.extensionPath, 'backend');
        const mainPy = path.join(backendPath, 'app', 'main.py');
        if (!fs.existsSync(mainPy)) {
            logger_1.Logger.error(`Bundled backend not found: ${mainPy}`);
            return false;
        }
        const python = await this.findPython(context);
        if (!python) {
            vscode.window.showErrorMessage('SecureGen needs Python 3.10+ to start its local security engine. Install Python, then run “SecureGen: Start Backend”.');
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
        this.process = (0, child_process_1.spawn)(venvPython, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port)], {
            cwd: backendPath,
            env,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        this.process.stdout?.on('data', data => logger_1.Logger.info(`[backend] ${String(data).trim()}`));
        this.process.stderr?.on('data', data => logger_1.Logger.warn(`[backend] ${String(data).trim()}`));
        this.process.on('exit', (code) => {
            logger_1.Logger.info(`SecureGen backend exited with code ${code}`);
            this.process = undefined;
        });
        for (let i = 0; i < 30; i++) {
            if (await this.checkHealth()) {
                logger_1.Logger.info(`SecureGen backend ready at ${this.baseUrl}`);
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        logger_1.Logger.error('SecureGen backend did not become healthy in time.');
        return false;
    }
    async findPython(context) {
        const configured = vscode.workspace.getConfiguration('secureScan').get('pythonPath', '').trim();
        const candidates = configured
            ? [{ command: configured, args: [] }]
            : process.platform === 'win32'
                ? [{ command: 'py', args: ['-3'] }, { command: 'python', args: [] }]
                : [{ command: 'python3', args: [] }, { command: 'python', args: [] }];
        for (const candidate of candidates) {
            try {
                const { stdout } = await execFileAsync(candidate.command, [...candidate.args, '--version'], { timeout: 10000 });
                if (/Python\s+3\.(10|11|12|13|14)\b/i.test(stdout))
                    return candidate;
            }
            catch { /* try next */ }
        }
        return undefined;
    }
    async run(command, args, cwd, timeout) {
        logger_1.Logger.info(`SecureGen setup: ${command} ${args.join(' ')}`);
        await execFileAsync(command, args, { cwd, timeout, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
    }
    async checkHealth() {
        try {
            const response = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(1500) });
            if (!response.ok)
                return false;
            const data = await response.json();
            return data.status === 'healthy';
        }
        catch {
            return false;
        }
    }
    async findFreePort(start) {
        // Let the OS choose a free ephemeral port only when 8000 is busy.
        try {
            const response = await fetch(`http://127.0.0.1:${start}/health`, { signal: AbortSignal.timeout(300) });
            if (response.ok)
                return start;
        }
        catch { /* port is likely free */ }
        return start + 1;
    }
    dispose() {
        if (this.process && !this.process.killed) {
            this.process.kill();
            this.process = undefined;
        }
    }
}
exports.BackendManager = BackendManager;
//# sourceMappingURL=backendManager.js.map