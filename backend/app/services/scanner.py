import os
import re
import fnmatch
import ast
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict, field
import yaml


@dataclass
class DiscoveredTest:
    id: str
    name: str
    display_name: str
    class_name: Optional[str]
    method_name: Optional[str]
    file: str
    framework: str
    language: str
    test_framework: str
    execution_target: str
    group: Optional[str] = None
    line_number: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ProjectMetadata:
    id: str
    name: str
    root_path: str
    language: str
    framework: str
    frameworks: List[str]
    build_system: str
    test_framework: str
    platform: str
    test_count: int
    test_files: List[str]
    tests: List[DiscoveredTest] = field(default_factory=list)
    confidence: str = "high"
    evidence: List[str] = field(default_factory=list)
    has_manifest: bool = False
    entry_command: Optional[str] = None
    device_requirements: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["tests"] = [t if isinstance(t, dict) else t.to_dict() for t in self.tests]
        return d


def get_project_manifest(project_path: str) -> Optional[Dict[str, Any]]:
    """
    Looks for automation.yaml or automation.yml in the project root or subdirectories.
    Returns the parsed manifest dictionary if found.
    """
    path = Path(project_path)
    if not path.exists():
        return None

    manifest_names = ("automation.yaml", "automation.yml")
    for name in manifest_names:
        direct = path / name
        if direct.is_file():
            try:
                content = direct.read_text(encoding="utf-8", errors="ignore")
                parsed = yaml.safe_load(content)
                if isinstance(parsed, dict):
                    parsed["_manifest_dir"] = str(path)
                    return parsed
            except Exception as e:
                print(f"[MANIFEST PARSE ERROR] {e}")

    ignored_dirs = {"target", "node_modules", ".git", ".idea", "platform-tools", "logs", "__pycache__", "dist", "build", ".venv", "venv"}
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        for name in manifest_names:
            if name in files:
                m_path = Path(root) / name
                try:
                    content = m_path.read_text(encoding="utf-8", errors="ignore")
                    parsed = yaml.safe_load(content)
                    if isinstance(parsed, dict):
                        parsed["_manifest_dir"] = str(Path(root))
                        return parsed
                except Exception as e:
                    print(f"[MANIFEST PARSE ERROR] {e}")

    return None


def find_project_root(project_path: str) -> Tuple[Path, str]:
    """
    Finds the build root directory and primary build/framework identifier.
    Prioritizes automation manifest, pom.xml, build.gradle, playwright.config, package.json, pyproject.toml.
    """
    path = Path(project_path)
    if not path.exists():
        return path, "unknown"

    manifest = get_project_manifest(project_path)
    if manifest and manifest.get("framework"):
        manifest_dir = Path(manifest.get("_manifest_dir", str(path)))
        framework = str(manifest.get("framework")).lower().strip()
        if framework == "appium" and (manifest.get("language") == "java" or (manifest_dir / "pom.xml").exists()):
            return manifest_dir, "maven"
        return manifest_dir, framework

    ignored_dirs = {"target", "node_modules", ".git", ".idea", "platform-tools", "logs", "__pycache__", "dist", "build", ".venv", "venv"}

    # Pass 1: Maven pom.xml
    if (path / "pom.xml").exists():
        return path, "maven"
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        if "pom.xml" in files:
            return Path(root), "maven"

    # Pass 2: Gradle build.gradle
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
        return path, "javascript"
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        if "package.json" in files:
            return Path(root), "javascript"

    # Pass 5: Python pytest / pyproject / requirements
    if (path / "pytest.ini").exists() or (path / "pyproject.toml").exists() or (path / "requirements.txt").exists():
        return path, "pytest"
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        if "pytest.ini" in files or "pyproject.toml" in files or "requirements.txt" in files:
            return Path(root), "pytest"

    return path, "unknown"


# ==============================================================================
# STATIC TEST METHOD PARSERS
# ==============================================================================

def _parse_java_test_file(
    file_path: Path,
    rel_path: str,
    framework: str,
    test_framework: str
) -> List[DiscoveredTest]:
    """
    Statically parses Java source file to discover @Test annotated methods.
    Works for both TestNG and JUnit (JUnit 4 and JUnit 5 Jupiter).
    """
    discovered: List[DiscoveredTest] = []
    try:
        content = file_path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return discovered

    # Determine class name
    class_match = re.search(r'(?:public\s+)?(?:final\s+)?class\s+(\w+)', content)
    class_name = class_match.group(1) if class_match else file_path.stem

    # Pattern for @Test annotations preceding method declarations
    # Handles: @Test, @Test(...), @org.testng.annotations.Test, @org.junit.Test, @org.junit.jupiter.api.Test
    method_pattern = re.compile(
        r'@(?:[a-zA-Z0-9_\.]+\.)?Test\b(?:\s*\([^)]*\))?'
        r'(?:[\s\n\r]*@[a-zA-Z0-9_]+(?:\([^)]*\))?)*'
        r'[\s\n\r]*(?:public|protected|private)?\s*(?:static\s+)?(?:final\s+)?'
        r'(?:void|[\w\<\>\[\]]+)\s+([a-zA-Z0-9_]+)\s*\(',
        re.MULTILINE
    )

    lines = content.splitlines()
    for match in method_pattern.finditer(content):
        method_name = match.group(1)
        if method_name in ("if", "for", "while", "switch", "catch"):
            continue

        # Approximate line number
        start_pos = match.start()
        line_num = content[:start_pos].count("\n") + 1

        target = f"{class_name}#{method_name}"
        test_id = f"{rel_path}#{method_name}"

        discovered.append(DiscoveredTest(
            id=test_id,
            name=method_name,
            display_name=method_name,
            class_name=class_name,
            method_name=method_name,
            file=rel_path,
            framework=framework,
            language="java",
            test_framework=test_framework,
            execution_target=target,
            line_number=line_num
        ))

    # If no individual methods found with @Test, fallback to file/class representation
    if not discovered:
        discovered.append(DiscoveredTest(
            id=rel_path,
            name=class_name,
            display_name=class_name,
            class_name=class_name,
            method_name=None,
            file=rel_path,
            framework=framework,
            language="java",
            test_framework=test_framework,
            execution_target=rel_path
        ))

    return discovered


def _parse_python_test_file(
    file_path: Path,
    rel_path: str,
    framework: str
) -> List[DiscoveredTest]:
    """
    Statically parses Python test file to extract pytest test functions and classes.
    """
    import textwrap
    discovered: List[DiscoveredTest] = []
    try:
        raw_content = file_path.read_text(encoding="utf-8", errors="ignore")
        content = textwrap.dedent(raw_content)
        tree = ast.parse(content, filename=str(file_path))
    except Exception:
        # Fallback regex parser if AST fails
        return _parse_python_test_file_regex(file_path, rel_path, framework)

    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name.startswith("test_"):
            discovered.append(DiscoveredTest(
                id=f"{rel_path}::{node.name}",
                name=node.name,
                display_name=node.name,
                class_name=None,
                method_name=node.name,
                file=rel_path,
                framework=framework,
                language="python",
                test_framework="pytest",
                execution_target=f"{rel_path}::{node.name}",
                line_number=node.lineno
            ))
        elif isinstance(node, ast.ClassDef) and (node.name.startswith("Test") or node.name.endswith("Test")):
            for item in node.body:
                if isinstance(item, ast.FunctionDef) and item.name.startswith("test_"):
                    discovered.append(DiscoveredTest(
                        id=f"{rel_path}::{node.name}::{item.name}",
                        name=item.name,
                        display_name=f"{node.name}.{item.name}",
                        class_name=node.name,
                        method_name=item.name,
                        file=rel_path,
                        framework=framework,
                        language="python",
                        test_framework="pytest",
                        execution_target=f"{rel_path}::{node.name}::{item.name}",
                        line_number=item.lineno
                    ))

    if not discovered:
        discovered.append(DiscoveredTest(
            id=rel_path,
            name=file_path.stem,
            display_name=file_path.stem,
            class_name=None,
            method_name=None,
            file=rel_path,
            framework=framework,
            language="python",
            test_framework="pytest",
            execution_target=rel_path
        ))

    return discovered


def _parse_python_test_file_regex(
    file_path: Path,
    rel_path: str,
    framework: str
) -> List[DiscoveredTest]:
    discovered: List[DiscoveredTest] = []
    try:
        content = file_path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return discovered

    current_class = None
    lines = content.splitlines()
    for line in lines:
        cls_match = re.match(r'^\s*class\s+(Test\w+|\w+Test)\b', line)
        if cls_match:
            current_class = cls_match.group(1)
            continue

        fn_match = re.match(r'^\s*def\s+(test_[a-zA-Z0-9_]+)\s*\(', line)
        if fn_match:
            fn_name = fn_match.group(1)
            if current_class and line.startswith((' ', '\t')):
                target = f"{rel_path}::{current_class}::{fn_name}"
                disp_name = f"{current_class}.{fn_name}"
                cls = current_class
            else:
                target = f"{rel_path}::{fn_name}"
                disp_name = fn_name
                cls = None

            discovered.append(DiscoveredTest(
                id=target,
                name=fn_name,
                display_name=disp_name,
                class_name=cls,
                method_name=fn_name,
                file=rel_path,
                framework=framework,
                language="python",
                test_framework="pytest",
                execution_target=target
            ))

    return discovered


def _parse_playwright_test_file(
    file_path: Path,
    rel_path: str,
    language: str
) -> List[DiscoveredTest]:
    """
    Statically parses Playwright TS/JS test files for test() and test.describe() definitions.
    """
    discovered: List[DiscoveredTest] = []
    try:
        content = file_path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return discovered

    # Match test('title', ...) or test("title", ...) or test(`title`, ...)
    test_pattern = re.compile(
        r'(?:test|it)(?:\.(?:only|skip|fixme))?\s*\(\s*(?:[\'"]([^\'"]+)[\'"]|`([^`]+)`)\s*,',
        re.MULTILINE
    )

    for match in test_pattern.finditer(content):
        test_title = match.group(1) or match.group(2) or "test"
        start_pos = match.start()
        line_num = content[:start_pos].count("\n") + 1

        discovered.append(DiscoveredTest(
            id=f"{rel_path}#{test_title}",
            name=test_title,
            display_name=test_title,
            class_name=None,
            method_name=test_title,
            file=rel_path,
            framework="playwright",
            language=language,
            test_framework="playwright",
            execution_target=f"{rel_path}",
            line_number=line_num
        ))

    if not discovered:
        discovered.append(DiscoveredTest(
            id=rel_path,
            name=file_path.stem,
            display_name=file_path.stem,
            class_name=None,
            method_name=None,
            file=rel_path,
            framework="playwright",
            language=language,
            test_framework="playwright",
            execution_target=rel_path
        ))

    return discovered


# ==============================================================================
# CORE GENERIC PROJECT INSPECTION ENGINE
# ==============================================================================

def inspect_project(project_path: str) -> Dict[str, Any]:
    """
    Performs complete, deterministic, evidence-weighted project inspection and static test discovery.
    Identifies language, framework, build system, test framework, platform, and individual tests.
    """
    path = Path(project_path)
    if not path.exists() or not path.is_dir():
        meta = ProjectMetadata(
            id=path.name,
            name=path.name,
            root_path=str(path),
            language="unknown",
            framework="generic",
            frameworks=[],
            build_system="unknown",
            test_framework="unknown",
            platform="unknown",
            test_count=0,
            test_files=[],
            confidence="low",
            evidence=["Directory does not exist"]
        )
        return meta.to_dict()

    evidence: List[str] = []
    framework_scores = {"appium": 0, "selenium": 0, "playwright": 0}
    lang_scores = {"java": 0, "python": 0, "typescript": 0, "javascript": 0}
    build_scores = {"maven": 0, "gradle": 0, "npm": 0, "pnpm": 0, "yarn": 0, "pytest": 0}
    test_framework_scores = {"testng": 0, "junit": 0, "pytest": 0, "playwright": 0}

    ignored_dirs = {"target", "node_modules", ".git", ".idea", "platform-tools", "logs", "__pycache__", "dist", "build", ".venv", "venv"}

    # 1. Inspect manifest if present
    manifest = get_project_manifest(project_path)
    if manifest:
        evidence.append("automation.yaml manifest present")
        if manifest.get("framework"):
            f_norm = str(manifest["framework"]).lower().strip()
            if f_norm in framework_scores:
                framework_scores[f_norm] += 100
        if manifest.get("language"):
            l_norm = str(manifest["language"]).lower().strip()
            if l_norm in lang_scores:
                lang_scores[l_norm] += 100

    # 2. Inspect Build Configuration & Dependencies
    # Maven (pom.xml)
    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        if "pom.xml" in files:
            build_scores["maven"] += 50
            lang_scores["java"] += 30
            evidence.append(f"Found Maven pom.xml in {Path(root).name or 'root'}")
            try:
                pom_content = (Path(root) / "pom.xml").read_text(encoding="utf-8", errors="ignore")
                if "io.appium" in pom_content or "java-client" in pom_content:
                    framework_scores["appium"] += 40
                    evidence.append("pom.xml contains io.appium dependency")
                if "org.seleniumhq.selenium" in pom_content or "selenium-java" in pom_content:
                    framework_scores["selenium"] += 40
                    evidence.append("pom.xml contains selenium-java dependency")
                if "org.testng" in pom_content or "testng" in pom_content:
                    test_framework_scores["testng"] += 40
                    evidence.append("pom.xml contains TestNG dependency")
                if "junit" in pom_content.lower():
                    test_framework_scores["junit"] += 30
                    evidence.append("pom.xml contains JUnit dependency")
            except Exception:
                pass

        if "build.gradle" in files or "build.gradle.kts" in files:
            build_scores["gradle"] += 50
            lang_scores["java"] += 30
            evidence.append(f"Found Gradle build file in {Path(root).name or 'root'}")

        if "package.json" in files:
            build_scores["npm"] += 30
            lang_scores["javascript"] += 20
            evidence.append(f"Found package.json in {Path(root).name or 'root'}")
            try:
                pkg_content = (Path(root) / "package.json").read_text(encoding="utf-8", errors="ignore")
                if "@playwright/test" in pkg_content or '"playwright"' in pkg_content:
                    framework_scores["playwright"] += 50
                    test_framework_scores["playwright"] += 50
                    evidence.append("package.json contains @playwright/test dependency")
                if "appium" in pkg_content or "webdriverio" in pkg_content:
                    framework_scores["appium"] += 40
                    evidence.append("package.json contains appium/webdriverio dependency")
                if "selenium-webdriver" in pkg_content:
                    framework_scores["selenium"] += 40
                    evidence.append("package.json contains selenium-webdriver dependency")
            except Exception:
                pass

        if "playwright.config.ts" in files:
            framework_scores["playwright"] += 50
            test_framework_scores["playwright"] += 50
            lang_scores["typescript"] += 40
            evidence.append("Found playwright.config.ts")
        elif "playwright.config.js" in files:
            framework_scores["playwright"] += 50
            test_framework_scores["playwright"] += 50
            lang_scores["javascript"] += 40
            evidence.append("Found playwright.config.js")

        if "pytest.ini" in files or "conftest.py" in files:
            build_scores["pytest"] += 40
            lang_scores["python"] += 40
            test_framework_scores["pytest"] += 40
            evidence.append("Found pytest configuration (pytest.ini/conftest.py)")

        if "requirements.txt" in files:
            lang_scores["python"] += 30
            try:
                req_content = (Path(root) / "requirements.txt").read_text(encoding="utf-8", errors="ignore")
                if "pytest" in req_content:
                    test_framework_scores["pytest"] += 30
                if "Appium-Python-Client" in req_content or "appium" in req_content.lower():
                    framework_scores["appium"] += 40
                    evidence.append("requirements.txt contains Appium-Python-Client")
                if "selenium" in req_content.lower():
                    framework_scores["selenium"] += 40
                    evidence.append("requirements.txt contains selenium")
            except Exception:
                pass

    # 3. Scan Files & Source Code Usages
    test_files_map: List[Tuple[Path, str, str]] = []  # (Path, rel_path, file_lang)

    for root, dirs, files in os.walk(path):
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        for file in files:
            full_p = Path(root) / file
            rel_p = str(full_p.relative_to(path)).replace("\\", "/")

            if file.endswith(".java"):
                lang_scores["java"] += 2
                if fnmatch.fnmatch(file, "*Test.java") or fnmatch.fnmatch(file, "*Tests.java") or fnmatch.fnmatch(file, "Test*.java"):
                    test_files_map.append((full_p, rel_p, "java"))
                    # Quick header inspect
                    try:
                        content_sample = full_p.read_text(encoding="utf-8", errors="ignore")[:2000]
                        if "io.appium" in content_sample or "AppiumDriver" in content_sample or "AndroidDriver" in content_sample:
                            framework_scores["appium"] += 15
                        if "org.openqa.selenium" in content_sample or "WebDriver" in content_sample:
                            framework_scores["selenium"] += 10
                        if "org.testng" in content_sample:
                            test_framework_scores["testng"] += 15
                        if "org.junit" in content_sample:
                            test_framework_scores["junit"] += 15
                    except Exception:
                        pass

            elif file.endswith(".py"):
                lang_scores["python"] += 2
                if fnmatch.fnmatch(file, "test_*.py") or fnmatch.fnmatch(file, "*_test.py"):
                    test_files_map.append((full_p, rel_p, "python"))
                    try:
                        content_sample = full_p.read_text(encoding="utf-8", errors="ignore")[:2000]
                        if "appium" in content_sample:
                            framework_scores["appium"] += 15
                        if "selenium" in content_sample:
                            framework_scores["selenium"] += 15
                        if "pytest" in content_sample:
                            test_framework_scores["pytest"] += 15
                    except Exception:
                        pass

            elif file.endswith(".ts") or file.endswith(".tsx"):
                lang_scores["typescript"] += 2
                if any(fnmatch.fnmatch(file, pat) for pat in ("*.spec.ts", "*.test.ts", "*.spec.tsx", "*.test.tsx")):
                    test_files_map.append((full_p, rel_p, "typescript"))
                    try:
                        content_sample = full_p.read_text(encoding="utf-8", errors="ignore")[:2000]
                        if "@playwright/test" in content_sample:
                            framework_scores["playwright"] += 20
                    except Exception:
                        pass

            elif file.endswith(".js") or file.endswith(".jsx"):
                lang_scores["javascript"] += 2
                if any(fnmatch.fnmatch(file, pat) for pat in ("*.spec.js", "*.test.js", "*.spec.jsx", "*.test.jsx")):
                    test_files_map.append((full_p, rel_p, "javascript"))

    # 4. Resolve Winner Classifications
    resolved_lang = max(lang_scores, key=lang_scores.get) if max(lang_scores.values()) > 0 else "unknown"
    resolved_build = max(build_scores, key=build_scores.get) if max(build_scores.values()) > 0 else "unknown"
    resolved_test_framework = max(test_framework_scores, key=test_framework_scores.get) if max(test_framework_scores.values()) > 0 else "unknown"

    # Framework resolution with Appium taking priority if mobile drivers are present
    if framework_scores["appium"] > 0 and framework_scores["appium"] >= framework_scores["selenium"] and framework_scores["appium"] >= framework_scores["playwright"]:
        resolved_framework = "appium"
    elif framework_scores["playwright"] > 0 and framework_scores["playwright"] >= framework_scores["selenium"]:
        resolved_framework = "playwright"
    elif framework_scores["selenium"] > 0:
        resolved_framework = "selenium"
    else:
        resolved_framework = "generic"

    # Platform deduction
    if resolved_framework == "appium":
        resolved_platform = "android"
    elif resolved_framework in ("selenium", "playwright"):
        resolved_platform = "web"
    else:
        resolved_platform = "cross-platform"

    # 5. Parse Individual Tests
    discovered_tests: List[DiscoveredTest] = []
    test_files_list: List[str] = []

    for full_p, rel_p, file_lang in test_files_map:
        if rel_p not in test_files_list:
            test_files_list.append(rel_p)

        if file_lang == "java":
            t_framework = resolved_test_framework if resolved_test_framework in ("testng", "junit") else "testng"
            tests_in_file = _parse_java_test_file(full_p, rel_p, resolved_framework, t_framework)
            discovered_tests.extend(tests_in_file)

        elif file_lang == "python":
            tests_in_file = _parse_python_test_file(full_p, rel_p, resolved_framework)
            discovered_tests.extend(tests_in_file)

        elif file_lang in ("typescript", "javascript"):
            if resolved_framework == "playwright":
                tests_in_file = _parse_playwright_test_file(full_p, rel_p, file_lang)
                discovered_tests.extend(tests_in_file)
            else:
                discovered_tests.append(DiscoveredTest(
                    id=rel_p,
                    name=full_p.stem,
                    display_name=full_p.stem,
                    class_name=None,
                    method_name=None,
                    file=rel_p,
                    framework=resolved_framework,
                    language=file_lang,
                    test_framework="javascript",
                    execution_target=rel_p
                ))

    test_files_list.sort()

    active_frameworks = [f for f, score in framework_scores.items() if score > 0]
    if not active_frameworks:
        active_frameworks = [resolved_framework]

    project_meta = ProjectMetadata(
        id=path.name,
        name=path.name,
        root_path=str(path.resolve()),
        language=resolved_lang,
        framework=resolved_framework,
        frameworks=active_frameworks,
        build_system=resolved_build,
        test_framework=resolved_test_framework,
        platform=resolved_platform,
        test_count=len(discovered_tests) if discovered_tests else len(test_files_list),
        test_files=test_files_list,
        tests=discovered_tests,
        confidence="high" if len(evidence) >= 2 else "medium",
        evidence=evidence,
        has_manifest=manifest is not None,
        entry_command=manifest.get("entry_command") if manifest else None,
        device_requirements=manifest.get("device_requirements", {}) if manifest else {}
    )

    # Maintain backward compatibility keys
    ret = project_meta.to_dict()
    ret["framework_type"] = resolved_framework if resolved_framework != "generic" else resolved_build
    return ret
