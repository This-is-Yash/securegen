import json
import logging
import os
import re
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from app.models.schemas import ProjectMetadata

logger = logging.getLogger("codebase_analyzer")

# Ignored directory names for performance and noise reduction
IGNORED_DIRS: Set[str] = {
    ".git", ".svn", ".hg", "node_modules", "venv", ".venv", "env", ".env",
    "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", "dist",
    "build", "coverage", ".next", ".nuxt", ".idea", ".vscode", "target",
    "bin", "obj", ".serverless", ".terraform", "vendor"
}

# Sensitive files that MUST NEVER be scanned or sent to external LLMs
SENSITIVE_FILES_REGEX = re.compile(
    r"(\.env($|\..+)|id_rsa.*|id_ed25519.*|\.pem$|\.key$|\.p12$|\.pfx$|credentials\.json|serviceAccountKey.*\.json|secrets\.json)",
    re.IGNORECASE
)

# Supported language extensions
LANGUAGE_EXTENSIONS: Dict[str, str] = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".java": "java",
    ".go": "go",
    ".php": "php",
    ".rb": "ruby",
}

# Framework signatures
FRAMEWORK_SIGNATURES: Dict[str, Dict[str, List[str]]] = {
    "python": {
        "FastAPI": ["fastapi", "uvicorn"],
        "Flask": ["flask", "werkzeug"],
        "Django": ["django"],
        "SQLAlchemy": ["sqlalchemy"],
        "Tornado": ["tornado"],
        "Pyramid": ["pyramid"]
    },
    "javascript": {
        "Express": ["express"],
        "NestJS": ["@nestjs/core", "@nestjs/common"],
        "Next.js": ["next"],
        "React": ["react", "react-dom"],
        "Vue": ["vue"],
        "Fastify": ["fastify"],
        "Koa": ["koa"]
    },
    "typescript": {
        "Express": ["express"],
        "NestJS": ["@nestjs/core", "@nestjs/common"],
        "Next.js": ["next"],
        "React": ["react", "react-dom"],
        "Fastify": ["fastify"]
    }
}

# Test framework signatures
TEST_FRAMEWORK_SIGNATURES: Dict[str, Dict[str, List[str]]] = {
    "python": {
        "pytest": ["pytest", "pytest-asyncio", "pytest-mock", "conftest.py", "pytest.ini"],
        "unittest": ["unittest"]
    },
    "javascript": {
        "Jest": ["jest", "jest.config.js", "jest.config.ts", "@types/jest"],
        "Vitest": ["vitest", "vitest.config.ts", "vitest.config.js"],
        "Mocha": ["mocha", ".mocharc.json", ".mocharc.yml", ".mocharc.js"],
    },
    "typescript": {
        "Jest": ["jest", "ts-jest", "jest.config.ts"],
        "Vitest": ["vitest", "vitest.config.ts"],
        "Mocha": ["mocha", "@types/mocha"]
    }
}


class CodebaseAnalyzer:
    """
    Intelligently analyzes a workspace root directory:
    - Discovers languages, frameworks, package managers, and dependencies
    - Identifies test frameworks and test directories
    - Redacts sensitive secrets and ignores heavy dependency folders
    - Discovers entry points, database models, and API routes
    """

    def __init__(self, max_file_size_bytes: int = 524_288):
        self.max_file_size_bytes = max_file_size_bytes

    def is_sensitive_file(self, file_path: Path) -> bool:
        """Check if file matches sensitive secrets pattern."""
        return bool(SENSITIVE_FILES_REGEX.search(file_path.name))

    def should_ignore_dir(self, dir_name: str) -> bool:
        """Check if directory name is in ignore list."""
        return dir_name.lower() in IGNORED_DIRS

    def discover_workspace_files(
        self,
        workspace_root: Path,
        max_files: int = 300
    ) -> Tuple[List[Path], int, int]:
        """
        Walk workspace discovering analyzable source files while skipping ignored/sensitive files.
        Returns: (analyzable_files, total_found, ignored_count)
        """
        analyzable_files: List[Path] = []
        total_found = 0
        ignored_count = 0

        for root, dirs, files in os.walk(workspace_root):
            # Modify dirs in-place to prevent walking into ignored directories
            dirs[:] = [d for d in dirs if not self.should_ignore_dir(d)]

            for file_name in files:
                file_path = Path(root) / file_name
                total_found += 1

                # Check secret/sensitive filter
                if self.is_sensitive_file(file_path):
                    ignored_count += 1
                    continue

                # Check file extension
                ext = file_path.suffix.lower()
                if ext not in LANGUAGE_EXTENSIONS and file_name not in ("requirements.txt", "package.json", "go.mod", "pom.xml", "Pipfile"):
                    ignored_count += 1
                    continue

                # Check file size limit
                try:
                    if file_path.stat().st_size > self.max_file_size_bytes:
                        ignored_count += 1
                        continue
                except OSError:
                    ignored_count += 1
                    continue

                if len(analyzable_files) < max_files:
                    analyzable_files.append(file_path)
                else:
                    ignored_count += 1

        return analyzable_files, total_found, ignored_count

    def detect_languages(self, source_files: List[Path]) -> List[str]:
        """Detect programming languages based on source file extension frequencies."""
        counts: Dict[str, int] = {}
        for f in source_files:
            ext = f.suffix.lower()
            lang = LANGUAGE_EXTENSIONS.get(ext)
            if lang:
                counts[lang] = counts.get(lang, 0) + 1

        # Sort by frequency
        sorted_langs = sorted(counts.keys(), key=lambda k: counts[k], reverse=True)
        return sorted_langs if sorted_langs else ["python"]

    def detect_dependencies_and_frameworks(
        self,
        workspace_root: Path,
        primary_languages: List[str]
    ) -> Tuple[List[str], List[str], List[str], List[str]]:
        """
        Inspect dependency manifests to detect package managers, dependencies,
        frameworks, and test frameworks.
        Returns: (frameworks, test_frameworks, package_managers, top_dependencies)
        """
        frameworks: Set[str] = set()
        test_frameworks: Set[str] = set()
        package_managers: Set[str] = set()
        dependencies: List[str] = []

        # 1. Python Inspection (requirements.txt, Pipfile, pyproject.toml)
        python_manifests = list(workspace_root.glob("**/requirements.txt")) + list(workspace_root.glob("**/Pipfile"))
        for req_file in python_manifests:
            if any(part in IGNORED_DIRS for part in req_file.parts):
                continue
            package_managers.add("pip")
            try:
                content = req_file.read_text(encoding="utf-8", errors="ignore").lower()
                for line in content.splitlines():
                    dep = line.split("==")[0].split(">=")[0].split("<=")[0].strip()
                    if dep and not dep.startswith("#"):
                        dependencies.append(dep)

                # Match python frameworks
                for fw, sigs in FRAMEWORK_SIGNATURES.get("python", {}).items():
                    if any(sig in content for sig in sigs):
                        frameworks.add(fw)

                # Match test frameworks
                for tf, sigs in TEST_FRAMEWORK_SIGNATURES.get("python", {}).items():
                    if any(sig in content for sig in sigs):
                        test_frameworks.add(tf)
            except Exception as e:
                logger.warning("Error reading requirements.txt: %s", e)

        # Check for pytest files
        if any(workspace_root.glob("**/pytest.ini")) or any(workspace_root.glob("**/conftest.py")):
            test_frameworks.add("pytest")

        # 2. Node / JS / TS Inspection (package.json)
        js_manifests = list(workspace_root.glob("**/package.json"))
        for pkg_file in js_manifests:
            if any(part in IGNORED_DIRS for part in pkg_file.parts):
                continue
            package_managers.add("npm")
            if (pkg_file.parent / "yarn.lock").exists():
                package_managers.add("yarn")
            if (pkg_file.parent / "pnpm-lock.yaml").exists():
                package_managers.add("pnpm")

            try:
                pkg_data = json.loads(pkg_file.read_text(encoding="utf-8", errors="ignore"))
                all_deps = {
                    **pkg_data.get("dependencies", {}),
                    **pkg_data.get("devDependencies", {})
                }
                for dep_name in all_deps.keys():
                    dependencies.append(dep_name)

                # Match JS/TS frameworks
                for lang_key in ("javascript", "typescript"):
                    for fw, sigs in FRAMEWORK_SIGNATURES.get(lang_key, {}).items():
                        if any(sig in all_deps for sig in sigs):
                            frameworks.add(fw)

                    for tf, sigs in TEST_FRAMEWORK_SIGNATURES.get(lang_key, {}).items():
                        if any(sig in all_deps for sig in sigs):
                            test_frameworks.add(tf)

                # Check Jest / Vitest config files
                if any(pkg_file.parent.glob("jest.config.*")):
                    test_frameworks.add("Jest")
                if any(pkg_file.parent.glob("vitest.config.*")):
                    test_frameworks.add("Vitest")

            except Exception as e:
                logger.warning("Error reading package.json: %s", e)

        # 3. Default fallback heuristics
        if "python" in primary_languages and not test_frameworks:
            test_frameworks.add("pytest")
        elif ("javascript" in primary_languages or "typescript" in primary_languages) and not test_frameworks:
            test_frameworks.add("Jest")

        return sorted(frameworks), sorted(test_frameworks), sorted(package_managers), dependencies[:50]

    def discover_structure(
        self,
        workspace_root: Path,
        source_files: List[Path]
    ) -> Tuple[List[str], List[str], List[str]]:
        """
        Identify entry points, test directories, and security-sensitive files.
        """
        entry_points: List[str] = []
        test_dirs: Set[str] = set()
        security_files: List[str] = []

        entry_candidates = {
            "main.py", "app.py", "server.py", "index.py", "wsgi.py", "asgi.py",
            "index.js", "server.js", "app.js", "main.js",
            "index.ts", "server.ts", "app.ts", "main.ts"
        }

        security_keywords = re.compile(
            r"(auth|login|security|crypto|password|token|session|permission|admin|database|db|user|model|route|controller|api)",
            re.IGNORECASE
        )

        for f in source_files:
            rel_path = f.relative_to(workspace_root).as_posix()
            f_name = f.name.lower()

            # Entry points
            if f_name in entry_candidates or (f.parent == workspace_root and f.suffix in (".py", ".js", ".ts")):
                entry_points.append(rel_path)

            # Test directories
            parts = [p.lower() for p in f.parts]
            if "test" in parts or "tests" in parts or "__tests__" in parts or "spec" in parts:
                parent_rel = f.parent.relative_to(workspace_root).as_posix()
                test_dirs.add(parent_rel if parent_rel != "." else "tests")

            # Security sensitive components
            if security_keywords.search(rel_path):
                security_files.append(rel_path)

        if not test_dirs and (workspace_root / "tests").exists():
            test_dirs.add("tests")

        return entry_points[:10], sorted(test_dirs)[:10], security_files[:30]

    def analyze_workspace(
        self,
        workspace_root: Path,
        max_files: int = 300
    ) -> Tuple[ProjectMetadata, List[Path]]:
        """
        Perform complete project discovery and security context mapping.
        """
        resolved_root = workspace_root.resolve()
        source_files, total_found, ignored_count = self.discover_workspace_files(resolved_root, max_files=max_files)
        languages = self.detect_languages(source_files)
        frameworks, test_frameworks, package_managers, dependencies = self.detect_dependencies_and_frameworks(
            resolved_root, languages
        )
        entry_points, test_dirs, security_files = self.discover_structure(resolved_root, source_files)

        project_name = resolved_root.name or "Workspace"

        metadata = ProjectMetadata(
            projectName=project_name,
            rootPath=str(resolved_root),
            languages=languages,
            frameworks=frameworks,
            testFrameworks=test_frameworks,
            packageManagers=package_managers,
            dependencies=dependencies,
            totalFiles=total_found,
            analyzedFiles=len(source_files),
            ignoredFiles=ignored_count,
            entryPoints=entry_points,
            testDirectories=test_dirs,
            securitySensitiveFiles=security_files
        )

        return metadata, source_files


# Singleton provider for dependency injection
_global_analyzer: Optional[CodebaseAnalyzer] = None


def get_codebase_analyzer() -> CodebaseAnalyzer:
    global _global_analyzer
    if _global_analyzer is None:
        _global_analyzer = CodebaseAnalyzer()
    return _global_analyzer
