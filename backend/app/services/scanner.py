import os
import fnmatch
from pathlib import Path
from typing import Dict, List, Any


def find_project_root(project_path: str) -> tuple[Path, str]:
    """
    Finds the actual project root directory (containing pom.xml, build.gradle, playwright.config, package.json)
    even if unzipped inside a nested wrapper folder.
    Prioritizes Java Maven (pom.xml) and Gradle (build.gradle) above package.json.
    Returns (root_path, framework_type).
    """
    path = Path(project_path)
    if not path.exists():
        return path, "unknown"

    ignored_dirs = {"target", "node_modules", ".git", ".idea", "apache-maven-3.9.16", "platform-tools", "logs", "__pycache__", "dist", "build"}

    # Pass 1: Prioritize Maven pom.xml recursively
    if (path / "pom.xml").exists():
        return path, "maven"
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        if "pom.xml" in files:
            return Path(root), "maven"

    # Pass 2: Prioritize Gradle build.gradle recursively
    if (path / "build.gradle").exists() or (path / "build.gradle.kts").exists():
        return path, "gradle"
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        if "build.gradle" in files or "build.gradle.kts" in files:
            return Path(root), "gradle"

    # Pass 3: Playwright configuration
    if (path / "playwright.config.ts").exists() or (path / "playwright.config.js").exists():
        return path, "playwright"
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        if "playwright.config.ts" in files or "playwright.config.js" in files:
            return Path(root), "playwright"

    # Pass 4: package.json / Node.js
    if (path / "package.json").exists():
        try:
            content = (path / "package.json").read_text(encoding="utf-8", errors="ignore")
            if "playwright" in content.lower():
                return path, "playwright"
        except Exception:
            pass
        return path, "javascript"

    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        if "package.json" in files:
            p = Path(root)
            try:
                content = (p / "package.json").read_text(encoding="utf-8", errors="ignore")
                if "playwright" in content.lower():
                    return p, "playwright"
            except Exception:
                pass
            return p, "javascript"

    return path, "unknown"


def inspect_project(project_path: str) -> Dict[str, Any]:
    """
    Inspects an unzipped project folder to auto-detect its framework type
    (Maven, Gradle, Playwright, JS) and extracts all detected test file paths.
    """
    path = Path(project_path)
    if not path.exists() or not path.is_dir():
        return {
            "framework_type": "unknown",
            "test_files": [],
            "test_count": 0,
            "error": "Target directory does not exist"
        }

    # 1. Framework & Root Path Auto-Detection
    project_root, framework_type = find_project_root(project_path)

    # 2. Test File Parser
    test_files: List[str] = []
    ignored_dirs = {"target", "node_modules", ".git", ".idea", "apache-maven-3.9.16", "platform-tools", "logs", "__pycache__", "dist", "build"}

    if framework_type in ("maven", "gradle"):
        # Scan project recursively for *Test.java, *Tests.java, Test*.java
        for root, dirs, files in os.walk(path):
            dirs[:] = [d for d in dirs if d not in ignored_dirs]
            for file in files:
                if (fnmatch.fnmatch(file, "*Test.java") or 
                    fnmatch.fnmatch(file, "*Tests.java") or 
                    fnmatch.fnmatch(file, "Test*.java")):
                    full_p = Path(root) / file
                    try:
                        rel_p = str(full_p.relative_to(path)).replace("\\", "/")
                        if rel_p not in test_files:
                            test_files.append(rel_p)
                    except ValueError:
                        pass

    elif framework_type in ("playwright", "javascript"):
        # Scan tests/ or src/ or whole project for *.spec.ts, *.test.ts, *.spec.js, *.test.js
        patterns = ["*.spec.ts", "*.test.ts", "*.spec.js", "*.test.js"]
        for root, dirs, files in os.walk(path):
            dirs[:] = [d for d in dirs if d not in ignored_dirs]
            for file in files:
                if any(fnmatch.fnmatch(file, pat) for pat in patterns):
                    full_p = Path(root) / file
                    try:
                        rel_p = str(full_p.relative_to(path)).replace("\\", "/")
                        if rel_p not in test_files:
                            test_files.append(rel_p)
                    except ValueError:
                        pass
    else:
        # Fallback generic scanner
        patterns = ["*Test.java", "*Tests.java", "Test*.java", "*.spec.ts", "*.test.ts", "*.spec.js", "*.test.js", "test_*.py", "*_test.py"]
        for root, dirs, files in os.walk(path):
            dirs[:] = [d for d in dirs if d not in ignored_dirs]
            for file in files:
                if any(fnmatch.fnmatch(file, pat) for pat in patterns):
                    full_p = Path(root) / file
                    try:
                        rel_p = str(full_p.relative_to(path)).replace("\\", "/")
                        if rel_p not in test_files:
                            test_files.append(rel_p)
                    except ValueError:
                        pass

    # Sort test files deterministically
    test_files.sort()

    return {
        "framework_type": framework_type,
        "test_files": test_files,
        "test_count": len(test_files),
    }
