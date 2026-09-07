import asyncio
import os
import sys
import json
import shutil
import socket
import subprocess
import time
import zipfile
import uuid
import re
import datetime
from pathlib import Path
from typing import Optional, List, Tuple, Dict, Any
from dataclasses import dataclass, asdict
from fastapi import WebSocket, WebSocketDisconnect

from app.services.scanner import inspect_project, find_project_root, get_project_manifest
from app.services.watcher import ExcelReportWatcher
from app.services.adb_bridge import (
    find_adb_executable,
    find_emulator_executable,
    get_online_adb_device_async,
    start_emulator_sync,
    start_emulator_async
)
from app.services.device_manager import device_manager
from app.services.capture_pipeline import capture_pipeline_manager
from app.services.db import start_execution, update_execution_status
from app.config import get_workspace_dir, get_logs_dir, find_maven, find_npx, find_node, find_appium

_installed_apks_cache = set()


@dataclass
class ExecutionSession:
    execution_id: str
    project_id: str
    selected_test: str
    device_id: str
    current_module: str
    current_screen: str
    status: str  # IDLE, RUNNING, COMPLETED, FAILED
    progress: int  # 0 to 100
    start_time: float
    appium_port: int = 4723
    last_action: str = ""
    error_message: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# Multi-Session & Device Pool State
_active_sessions: Dict[str, ExecutionSession] = {}
_latest_session_id: Optional[str] = None
_device_reservations: Dict[str, str] = {}  # device_id -> execution_id
_device_locks: Dict[str, asyncio.Lock] = {}
_device_locks_guard = asyncio.Lock()
_allocated_appium_ports: set = set()
_appium_processes: Dict[str, subprocess.Popen] = {}


def get_active_session(execution_id: Optional[str] = None, device_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Returns the execution session state for execution_id, device_id, or the latest active session.
    Maintains backward compatibility with singular /api/execution/session endpoint.
    """
    global _active_sessions, _latest_session_id
    if execution_id and execution_id in _active_sessions:
        return _active_sessions[execution_id].to_dict()
    if device_id:
        for s in reversed(list(_active_sessions.values())):
            if s.device_id == device_id:
                return s.to_dict()
    if _latest_session_id and _latest_session_id in _active_sessions:
        return _active_sessions[_latest_session_id].to_dict()
    if _active_sessions:
        latest = list(_active_sessions.values())[-1]
        return latest.to_dict()
    return {
        "execution_id": "",
        "project_id": "",
        "selected_test": "",
        "device_id": "",
        "current_module": "Dashboard",
        "current_screen": "Services",
        "status": "IDLE",
        "progress": 0,
        "start_time": 0,
        "appium_port": 4723,
        "last_action": "",
        "error_message": ""
    }


def get_all_active_sessions() -> List[Dict[str, Any]]:
    """Returns all active/recent execution sessions."""
    return [s.to_dict() for s in _active_sessions.values()]


def get_device_reservations() -> Dict[str, str]:
    """Returns current device reservation mapping (device_id -> execution_id)."""
    return dict(_device_reservations)


# ==============================================================================
# APPIUM PORT ALLOCATION & PROCESS LIFECYCLE
# ==============================================================================

_allocated_system_ports = set()


def allocate_appium_port(base_port: int = 4723) -> int:
    """Finds an available local port and reserves it for an Appium session."""
    port = base_port
    while port in _allocated_appium_ports:
        port += 2
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                _allocated_appium_ports.add(port)
                return port
            except OSError:
                port += 2


def release_appium_port(port: int):
    """Releases an allocated Appium port."""
    _allocated_appium_ports.discard(port)


def allocate_system_port(base_port: int = 8200) -> int:
    """Finds an available local port and reserves it for UiAutomator2 systemPort."""
    port = base_port
    while port in _allocated_system_ports:
        port += 2
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                _allocated_system_ports.add(port)
                return port
            except OSError:
                port += 2


def release_system_port(port: int):
    """Releases an allocated systemPort."""
    _allocated_system_ports.discard(port)


def is_appium_ready(port: int) -> bool:
    """Checks whether an Appium server is responding and ready on the specified port."""
    import urllib.request
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/status")
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            return resp.status == 200
    except Exception:
        return False


def start_dedicated_appium_server_sync(
    execution_id: str,
    port: int,
    log_file=None
) -> bool:
    """
    Synchronously spawns a dedicated Appium server instance bound to the allocated port.
    """
    if is_appium_ready(port):
        msg = f"[APPIUM] Appium Server is active on http://127.0.0.1:{port}"
        if log_file:
            log_file.write(f"{msg}\n")
            log_file.flush()
        return True

    msg = f"[APPIUM] Auto-launching dedicated Appium Server on port {port}..."
    if log_file:
        log_file.write(f"{msg}\n")
        log_file.flush()

    has_appium, appium_cmd, _ = find_appium()
    if has_appium and appium_cmd and not appium_cmd.startswith("npx"):
        appium_args = [appium_cmd, "--port", str(port), "--relaxed-security"]
    else:
        npx_bin = find_npx() or shutil.which("npx") or shutil.which("npx.cmd") or "npx"
        appium_args = [npx_bin, "appium", "--port", str(port), "--relaxed-security"]

    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0

    try:
        proc = subprocess.Popen(
            appium_args,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creation_flags
        )
        _appium_processes[execution_id] = proc

        for _ in range(30):
            time.sleep(0.5)
            if is_appium_ready(port):
                success_msg = f"[APPIUM SUCCESS] Dedicated Appium Server online on port {port}!"
                if log_file:
                    log_file.write(f"{success_msg}\n")
                    log_file.flush()
                return True
    except Exception as e:
        err_msg = f"[APPIUM ERROR] Failed to start Appium server on port {port}: {e}"
        if log_file:
            log_file.write(f"{err_msg}\n")
            log_file.flush()

    return False


async def start_dedicated_appium_server(
    execution_id: str,
    port: int,
    websocket: Optional[WebSocket] = None,
    log_file=None
) -> bool:
    """
    Spawns a dedicated Appium server instance bound to the allocated port for a concurrent session.
    """
    if is_appium_ready(port):
        msg = f"[APPIUM] Appium Server active on 127.0.0.1:{port}"
        if websocket:
            await websocket.send_text(msg)
        if log_file:
            log_file.write(f"{msg}\n")
            log_file.flush()
        return True

    msg = f"[APPIUM] Auto-launching dedicated Appium Server on port {port}..."
    if websocket:
        await websocket.send_text(msg)
    if log_file:
        log_file.write(f"{msg}\n")
        log_file.flush()

    has_appium, appium_cmd, _ = find_appium()
    if has_appium and appium_cmd and not appium_cmd.startswith("npx"):
        appium_args = [appium_cmd, "--port", str(port), "--relaxed-security"]
    else:
        npx_bin = find_npx() or shutil.which("npx") or shutil.which("npx.cmd") or "npx"
        appium_args = [npx_bin, "appium", "--port", str(port), "--relaxed-security"]

    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0

    try:
        proc = subprocess.Popen(
            appium_args,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creation_flags
        )
        _appium_processes[execution_id] = proc

        for _ in range(30):
            await asyncio.sleep(0.5)
            if is_appium_ready(port):
                success_msg = f"[APPIUM SUCCESS] Dedicated Appium Server online on port {port}!"
                if websocket:
                    await websocket.send_text(success_msg)
                if log_file:
                    log_file.write(f"{success_msg}\n")
                    log_file.flush()
                return True
    except Exception as e:
        err_msg = f"[APPIUM ERROR] Failed to start Appium server on port {port}: {e}"
        if websocket:
            await websocket.send_text(err_msg)
        if log_file:
            log_file.write(f"{err_msg}\n")
            log_file.flush()

    return False


def stop_dedicated_appium_server(execution_id: str, port: int, system_port: Optional[int] = None):
    """Terminates the dedicated Appium server instance for a session and releases the ports."""
    release_appium_port(port)
    if system_port:
        release_system_port(system_port)
    proc = _appium_processes.pop(execution_id, None)
    if proc:
        try:
            proc.terminate()
            time.sleep(0.2)
            if proc.poll() is None:
                proc.kill()
        except Exception:
            pass


# ==============================================================================
# DEVICE RESERVATIONS & CONCURRENCY MANAGEMENT
# ==============================================================================

async def get_or_create_device_lock(device_id: str) -> asyncio.Lock:
    """Returns an asyncio.Lock dedicated to a specific device serial."""
    return await device_manager.get_or_create_device_lock(device_id)


def resolve_and_prepare_device_sync(target_device_id: Optional[str], execution_id: Optional[str] = None, log_file=None) -> str:
    """
    Resolves target device via Device Manager, boots AVD if needed, wakes screen,
    and acquires reservation.
    """
    exec_id = execution_id or "sync_execution"
    return device_manager.prepare_device_for_execution_sync(target_device_id, exec_id, log_file=log_file)


async def reserve_device_for_execution(target_device_id: Optional[str], execution_id: str, websocket: Optional[WebSocket] = None) -> str:
    """
    Reserves a target device (or discovers the first online device / boots targeted AVD).
    Acquires the device-specific lock so multiple devices can run concurrently.
    """
    return await device_manager.prepare_device_for_execution_async(target_device_id, execution_id, websocket=websocket)


async def release_device_reservation(device_id: str, execution_id: str):
    """Releases the device reservation and unlocks the device."""
    await device_manager.release_device_async(device_id, execution_id)


# ==============================================================================
# ENVIRONMENT SETUP & MANIFEST-DRIVEN TEST RESOLUTION
# ==============================================================================

# CONTRACT SPECIFICATION FOR TEST PROJECTS:
# TestBench injects the following environment variables into every test execution process:
# - APPIUM_URL: Base URL of the dedicated Appium server (e.g. http://127.0.0.1:4723)
# - DEVICE_UDID: ADB serial / UDID of the reserved target device (e.g. emulator-5554)
# - PLATFORM: Target platform name (e.g. android, ios, or web)
# - TESTBENCH_PROJECT_NAME: Name of the active test project
# - TESTBENCH_EXECUTION_ID: Unique UUID for the execution session
# - TESTBENCH_TARGET_DEVICE: Device ID matching DEVICE_UDID
# Projects declaring 'automation.yaml' can consume these environment variables across Python, Node.js, and Java.

def find_mvn_executable(project_path: str) -> str:
    project_root, _ = find_project_root(project_path)
    mvn_bin = find_maven(project_root)
    return mvn_bin or "mvn"


def clean_offline_and_get_online_adb_device(adb_bin: str) -> Optional[str]:
    try:
        res = subprocess.run([adb_bin, "devices"], capture_output=True, text=True, timeout=2.0)
        if res.returncode == 0 and res.stdout:
            for line in res.stdout.splitlines():
                line = line.strip()
                if line and not line.startswith("List of") and "\t" in line:
                    parts = line.split("\t")
                    if len(parts) >= 2 and parts[1].strip() == "device":
                        return parts[0].strip()
    except Exception:
        pass
    return None


def purge_stale_execution_artifacts(project_root: Path):
    try:
        surefire_dir = project_root / "target" / "surefire-reports"
        if surefire_dir.exists():
            shutil.rmtree(surefire_dir, ignore_errors=True)
            print(f"[RUNNER CLEANUP] Purged stale surefire reports in {surefire_dir}")

        logs_dir = project_root / "logs"
        if logs_dir.exists():
            for f in logs_dir.glob("*.xlsx"):
                try:
                    f.unlink()
                except Exception:
                    pass
    except Exception as e:
        print(f"[RUNNER CLEANUP WARNING] {e}")


def extract_apk_package_name(apk_path: Path) -> Optional[str]:
    try:
        with zipfile.ZipFile(apk_path, 'r') as z:
            manifest = z.read('AndroidManifest.xml')

        for encoding in ['utf-16le', 'utf-8', 'latin1']:
            try:
                decoded = manifest.decode(encoding, errors='ignore')
                matches = [
                    m for m in re.findall(r'([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)', decoded)
                    if not any(p.isdigit() for p in m.split('.'))
                    and not m.startswith('schemas')
                    and not m.startswith('android')
                    and not m.startswith('com.android.')
                    and not m.startswith('androidx.')
                ]
                if matches:
                    return matches[0]
            except Exception:
                pass
    except Exception as e:
        print(f"[APK Package Extraction Warning] {e}")
    return None


def is_package_installed_on_device(adb_bin: str, device_id: Optional[str], package_name: str) -> bool:
    try:
        cmd = [adb_bin]
        if device_id:
            cmd.extend(["-s", device_id])
        cmd.extend(["shell", "pm", "list", "packages", package_name])

        creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=2.5, creationflags=creation_flags)

        if res.returncode == 0 and res.stdout:
            for line in res.stdout.splitlines():
                clean_pkg = line.replace("package:", "").strip()
                if clean_pkg == package_name:
                    return True
    except Exception as e:
        print(f"[PM Check Warning] {e}")
    return False


async def ensure_apk_installed(project_root: Path, device_id: Optional[str] = None, websocket: Optional[WebSocket] = None) -> bool:
    global _installed_apks_cache
    apk_files = [p for p in project_root.rglob("*.apk") if "target" not in p.parts]
    if not apk_files:
        return True

    adb_bin = find_adb_executable() or "adb"

    for apk_path in apk_files:
        apk_key = f"{device_id}_{apk_path.resolve()}"
        if apk_key in _installed_apks_cache:
            if websocket:
                await websocket.send_text(f"[ADB] Found APK: {apk_path.name} (Verified installed)")
            continue

        target_dev = device_id or await get_online_adb_device_async(adb_bin)
        pkg_name = extract_apk_package_name(apk_path)
        if pkg_name:
            installed = await asyncio.to_thread(is_package_installed_on_device, adb_bin, target_dev, pkg_name)
            if installed:
                _installed_apks_cache.add(apk_key)
                if websocket:
                    await websocket.send_text(f"[ADB SUCCESS] Package '{pkg_name}' ALREADY installed on {target_dev}.")
                continue

        cmd_abi = [adb_bin]
        if target_dev:
            cmd_abi.extend(["-s", target_dev])
        if target_dev and target_dev.startswith("emulator-"):
            cmd_abi.extend(["install", "--abi", "arm64-v8a", "-r", "-t", str(apk_path)])
        else:
            cmd_abi.extend(["install", "-r", "-t", str(apk_path)])

        if websocket:
            await websocket.send_text(f"[ADB] Installing APK '{apk_path.name}' to {target_dev}...")

        try:
            creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            proc = await asyncio.to_thread(
                subprocess.Popen, cmd_abi, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=creation_flags
            )
            stdout, stderr = await asyncio.to_thread(proc.communicate)
            if proc.returncode != 0 and "Success" not in (stdout + stderr):
                # Fallback to standard install
                cmd_std = [adb_bin]
                if target_dev:
                    cmd_std.extend(["-s", target_dev])
                cmd_std.extend(["install", "-r", "-t", str(apk_path)])
                proc_std = await asyncio.to_thread(
                    subprocess.Popen, cmd_std, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=creation_flags
                )
                stdout, stderr = await asyncio.to_thread(proc_std.communicate)

            if "Success" in (stdout + stderr):
                _installed_apks_cache.add(apk_key)
                if websocket:
                    await websocket.send_text(f"[ADB SUCCESS] Successfully installed {apk_path.name}")
        except Exception:
            pass

    return True


def ensure_apk_installed_sync(project_root: Path, device_id: Optional[str] = None, log_file=None) -> bool:
    global _installed_apks_cache
    apk_files = [
        p for p in project_root.rglob("*.apk")
        if "target" not in p.parts
        and "skins" not in p.parts
        and "emulator" not in p.parts
        and "overlay" not in p.name.lower()
    ]
    if not apk_files:
        return True

    adb_bin = find_adb_executable() or "adb"

    for apk_path in apk_files:
        apk_key = f"{device_id}_{apk_path.resolve()}"
        if apk_key in _installed_apks_cache:
            if log_file:
                log_file.write(f"[ADB] Found APK: {apk_path.name} (Verified installed)\n")
                log_file.flush()
            continue

        target_dev = device_id or clean_offline_and_get_online_adb_device(adb_bin)
        pkg_name = extract_apk_package_name(apk_path)
        if pkg_name:
            installed = is_package_installed_on_device(adb_bin, target_dev, pkg_name)
            if installed:
                _installed_apks_cache.add(apk_key)
                if log_file:
                    log_file.write(f"[ADB SUCCESS] Package '{pkg_name}' ALREADY installed on {target_dev}.\n")
                    log_file.flush()
                continue

        cmd = [adb_bin]
        if target_dev:
            cmd.extend(["-s", target_dev])
        if target_dev and target_dev.startswith("emulator-"):
            cmd.extend(["install", "--abi", "arm64-v8a", "-r", "-t", str(apk_path)])
        else:
            cmd.extend(["install", "-r", "-t", str(apk_path)])

        if log_file:
            log_file.write(f"[ADB] Installing APK: {apk_path.name}\n")
            log_file.flush()

        try:
            creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=60, creationflags=creation_flags)
            if res.returncode != 0 and "Success" not in (res.stdout + res.stderr):
                # Fallback to standard install
                cmd_std = [adb_bin]
                if target_dev:
                    cmd_std.extend(["-s", target_dev])
                cmd_std.extend(["install", "-r", "-t", str(apk_path)])
                res = subprocess.run(cmd_std, capture_output=True, text=True, timeout=60, creationflags=creation_flags)

            if res.returncode == 0 or "Success" in (res.stdout + res.stderr):
                _installed_apks_cache.add(apk_key)
                if log_file:
                    log_file.write(f"[ADB SUCCESS] Successfully installed {apk_path.name}\n")
                    log_file.flush()
            else:
                if log_file:
                    log_file.write(f"[ADB WARNING] APK install notice: {res.stderr.strip() or res.stdout.strip()}\n")
                    log_file.flush()
        except Exception as e:
            if log_file:
                log_file.write(f"[ADB WARNING] APK install exception: {e}\n")
                log_file.flush()

    return True


def setup_project_environment_sync(project_root: Path, language: str, log_file=None) -> Dict[str, str]:
    """
    Prepares runtime environment for the declared language (virtualenv/pip for Python, npm install for Node).
    Returns extra environment variables (e.g. modified PATH).
    """
    env_vars = {}

    if language == "python":
        venv_dir = project_root / ".venv"
        req_file = project_root / "requirements.txt"

        py_exe = sys.executable
        if venv_dir.exists():
            cand_py = venv_dir / "Scripts" / "python.exe" if os.name == 'nt' else venv_dir / "bin" / "python"
            if cand_py.exists():
                py_exe = str(cand_py)
                scripts_dir = str(cand_py.parent)
                env_vars["PATH"] = f"{scripts_dir}{os.pathsep}{os.environ.get('PATH', '')}"
                env_vars["VIRTUAL_ENV"] = str(venv_dir)

        if req_file.exists():
            creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            msg = f"[ENV SETUP] Verifying Python dependencies from {req_file.name}..."
            if log_file:
                log_file.write(f"{msg}\n")
                log_file.flush()
            try:
                subprocess.run(
                    [py_exe, "-m", "pip", "install", "-r", str(req_file), "--quiet"],
                    capture_output=True,
                    timeout=120,
                    creationflags=creation_flags
                )
            except Exception as e:
                if log_file:
                    log_file.write(f"[ENV SETUP WARNING] pip install: {e}\n")
                    log_file.flush()

    elif language in ("node", "javascript", "typescript"):
        pkg_file = project_root / "package.json"
        node_modules = project_root / "node_modules"
        if pkg_file.exists() and not node_modules.exists():
            npm_bin = shutil.which("npm") or shutil.which("npm.cmd") or "npm"
            creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            msg = "[ENV SETUP] Installing Node.js dependencies (npm install)..."
            if log_file:
                log_file.write(f"{msg}\n")
                log_file.flush()
            try:
                subprocess.run(
                    [npm_bin, "install", "--prefer-offline", "--no-audit"],
                    cwd=str(project_root),
                    capture_output=True,
                    timeout=180,
                    creationflags=creation_flags
                )
            except Exception as e:
                if log_file:
                    log_file.write(f"[ENV SETUP WARNING] npm install: {e}\n")
                    log_file.flush()

    return env_vars


def resolve_test_args(
    project_path: str,
    test_file: Optional[str] = None,
    device_id: Optional[str] = None,
    appium_port: int = 4723,
    system_port: Optional[int] = None,
    execution_id: str = ""
) -> Tuple[str, List[str], Dict[str, str], str]:
    """
    Resolves executable, arguments, environment variables, and framework type for running tests.
    Returns (executable, args, env_vars, framework_type).
    """
    project_root, detected_framework = find_project_root(project_path)
    manifest = get_project_manifest(project_path)

    project_name = Path(project_path).name
    target_udid = device_id or "emulator-5554"
    platform_name = "android"

    if manifest and manifest.get("device_requirements"):
        platform_name = manifest["device_requirements"].get("platform", "android")

    # Injected environment variables contract
    env_vars = os.environ.copy()
    env_vars["APPIUM_URL"] = f"http://127.0.0.1:{appium_port}"
    env_vars["DEVICE_UDID"] = target_udid
    if system_port:
        env_vars["SYSTEM_PORT"] = str(system_port)
    env_vars["PLATFORM"] = platform_name
    env_vars["TESTBENCH_PROJECT_NAME"] = str(project_name)
    env_vars["TESTBENCH_EXECUTION_ID"] = str(execution_id)
    env_vars["TESTBENCH_TARGET_DEVICE"] = str(target_udid)

    # 1. Manifest-driven execution path
    if manifest and manifest.get("entry_command"):
        language = str(manifest.get("language", "")).lower().strip()
        framework = str(manifest.get("framework", detected_framework)).lower().strip()
        entry_cmd_str = str(manifest["entry_command"]).strip()

        lang_env = setup_project_environment_sync(project_root, language)
        env_vars.update(lang_env)

        import shlex
        cmd_parts = shlex.split(entry_cmd_str, posix=(os.name != 'nt'))

        if test_file:
            if framework in ("pytest", "python") or "pytest" in cmd_parts[0]:
                for tf in test_file.split(","):
                    tf = tf.strip().replace("\\", "/")
                    if tf:
                        cmd_parts.append(tf)
            elif framework in ("playwright", "node", "javascript") or "playwright" in cmd_parts:
                for tf in test_file.split(","):
                    tf = tf.strip().replace("\\", "/")
                    if tf:
                        cmd_parts.append(tf)

        executable = cmd_parts[0] if cmd_parts else "python"
        return executable, cmd_parts, env_vars, framework

    # 2. Maven Java Appium path (default supported path)
    if detected_framework == "maven":
        mvn_bin = find_mvn_executable(str(project_root))
        args = [
            mvn_bin, "test",
            "-Dstyle.color=never",
            "-DfailIfNoTests=false",
            "-Dsurefire.useFile=false",
            "-B",
            "-Dappium.skipServerInstallation=true",
            "-Dappium.skipDeviceInitialization=true",
            "-Dappium.noReset=true",
            "-Dmaven.compiler.useIncrementalCompilation=true"
        ]
        if test_file:
            class_names = []
            for tf in test_file.split(","):
                tf = tf.strip()
                if tf:
                    if "#" in tf:
                        parts = tf.split("#", 1)
                        file_name = Path(parts[0]).name
                        class_name = file_name.replace(".java", "")
                        class_names.append(f"{class_name}#{parts[1]}")
                    else:
                        file_name = Path(tf).name
                        class_name = file_name.replace(".java", "")
                        class_names.append(class_name)
            if class_names:
                args.append(f"-Dtest={','.join(class_names)}")
                # Override static suiteXmlFiles in pom.xml so Surefire executes the targeted test
                args.append("-Dsurefire.suiteXmlFiles=")

        if target_udid:
            args.append(f"-DdeviceUdid={target_udid}")

        args.append(f"-DappiumServerUrl=http://127.0.0.1:{appium_port}")

        if system_port:
            args.append(f"-DsystemPort={system_port}")

        return mvn_bin, args, env_vars, "maven"

    # 3. Playwright / JS fallback path
    elif detected_framework == "playwright":
        npx_bin = shutil.which("npx") or shutil.which("npx.cmd") or "npx"
        args = [npx_bin, "playwright", "test"]
        if test_file:
            for tf in test_file.split(","):
                tf = tf.strip().replace("\\", "/")
                if tf:
                    args.append(tf)
        return npx_bin, args, env_vars, "playwright"

    # 4. Generic npm fallback
    else:
        npm_bin = shutil.which("npm") or shutil.which("npm.cmd") or "npm"
        args = [npm_bin, "test"]
        if test_file:
            clean_test_file = test_file.replace("\\", "/")
            args.extend(["--", clean_test_file])
        return npm_bin, args, env_vars, "javascript"


def sync_compiled_classes_to_test_classes(project_root: Path):
    """
    For Maven projects with custom sourceDirectory (tests placed in sourceDirectory),
    ensures compiled test classes in target/classes are mirrored to target/test-classes
    so Maven Surefire can discover and execute them.
    """
    try:
        classes_dir = project_root / "target" / "classes"
        test_classes_dir = project_root / "target" / "test-classes"
        if classes_dir.exists():
            test_classes_dir.mkdir(parents=True, exist_ok=True)
            for item in classes_dir.iterdir():
                dest = test_classes_dir / item.name
                if item.is_dir():
                    shutil.copytree(item, dest, dirs_exist_ok=True)
                elif item.is_file() and not dest.exists():
                    shutil.copy2(item, dest)
    except Exception as e:
        print(f"[RUNNER SYNC CLASSES WARNING] {e}")


def resolve_test_command(project_path: str, test_file: Optional[str] = None) -> str:
    _, args, _, _ = resolve_test_args(project_path, test_file)
    return " ".join(args)


async def broadcast_session_update(websocket: WebSocket, session: ExecutionSession):
    try:
        payload = {
            "type": "EXECUTION_SESSION_UPDATE",
            "event": "EXECUTION_UPDATE",
            "session": session.to_dict()
        }
        await websocket.send_text(json.dumps(payload))
    except Exception:
        pass


def run_test_background(
    project_path: str,
    project_name: str,
    test_file: Optional[str] = None,
    device_id: Optional[str] = None
):
    """
    Executes test in background with dedicated port, device reservation, Appium startup, and clean teardown.
    """
    global _active_sessions, _latest_session_id
    project_root, detected_framework = find_project_root(project_path)
    purge_stale_execution_artifacts(project_root)

    logs_dir = get_logs_dir()

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    log_filename = f"{project_name}_{timestamp}.log"
    log_file_path = logs_dir / log_filename

    execution_id = start_execution(project_name, log_filename)
    appium_port = allocate_appium_port()
    system_port = allocate_system_port()
    target_udid = resolve_and_prepare_device_sync(device_id, execution_id=execution_id)
    _device_reservations[target_udid] = execution_id

    session = ExecutionSession(
        execution_id=execution_id,
        project_id=project_name,
        selected_test=test_file or "All Tests",
        device_id=target_udid,
        current_module="Dashboard",
        current_screen="Services",
        status="RUNNING",
        progress=0,
        start_time=time.time(),
        appium_port=appium_port,
        last_action="Queued Background Execution"
    )
    _active_sessions[execution_id] = session
    _latest_session_id = execution_id

    executable, args, env_vars, framework = resolve_test_args(
        project_path,
        test_file=test_file,
        device_id=target_udid,
        appium_port=appium_port,
        system_port=system_port,
        execution_id=execution_id
    )
    cmd_str = " ".join(args)

    with open(log_file_path, "w", encoding="utf-8") as f:
        f.write("==================================================\n")
        f.write(f"[RUNNER] Execution ID: {execution_id}\n")
        f.write(f"[RUNNER] Target project: {project_name}\n")
        f.write(f"[RUNNER] Framework: {framework}\n")
        f.write(f"[RUNNER] Target device: {target_udid}\n")
        f.write(f"[RUNNER] Appium port: {appium_port}\n")
        f.write(f"[RUNNER] System port: {system_port}\n")
        f.write(f"[RUNNER] Executing command: {cmd_str}\n")
        f.write(f"[RUNNER] Working directory: {project_root}\n")
        f.write(f"[RUNNER] Output Log: {log_filename}\n")
        f.write("==================================================\n\n")
        f.flush()

        try:
            if framework in ("appium", "maven"):
                appium_ready = start_dedicated_appium_server_sync(execution_id, appium_port, log_file=f)
                if not appium_ready:
                    f.write("\n[RUNNER ERROR] Dedicated Appium Server failed to start.\n")
                    f.flush()
                    update_execution_status(execution_id, "Failed", exit_code=-1)
                    session.status = "FAILED"
                    return

                apk_success = ensure_apk_installed_sync(project_root, device_id=target_udid, log_file=f)
                if not apk_success:
                    f.write("\n[RUNNER WARNING] APK install warning recorded.\n")
                    f.flush()

            if framework == "maven":
                sync_compiled_classes_to_test_classes(project_root)

            creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0

            proc = subprocess.Popen(
                args,
                cwd=str(project_root),
                stdout=f,
                stderr=subprocess.STDOUT,
                text=True,
                env=env_vars,
                creationflags=creation_flags
            )

            exit_code = proc.wait()

            f.write("\n==================================================\n")
            f.write(f"[RUNNER FINISHED] Process exited with code {exit_code}\n")
            f.write("==================================================\n")
            f.flush()

            if exit_code == 0:
                update_execution_status(execution_id, "Completed", exit_code=0)
                session.status = "COMPLETED"
                session.progress = 100
            else:
                update_execution_status(execution_id, "Failed", exit_code=exit_code)
                session.status = "FAILED"

        except Exception as e:
            f.write(f"\n[RUNNER EXCEPTION] Execution error: {e}\n")
            f.flush()
            update_execution_status(execution_id, "Failed", exit_code=-1)
            session.status = "FAILED"
            session.error_message = str(e)

        finally:
            stop_dedicated_appium_server(execution_id, appium_port, system_port)
            device_manager.release_device_sync(target_udid, execution_id)
            _device_reservations.pop(target_udid, None)


def execute_job_sync(
    job,
    set_proc_callback=None,
    check_cancel_callback=None
) -> Tuple[int, Optional[str], Optional[str]]:
    """
    Executes an ExecutionJob synchronously for the ExecutionManager worker:
    - Prepares & reserves device via DeviceManager
    - Allocates dedicated Appium server and systemPort
    - Ensures APK is installed
    - Executes Maven/TestNG command redirecting output to job.log_file
    - Watches for Excel report generation
    - Cleans up Appium, releases device reservation in finally block
    - Returns (exit_code, report_file_path, error_message)
    """
    global _active_sessions, _latest_session_id
    workspace_dir = get_workspace_dir()
    project_path = str(workspace_dir / job.project)
    project_root, detected_framework = find_project_root(project_path)
    purge_stale_execution_artifacts(project_root)

    logs_dir = get_logs_dir()
    log_filename = job.log_file or f"{job.project}_{job.id}.log"
    log_file_path = logs_dir / log_filename

    execution_id = job.id
    appium_port = allocate_appium_port()
    system_port = allocate_system_port()

    # Reserve device via DeviceManager
    target_udid = resolve_and_prepare_device_sync(job.device_id, execution_id=execution_id)
    _device_reservations[target_udid] = execution_id

    session = ExecutionSession(
        execution_id=execution_id,
        project_id=job.project,
        selected_test=job.test or "All Tests",
        device_id=target_udid,
        current_module="Dashboard",
        current_screen="Services",
        status="RUNNING",
        progress=0,
        start_time=time.time(),
        appium_port=appium_port,
        last_action="Executing Job in Sequential Queue"
    )
    _active_sessions[execution_id] = session
    _latest_session_id = execution_id

    executable, args, env_vars, framework = resolve_test_args(
        project_path,
        test_file=job.test,
        device_id=target_udid,
        appium_port=appium_port,
        system_port=system_port,
        execution_id=execution_id
    )
    cmd_str = " ".join(args)

    report_path = None
    error_msg = None
    exit_code = -1

    with open(log_file_path, "w", encoding="utf-8") as f:
        f.write("==================================================\n")
        f.write(f"[RUNNER] Execution Job ID: {execution_id}\n")
        f.write(f"[RUNNER] Target project: {job.project}\n")
        f.write(f"[RUNNER] Framework: {framework}\n")
        f.write(f"[RUNNER] Target device: {target_udid}\n")
        f.write(f"[RUNNER] Appium port: {appium_port}\n")
        f.write(f"[RUNNER] System port: {system_port}\n")
        f.write(f"[RUNNER] Executing command: {cmd_str}\n")
        f.write(f"[RUNNER] Working directory: {project_root}\n")
        f.write(f"[RUNNER] Output Log: {log_filename}\n")
        f.write("==================================================\n\n")
        f.flush()

        try:
            if check_cancel_callback and check_cancel_callback():
                f.write("[RUNNER CANCELLED] Cancelled prior to process spawn.\n")
                f.flush()
                return -1, None, "Cancelled by user"

            if framework in ("appium", "maven"):
                appium_ready = start_dedicated_appium_server_sync(execution_id, appium_port, log_file=f)
                if not appium_ready:
                    f.write("\n[RUNNER ERROR] Dedicated Appium Server failed to start.\n")
                    f.flush()
                    return -1, None, "Appium server failed to start"

                apk_success = ensure_apk_installed_sync(project_root, device_id=target_udid, log_file=f)
                if not apk_success:
                    f.write("\n[RUNNER WARNING] APK install warning recorded.\n")
                    f.flush()

            if check_cancel_callback and check_cancel_callback():
                f.write("[RUNNER CANCELLED] Cancelled prior to process spawn.\n")
                f.flush()
                return -1, None, "Cancelled by user"

            creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0

            proc = subprocess.Popen(
                args,
                cwd=str(project_root),
                stdout=f,
                stderr=subprocess.STDOUT,
                text=True,
                env=env_vars,
                creationflags=creation_flags
            )

            if set_proc_callback:
                set_proc_callback(proc)

            exit_code = proc.wait()

            f.write("\n==================================================\n")
            f.write(f"[RUNNER FINISHED] Process exited with code {exit_code}\n")
            f.write("==================================================\n")
            f.flush()

            # Check for generated Excel report
            latest_excel = project_root / "logs" / "TestReport_Latest.xlsx"
            if latest_excel.exists():
                report_path = str(latest_excel)

        except Exception as e:
            f.write(f"\n[RUNNER EXCEPTION] Execution error: {e}\n")
            f.flush()
            error_msg = str(e)
            exit_code = -1

        finally:
            stop_dedicated_appium_server(execution_id, appium_port, system_port)
            device_manager.release_device_sync(target_udid, execution_id)
            _device_reservations.pop(target_udid, None)

    return exit_code, report_path, error_msg


async def run_test_process_websocket(
    project_path: str,
    websocket: WebSocket,
    test_file: Optional[str] = None,
    device_id: Optional[str] = None
) -> int:
    """
    Runs a test process over WebSocket with per-device reservation, dedicated Appium server,
    manifest support, and multi-session concurrency.
    """
    global _active_sessions, _latest_session_id

    start_pipeline_time = time.time()
    project_root, detected_framework = find_project_root(project_path)
    project_name = Path(project_path).name

    clean_test_name = "All Tests"
    if test_file:
        clean_test_name = Path(test_file).name.replace(".java", "").replace(".py", "").replace(".ts", "").replace(".js", "")

    execution_id = str(uuid.uuid4())
    appium_port = allocate_appium_port()
    system_port = allocate_system_port()

    # Reserve device (blocks only on the targeted device, other devices run concurrently)
    target_udid = await reserve_device_for_execution(device_id, execution_id, websocket=websocket)

    session = ExecutionSession(
        execution_id=execution_id,
        project_id=project_name,
        selected_test=clean_test_name,
        device_id=target_udid,
        current_module=clean_test_name.replace("Test", ""),
        current_screen="Dashboard",
        status="RUNNING",
        progress=0,
        start_time=start_pipeline_time,
        appium_port=appium_port,
        last_action="Initializing Execution Session"
    )
    _active_sessions[execution_id] = session
    _latest_session_id = execution_id

    await broadcast_session_update(websocket, session)
    purge_stale_execution_artifacts(project_root)

    # Start unified capture recording for this device & execution session
    rec_output_dir = get_logs_dir() / "recordings"
    rec_output_dir.mkdir(parents=True, exist_ok=True)
    rec_output_path = rec_output_dir / f"{execution_id}.mp4"
    try:
        await capture_pipeline_manager.start_recording(target_udid, execution_id, rec_output_path)
    except Exception as rec_err:
        print(f"[RUNNER WEBSOCKET RECORDING START WARNING] {rec_err}")

    executable, args, env_vars, framework = resolve_test_args(
        project_path,
        test_file=test_file,
        device_id=target_udid,
        appium_port=appium_port,
        system_port=system_port,
        execution_id=execution_id
    )
    cmd_str = " ".join(args)

    await websocket.send_text(f"[RUNNER SESSION] Execution ID: {session.execution_id}")
    await websocket.send_text(f"[RUNNER] Target device: {target_udid} (Reserved)")
    await websocket.send_text(f"[RUNNER] Framework: {framework}")
    await websocket.send_text(f"[RUNNER] Appium port: {appium_port}")
    await websocket.send_text(f"[RUNNER] System port: {system_port}")
    await websocket.send_text(f"[RUNNER] Selected test: {clean_test_name}")
    await websocket.send_text(f"[RUNNER] Executing command: {cmd_str}")
    await websocket.send_text("--------------------------------------------------")

    adb_bin = find_adb_executable()
    if target_udid and adb_bin:
        try:
            creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            proc_wake = await asyncio.create_subprocess_exec(
                adb_bin, "-s", target_udid, "shell", "input keyevent 224 && input keyevent 82 && wm dismiss-keyguard",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                creationflags=creation_flags
            )
            await proc_wake.wait()
        except Exception:
            pass

    # Only launch Appium & install APKs when framework requires Appium
    if framework in ("appium", "maven"):
        appium_ready = await start_dedicated_appium_server(execution_id, appium_port, websocket)
        if not appium_ready:
            await websocket.send_text("[APPIUM WARNING] Appium server could not be started; proceeding with test execution...")

        apk_success = await ensure_apk_installed(project_root, device_id=target_udid, websocket=websocket)
        if not apk_success:
            session.status = "FAILED"
            session.error_message = "APK installation failed"
            await broadcast_session_update(websocket, session)
            await websocket.send_text("[RUNNER FINISHED] Aborted due to APK installation failure.")
            await release_device_reservation(target_udid, execution_id)
            stop_dedicated_appium_server(execution_id, appium_port, system_port)
            return -1

    loop = asyncio.get_running_loop()

    async def on_report_generated(payload: dict):
        try:
            await websocket.send_text(json.dumps(payload))
        except Exception:
            pass

    watcher = ExcelReportWatcher(str(project_root), project_name, loop, on_report_generated)
    watcher.start()
    if framework == "maven":
        sync_compiled_classes_to_test_classes(project_root)

    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    process = None
    keep_alive_running = True

    async def keep_alive_worker():
        while keep_alive_running:
            await asyncio.sleep(10)
            if keep_alive_running:
                try:
                    await websocket.send_text("[KEEPALIVE] Session active.")
                except Exception:
                    break

    keep_alive_task = asyncio.create_task(keep_alive_worker())

    try:
        process = await asyncio.to_thread(
            subprocess.Popen,
            args,
            cwd=str(project_root),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            env=env_vars,
            creationflags=creation_flags
        )
    except Exception as e:
        keep_alive_running = False
        keep_alive_task.cancel()
        watcher.stop()
        session.status = "FAILED"
        session.error_message = str(e)
        await broadcast_session_update(websocket, session)
        await websocket.send_text(f"[RUNNER ERROR] Failed to spawn process: {e}")
        await release_device_reservation(target_udid, execution_id)
        stop_dedicated_appium_server(execution_id, appium_port, system_port)
        return -1

    try:
        step_count = 0
        total_estimated_steps = 8

        async def read_stream_thread(stream, is_stderr=False):
            nonlocal step_count
            while True:
                line = await asyncio.to_thread(stream.readline)
                if not line:
                    break
                text = line.rstrip()
                if text:
                    prefix = "[STDERR] " if is_stderr else ""
                    try:
                        await websocket.send_text(f"{prefix}{text}")
                    except Exception:
                        break

                    if "[STEP LOG]" in text or "Module:" in text:
                        step_count += 1
                        prog = min(95, int((step_count / total_estimated_steps) * 100))
                        session.progress = prog
                        session.last_action = text
                        if "Screen:" in text:
                            try:
                                scr_match = re.search(r"Screen:\s*([^|]+)", text)
                                if scr_match:
                                    session.current_screen = scr_match.group(1).strip()
                            except Exception:
                                pass
                        await broadcast_session_update(websocket, session)

        await asyncio.gather(
            read_stream_thread(process.stdout, is_stderr=False),
            read_stream_thread(process.stderr, is_stderr=True)
        )

        exit_code = await asyncio.to_thread(process.wait)
        total_duration = time.time() - start_pipeline_time

        if exit_code == 0:
            session.status = "COMPLETED"
            session.progress = 100
        else:
            session.status = "FAILED"
            session.error_message = f"Process exited with code {exit_code}"

        await broadcast_session_update(websocket, session)

        status_msg = f"[RUNNER FINISHED] Execution ID: {session.execution_id} | Status: {session.status} | Exit Code: {exit_code} ({total_duration:.2f}s)"
        try:
            await websocket.send_text("--------------------------------------------------")
            await websocket.send_text(status_msg)
        except Exception:
            pass

        return exit_code

    except Exception as e:
        session.status = "FAILED"
        session.error_message = str(e)
        await broadcast_session_update(websocket, session)
        return -1

    finally:
        keep_alive_running = False
        keep_alive_task.cancel()
        watcher.stop()

        if process and process.poll() is None:
            try:
                process.terminate()
                await asyncio.sleep(0.5)
                if process.poll() is None:
                    process.kill()
            except Exception:
                pass

        try:
            saved_rec = await capture_pipeline_manager.stop_recording(target_udid, execution_id)
            if saved_rec:
                await websocket.send_text(f"[RECORDING SAVED] Video saved to {Path(saved_rec).name}")
        except Exception as stop_rec_err:
            print(f"[RUNNER WEBSOCKET RECORDING STOP WARNING] {stop_rec_err}")

        stop_dedicated_appium_server(execution_id, appium_port, system_port)
        await release_device_reservation(target_udid, execution_id)
