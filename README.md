# SecureGen 1.0.1

**SecureGen** is a local-first VS Code security companion that combines Semgrep static analysis with AI-assisted explanations, remediation, secure code generation, security-test generation, and verification.

## ✨ Polished experience

- 🛡️ SecureGen Security Center with security score and live finding counts
- 🔍 One-click current-file and workspace scans
- 🚨 Native VS Code Problems diagnostics and Quick Fix support
- 🤖 AI explanation and remediation panels
- 🧪 Security regression test generation and verification loop
- ⚡ SecureGen status-bar control instead of noisy repeated popups
- 🚀 Backend auto-starts in the background; users do not need to run Uvicorn manually
- 🎨 Dark, responsive dashboard that follows the VS Code theme

## First run

SecureGen can bootstrap its bundled FastAPI backend into VS Code's extension global storage. It uses an installed Python 3.10+ runtime and installs the backend dependencies, including Semgrep, automatically.

The core static security scan is local and does not require a paid API key. AI features depend on the LLM provider configured by the backend; the bundled `mock` provider is intended for offline development/testing and is not a production AI model.

## Using SecureGen

1. Install the `securegen-1.0.1.vsix` package.
2. Reload VS Code if prompted.
3. Open **SecureGen: Open Security Dashboard** from the Command Palette, or click **$(shield) SecureGen** in the status bar.
4. Scan the current file or the workspace.
5. Open **Problems** to inspect findings, then use the lightbulb / Quick Fix actions for explanation and remediation.
6. Use **Generate Security Tests** and **Verify Security** after applying a fix.

## Privacy

Static analysis and the local backend can run locally. If an external LLM provider is configured, code/context sent to that provider is subject to that provider's policies. Do not send secrets or proprietary code to an external provider unless your organization's policy permits it.
