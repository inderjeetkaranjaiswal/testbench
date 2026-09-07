import os
import sys
import shutil
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

# Base repository and backend directories
BACKEND_DIR = Path(__file__).resolve().parent.parent
BASE_DIR = BACKEND_DIR.parent  # Repository root


def get_workspace_dir() -> Path:
    """
    Returns the resolved Path to the TestBench workspace directory.
    Priority:
    1. TESTBENCH_WORKSPACE environment variable
    2. Default <repo_root>/workspace directory
    """
    env_ws = os.environ.get("TESTBENCH_WORKSPACE")
    if env_ws and env_ws.strip():
        ws_path = Path(env_ws.strip()).resolve()
    else:
        ws_path = (BASE_DIR / "workspace").resolve()

    ws_path.mkdir(parents=True, exist_ok=True)
    return ws_path


def get_logs_dir() -> Path:
    """Returns the resolved Path to the workspace logs directory."""
    logs_path = get_workspace_dir() / "logs"
    logs_path.mkdir(parents=True, exist_ok=True)
    return logs_path


def get_db_path() -> Path:
    """Returns the resolved Path to the SQLite database file."""
    return get_workspace_dir() / "testbench.db"


def _safe_home() -> Optional[Path]:
    try:
        return Path.home()
    except Exception:
        return None


def find_adb(force_refresh: bool = False) -> Optional[str]:
    """
    Locates the adb executable across Windows, macOS, and Linux.
    Priority:
    1. ADB_COMMAND environment variable
    2. ANDROID_HOME / ANDROID_SDK_ROOT platform-tools
    3. System PATH (shutil.which)
    4. Standard OS Android SDK locations
    """
    # 1. Explicit override
    explicit = os.environ.get("ADB_COMMAND")
    if explicit and explicit.strip():
        cand = shutil.which(explicit.strip()) or explicit.strip()
        if Path(cand).exists() or shutil.which(cand):
            return str(cand)

    # 2. ANDROID_HOME / ANDROID_SDK_ROOT
    for env_var in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        sdk_root = os.environ.get(env_var)
        if sdk_root and sdk_root.strip():
            exe_name = "adb.exe" if os.name == 'nt' else "adb"
            cand = Path(sdk_root.strip()) / "platform-tools" / exe_name
            if cand.exists() and cand.is_file():
                return str(cand)

    # 3. System PATH
    in_path = shutil.which("adb") or shutil.which("adb.exe")
    if in_path:
        return in_path

    # 4. Standard platform locations
    home = _safe_home()
    standard_paths = []
    if home:
        standard_paths.extend([
            # Windows
            home / "AppData/Local/Android/Sdk/platform-tools/adb.exe",
            home / "AppData/Local/Android/sdk/platform-tools/adb.exe",
            # macOS / Linux
            home / "Library/Android/sdk/platform-tools/adb",
            home / "Android/Sdk/platform-tools/adb",
        ])

    standard_paths.extend([
        Path(r"C:\Android\platform-tools\adb.exe"),
        Path(r"C:\platform-tools\adb.exe"),
        Path("/opt/homebrew/bin/adb"),
        Path("/usr/local/bin/adb"),
        Path("/usr/bin/adb"),
    ])

    for p in standard_paths:
        if p.exists() and p.is_file():
            return str(p)

    return None


def find_emulator(force_refresh: bool = False) -> Optional[str]:
    """
    Locates the Android emulator executable.
    Priority:
    1. EMULATOR_COMMAND environment variable
    2. ANDROID_HOME / ANDROID_SDK_ROOT emulator
    3. System PATH (shutil.which)
    4. Standard OS Android SDK emulator locations
    5. Inferred from ADB location if found
    """
    # 1. Explicit override
    explicit = os.environ.get("EMULATOR_COMMAND")
    if explicit and explicit.strip():
        cand = shutil.which(explicit.strip()) or explicit.strip()
        if Path(cand).exists() or shutil.which(cand):
            return str(cand)

    # 2. ANDROID_HOME / ANDROID_SDK_ROOT
    for env_var in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        sdk_root = os.environ.get(env_var)
        if sdk_root and sdk_root.strip():
            exe_name = "emulator.exe" if os.name == 'nt' else "emulator"
            cand = Path(sdk_root.strip()) / "emulator" / exe_name
            if cand.exists() and cand.is_file():
                return str(cand)

    # 3. System PATH
    in_path = shutil.which("emulator") or shutil.which("emulator.exe")
    if in_path:
        return in_path

    # 4. Standard platform locations
    home = _safe_home()
    standard_paths = []
    if home:
        standard_paths.extend([
            # Windows
            home / "AppData/Local/Android/Sdk/emulator/emulator.exe",
            home / "AppData/Local/Android/sdk/emulator/emulator.exe",
            # macOS / Linux
            home / "Library/Android/sdk/emulator/emulator",
            home / "Android/Sdk/emulator/emulator",
        ])

    standard_paths.extend([
        Path(r"C:\Android\emulator\emulator.exe"),
        Path(r"C:\Android\Sdk\emulator\emulator.exe"),
        Path("/opt/homebrew/bin/emulator"),
        Path("/usr/local/bin/emulator"),
    ])

    for p in standard_paths:
        if p.exists() and p.is_file():
            return str(p)

    # 5. Inferred from ADB location
    adb_path = find_adb()
    if adb_path:
        sdk_dir = Path(adb_path).parent.parent
        exe_name = "emulator.exe" if os.name == 'nt' else "emulator"
        cand = sdk_dir / "emulator" / exe_name
        if cand.exists() and cand.is_file():
            return str(cand)

    return None


def find_maven(project_root: Optional[Path] = None) -> Optional[str]:
    """
    Locates the Maven executable (mvn or mvn.cmd).
    Priority:
    1. MAVEN_COMMAND environment variable
    2. System PATH (shutil.which)
    3. Embedded Maven inside project directory if available
    """
    # 1. Explicit override
    explicit = os.environ.get("MAVEN_COMMAND")
    if explicit and explicit.strip():
        cand = shutil.which(explicit.strip()) or explicit.strip()
        if Path(cand).exists() or shutil.which(cand):
            return str(cand)

    # 2. System PATH
    in_path = shutil.which("mvn") or shutil.which("mvn.cmd")
    if in_path:
        return in_path

    # 3. Embedded in project if specified
    if project_root and project_root.exists():
        bin_name = "mvn.cmd" if os.name == 'nt' else "mvn"
        cand = project_root / "apache-maven-3.9.16" / "bin" / bin_name
        if cand.exists():
            return str(cand)

        for p in project_root.glob(f"**/{bin_name}"):
            if p.exists() and p.is_file():
                return str(p)

    # 4. Search in parent directory (e.g. callhealth folder) and standard locations
    bin_name = "mvn.cmd" if os.name == 'nt' else "mvn"
    search_dirs = [
        BASE_DIR.parent,  # e.g. C:\Users\Bhargav\Documents\callhealth
        Path(r"C:\Program Files\apache-maven"),
        Path(r"C:\Program Files (x86)\apache-maven"),
        Path(r"C:\apache-maven"),
        Path(r"C:\maven"),
    ]
    home = _safe_home()
    if home:
        search_dirs.extend([
            home / "apache-maven",
            home / "maven",
            home / ".m2"
        ])

    for search_dir in search_dirs:
        if search_dir and search_dir.exists():
            direct_cand = search_dir / "bin" / bin_name
            if direct_cand.exists() and direct_cand.is_file():
                return str(direct_cand)
            try:
                for match in search_dir.glob(f"**/{bin_name}"):
                    if match.exists() and match.is_file() and "bin" in match.parts:
                        return str(match)
            except Exception:
                pass

    return None


def find_node() -> Optional[str]:
    """
    Locates the Node.js executable.
    Priority:
    1. NODE_COMMAND environment variable
    2. System PATH
    """
    explicit = os.environ.get("NODE_COMMAND")
    if explicit and explicit.strip():
        cand = explicit.strip()
        if Path(cand).exists() or shutil.which(cand) or cand:
            return str(cand)

    return shutil.which("node") or shutil.which("node.exe")


def find_npx() -> Optional[str]:
    """
    Locates the npx executable.
    Priority:
    1. NPX_COMMAND environment variable
    2. System PATH
    """
    explicit = os.environ.get("NPX_COMMAND")
    if explicit and explicit.strip():
        cand = explicit.strip()
        if Path(cand).exists() or shutil.which(cand) or cand:
            return str(cand)

    return shutil.which("npx") or shutil.which("npx.cmd")


def find_appium() -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Detects whether Appium is available to execute.
    Returns (available, command_or_path, details_or_error).
    Priority:
    1. APPIUM_COMMAND environment variable
    2. Standalone appium in PATH
    3. npx appium if npx is available
    """
    explicit = os.environ.get("APPIUM_COMMAND")
    if explicit and explicit.strip():
        cmd = explicit.strip()
        return True, cmd, "Configured via APPIUM_COMMAND"

    appium_in_path = shutil.which("appium") or shutil.which("appium.cmd")
    if appium_in_path:
        return True, appium_in_path, "Found standalone appium executable in PATH"

    npx_bin = find_npx()
    if npx_bin:
        return True, f"{npx_bin} appium", "Available via npx runner"

    return False, None, "Appium not found (neither standalone 'appium' nor 'npx' available)"


def find_ffmpeg() -> Optional[str]:
    """
    Locates the FFmpeg executable.
    Priority:
    1. FFMPEG_COMMAND environment variable
    2. imageio_ffmpeg bundled binary
    3. System PATH
    4. Common install locations
    """
    explicit = os.environ.get("FFMPEG_COMMAND")
    if explicit and explicit.strip():
        cand = shutil.which(explicit.strip()) or explicit.strip()
        if Path(cand).exists() or shutil.which(cand):
            return str(cand)

    try:
        import imageio_ffmpeg
        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and Path(exe).exists():
            return str(exe)
    except Exception:
        pass

    in_path = shutil.which("ffmpeg") or shutil.which("ffmpeg.exe")
    if in_path:
        return in_path

    cand_paths = [
        Path(r"C:\ffmpeg\bin\ffmpeg.exe"),
        Path(r"C:\Program Files\ffmpeg\bin\ffmpeg.exe"),
        Path("/usr/bin/ffmpeg"),
        Path("/usr/local/bin/ffmpeg"),
        Path("/opt/homebrew/bin/ffmpeg"),
    ]
    for p in cand_paths:
        if p.exists() and p.is_file():
            return str(p)

    return None


def find_scrcpy_server_jar() -> Optional[str]:
    """
    Locates scrcpy-server.jar.
    Priority:
    1. SCRCPY_SERVER_PATH environment variable
    2. Bundled assets in backend/app/assets/scrcpy-server.jar
    3. Standard scrcpy install paths
    """
    env_path = os.environ.get("SCRCPY_SERVER_PATH")
    if env_path and Path(env_path).exists():
        return env_path

    bundled_jar = BACKEND_DIR / "app" / "assets" / "scrcpy-server.jar"
    if bundled_jar.exists():
        return str(bundled_jar)

    home = _safe_home()
    known_locations = []
    if home:
        known_locations.append(home / "AppData/Local/Programs/scrcpy/scrcpy-server")
    known_locations.extend([
        Path("/usr/local/share/scrcpy/scrcpy-server"),
        Path("/usr/share/scrcpy/scrcpy-server"),
        Path("/opt/homebrew/share/scrcpy/scrcpy-server"),
        Path(r"C:\scrcpy\scrcpy-server.jar"),
        Path(r"C:\scrcpy\scrcpy-server"),
    ])
    for p in known_locations:
        if p.exists():
            return str(p)

    return None


def get_diagnostics() -> Dict[str, Any]:
    """
    Evaluates system environment and returns dependency diagnostics without exposing sensitive data.
    """
    ws = get_workspace_dir()
    adb_p = find_adb()
    emu_p = find_emulator()
    mvn_p = find_maven()
    node_p = find_node()
    npx_p = find_npx()
    appium_avail, appium_cmd, appium_detail = find_appium()
    ffmpeg_p = find_ffmpeg()
    scrcpy_p = find_scrcpy_server_jar()

    # Android SDK directory evaluation
    android_home = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if not android_home and adb_p:
        android_home = str(Path(adb_p).parent.parent)

    dependencies = [
        {
            "name": "Python",
            "available": True,
            "path": sys.executable,
            "version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        },
        {
            "name": "ADB",
            "available": adb_p is not None,
            "path": adb_p,
            "error": None if adb_p else "ADB executable not found in PATH or Android SDK locations.",
        },
        {
            "name": "Android SDK",
            "available": android_home is not None and Path(android_home).exists(),
            "path": android_home,
            "error": None if (android_home and Path(android_home).exists()) else "ANDROID_HOME / ANDROID_SDK_ROOT not set or directory does not exist.",
        },
        {
            "name": "Android Emulator",
            "available": emu_p is not None,
            "path": emu_p,
            "error": None if emu_p else "Android Emulator executable not found in PATH or Android SDK.",
        },
        {
            "name": "Maven",
            "available": mvn_p is not None,
            "path": mvn_p,
            "error": None if mvn_p else "Maven executable (mvn/mvn.cmd) not found in PATH.",
        },
        {
            "name": "Node.js",
            "available": node_p is not None,
            "path": node_p,
            "error": None if node_p else "Node.js executable not found in PATH.",
        },
        {
            "name": "npx",
            "available": npx_p is not None,
            "path": npx_p,
            "error": None if npx_p else "npx executable not found in PATH.",
        },
        {
            "name": "Appium",
            "available": appium_avail,
            "path": appium_cmd,
            "error": None if appium_avail else appium_detail,
        },
        {
            "name": "FFmpeg",
            "available": ffmpeg_p is not None,
            "path": ffmpeg_p,
            "error": None if ffmpeg_p else "FFmpeg executable not found (imageio-ffmpeg or system PATH).",
        },
        {
            "name": "scrcpy-server",
            "available": scrcpy_p is not None,
            "path": scrcpy_p,
            "error": None if scrcpy_p else "scrcpy-server.jar asset not found.",
        },
    ]

    all_critical_present = all(
        d["available"] for d in dependencies if d["name"] in ("Python", "ADB", "workspace")
    )

    return {
        "status": "healthy" if all_critical_present else "degraded",
        "workspace": {
            "path": str(ws),
            "exists": ws.exists(),
            "is_directory": ws.is_dir(),
        },
        "dependencies": dependencies,
    }


def log_startup_diagnostics():
    """Prints a concise startup environment diagnostic summary."""
    diag = get_diagnostics()
    print("=" * 60)
    print(" [TestBench] Environment Initialization Summary")
    print(f" [TestBench] Workspace : {diag['workspace']['path']}")
    for dep in diag["dependencies"]:
        status_icon = "OK" if dep["available"] else "MISSING"
        val = dep.get("path") or dep.get("error")
        print(f" [TestBench] {dep['name']:<16} : [{status_icon:<7}] {val}")
    print("=" * 60)
