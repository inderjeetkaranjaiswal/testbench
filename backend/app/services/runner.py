import asyncio
import os
import json
import shutil
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
from app.services.scanner import inspect_project, find_project_root
from app.services.watcher import ExcelReportWatcher
from app.services.adb_bridge import find_adb_executable, get_online_adb_device_async
from app.services.db import start_execution, update_execution_status

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
    last_action: str = ""
    error_message: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


_active_session: Optional[ExecutionSession] = None
_execution_lock = asyncio.Lock()


def get_active_session() -> Optional[Dict[str, Any]]:
    global _active_session
    if _active_session:
        return _active_session.to_dict()
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
        "last_action": "",
        "error_message": ""
    }


def find_mvn_executable(project_path: str) -> str:
    mvn_in_path = shutil.which("mvn") or shutil.which("mvn.cmd")
    if mvn_in_path:
        return mvn_in_path

    project_root, _ = find_project_root(project_path)

    mvn_bin_name = "mvn.cmd" if os.name == "nt" else "mvn"
    embedded_mvn = project_root / "apache-maven-3.9.16" / "bin" / mvn_bin_name
    if embedded_mvn.exists():
        return str(embedded_mvn)

    for p in project_root.glob(f"**/{mvn_bin_name}"):
        if p.exists():
            return str(p)

    return "mvn"


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


async def ensure_apk_installed(project_root: Path, websocket: Optional[WebSocket] = None) -> bool:
    global _installed_apks_cache
    apk_files = [p for p in project_root.rglob("*.apk") if "target" not in p.parts]
    if not apk_files:
        return True

    adb_bin = find_adb_executable() or "adb"

    for apk_path in apk_files:
        apk_key = str(apk_path.resolve())
        if apk_key in _installed_apks_cache:
            if websocket:
                await websocket.send_text(f"[ADB] Found APK: {apk_path.name} (Verified installed)")
            continue

        device_id = await get_online_adb_device_async(adb_bin)
        pkg_name = extract_apk_package_name(apk_path)
        if pkg_name:
            installed = await asyncio.to_thread(is_package_installed_on_device, adb_bin, device_id, pkg_name)
            if installed:
                _installed_apks_cache.add(apk_key)
                if websocket:
                    await websocket.send_text(f"[ADB SUCCESS] Package '{pkg_name}' ALREADY installed.")
                continue

        cmd = [adb_bin]
        if device_id:
            cmd.extend(["-s", device_id])
        cmd.extend(["install", "-r", "-t", str(apk_path)])

        if websocket:
            await websocket.send_text(f"[ADB] Installing APK: {apk_path.name}")

        try:
            creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            proc = await asyncio.to_thread(
                subprocess.Popen, cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=creation_flags
            )
            stdout, stderr = await asyncio.to_thread(proc.communicate)
            if proc.returncode == 0 or "Success" in (stdout + stderr):
                _installed_apks_cache.add(apk_key)
                if websocket:
                    await websocket.send_text(f"[ADB SUCCESS] Successfully installed {apk_path.name}")
            else:
                return False
        except Exception:
            return False

    return True


def ensure_apk_installed_sync(project_root: Path, log_file=None) -> bool:
    global _installed_apks_cache
    apk_files = [p for p in project_root.rglob("*.apk") if "target" not in p.parts]
    if not apk_files:
        return True

    adb_bin = find_adb_executable() or "adb"

    for apk_path in apk_files:
        apk_key = str(apk_path.resolve())
        if apk_key in _installed_apks_cache:
            if log_file:
                log_file.write(f"[ADB] Found APK: {apk_path.name} (Verified installed)\n")
                log_file.flush()
            continue

        device_id = clean_offline_and_get_online_adb_device(adb_bin)
        pkg_name = extract_apk_package_name(apk_path)
        if pkg_name:
            installed = is_package_installed_on_device(adb_bin, device_id, pkg_name)
            if installed:
                _installed_apks_cache.add(apk_key)
                if log_file:
                    log_file.write(f"[ADB SUCCESS] Package '{pkg_name}' ALREADY installed.\n")
                    log_file.flush()
                continue

        cmd = [adb_bin]
        if device_id:
            cmd.extend(["-s", device_id])
        cmd.extend(["install", "-r", "-t", str(apk_path)])

        if log_file:
            log_file.write(f"[ADB] Installing APK: {apk_path.name}\n")
            log_file.flush()

        try:
            creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=60, creationflags=creation_flags)
            if res.returncode == 0 or "Success" in (res.stdout + res.stderr):
                _installed_apks_cache.add(apk_key)
                if log_file:
                    log_file.write(f"[ADB SUCCESS] Successfully installed {apk_path.name}\n")
                    log_file.flush()
            else:
                if log_file:
                    log_file.write(f"[ADB ERROR] APK installation failed: {res.stderr}\n")
                    log_file.flush()
                return False
        except Exception as e:
            if log_file:
                log_file.write(f"[ADB ERROR] APK installation exception: {e}\n")
                log_file.flush()
            return False

    return True


def ensure_appium_server_sync(log_file=None) -> bool:
    import urllib.request
    for _ in range(2):
        try:
            req = urllib.request.Request("http://127.0.0.1:4723/status")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    if log_file:
                        log_file.write("[APPIUM] Appium Server active on 127.0.0.1:4723\n")
                        log_file.flush()
                    return True
        except Exception:
            pass

    if log_file:
        log_file.write("[APPIUM] Appium Server not active on 127.0.0.1:4723. Auto-launching Appium Server...\n")
        log_file.flush()

    npx_bin = shutil.which("npx") or shutil.which("npx.cmd") or "npx"
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0

    try:
        subprocess.Popen(
            [npx_bin, "appium", "--port", "4723", "--relaxed-security"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creation_flags
        )
        for _ in range(16):
            time.sleep(0.5)
            try:
                req = urllib.request.Request("http://127.0.0.1:4723/status")
                with urllib.request.urlopen(req, timeout=1.5) as resp:
                    if resp.status == 200:
                        if log_file:
                            log_file.write("[APPIUM] Appium Server started successfully on port 4723!\n")
                            log_file.flush()
                        return True
            except Exception:
                pass
    except Exception as e:
        if log_file:
            log_file.write(f"[APPIUM WARNING] Could not auto-launch Appium server: {e}\n")
            log_file.flush()

    return False


async def ensure_appium_server_running(websocket: Optional[WebSocket] = None) -> bool:
    import urllib.request
    for _ in range(2):
        try:
            req = urllib.request.Request("http://127.0.0.1:4723/status")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass

    if websocket:
        await websocket.send_text("[APPIUM] Auto-launching Appium Server on port 4723...")

    npx_bin = shutil.which("npx") or shutil.which("npx.cmd") or "npx"
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0

    try:
        subprocess.Popen(
            [npx_bin, "appium", "--port", "4723", "--relaxed-security"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creation_flags
        )
        for _ in range(16):
            await asyncio.sleep(0.5)
            try:
                req = urllib.request.Request("http://127.0.0.1:4723/status")
                with urllib.request.urlopen(req, timeout=1.5) as resp:
                    if resp.status == 200:
                        return True
            except Exception:
                pass
    except Exception:
        pass

    return False


def resolve_test_args(project_path: str, test_file: Optional[str] = None, device_id: Optional[str] = None) -> Tuple[str, List[str]]:
    project_root, framework = find_project_root(project_path)

    if framework == "maven":
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
                    file_name = Path(tf).name
                    class_name = file_name.replace(".java", "")
                    class_names.append(class_name)
            if class_names:
                args.append(f"-Dtest={','.join(class_names)}")

        target_udid = device_id
        if not target_udid:
            adb_bin = find_adb_executable()
            if adb_bin:
                target_udid = clean_offline_and_get_online_adb_device(adb_bin)

        if target_udid:
            args.append(f"-DdeviceUdid={target_udid}")

        return mvn_bin, args

    else:
        npm_bin = shutil.which("npm") or shutil.which("npm.cmd") or "npm"
        args = [npm_bin, "test"]
        if test_file:
            clean_test_file = test_file.replace("\\", "/")
            args.extend(["--", clean_test_file])
        return npm_bin, args


def resolve_test_command(project_path: str, test_file: Optional[str] = None) -> str:
    _, args = resolve_test_args(project_path, test_file)
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


def run_test_background(project_path: str, project_name: str, test_file: Optional[str] = None):
    project_root, framework = find_project_root(project_path)
    purge_stale_execution_artifacts(project_root)

    workspace_dir = project_root.parent
    if workspace_dir.name != "workspace":
        workspace_dir = Path(project_path).resolve()
        while workspace_dir.name != "workspace" and workspace_dir.parent != workspace_dir:
            workspace_dir = workspace_dir.parent

    logs_dir = workspace_dir / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    log_filename = f"{project_name}_{timestamp}.log"
    log_file_path = logs_dir / log_filename

    execution_id = start_execution(project_name, log_filename)

    executable, args = resolve_test_args(project_path, test_file)
    cmd_str = " ".join(args)

    with open(log_file_path, "w", encoding="utf-8") as f:
        f.write(f"==================================================\n")
        f.write(f"[RUNNER] Target project: {project_name}\n")
        f.write(f"[RUNNER] Executing command: {cmd_str}\n")
        f.write(f"[RUNNER] Working directory: {project_root}\n")
        f.write(f"[RUNNER] Output Log: {log_filename}\n")
        f.write(f"==================================================\n\n")
        f.flush()

        try:
            if framework == "maven":
                ensure_appium_server_sync(f)
                apk_success = ensure_apk_installed_sync(project_root, f)
                if not apk_success:
                    f.write("\n[RUNNER ERROR] Aborting execution due to APK installation failure.\n")
                    f.flush()
                    update_execution_status(execution_id, "Failed", exit_code=-1)
                    return

            creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0

            proc = subprocess.Popen(
                args,
                cwd=str(project_root),
                stdout=f,
                stderr=subprocess.STDOUT,
                text=True,
                creationflags=creation_flags
            )

            exit_code = proc.wait()

            f.write(f"\n==================================================\n")
            f.write(f"[RUNNER FINISHED] Process exited with code {exit_code}\n")
            f.write(f"==================================================\n")
            f.flush()

            if exit_code == 0:
                update_execution_status(execution_id, "Completed", exit_code=0)
            else:
                update_execution_status(execution_id, "Failed", exit_code=exit_code)

        except Exception as e:
            f.write(f"\n[RUNNER EXCEPTION] Execution error: {e}\n")
            f.flush()
            update_execution_status(execution_id, "Failed", exit_code=-1)


async def run_test_process_websocket(
    project_path: str,
    websocket: WebSocket,
    test_file: Optional[str] = None,
    device_id: Optional[str] = None
) -> int:
    global _active_session
    async with _execution_lock:
        start_pipeline_time = time.time()
        project_root, framework = find_project_root(project_path)
        project_name = Path(project_path).name

        clean_test_name = "All Tests"
        if test_file:
            clean_test_name = Path(test_file).name.replace(".java", "")

        target_udid = device_id or "emulator-5554"

        _active_session = ExecutionSession(
            execution_id=str(uuid.uuid4()),
            project_id=project_name,
            selected_test=clean_test_name,
            device_id=target_udid,
            current_module=clean_test_name.replace("Test", ""),
            current_screen="Dashboard",
            status="RUNNING",
            progress=0,
            start_time=start_pipeline_time,
            last_action="Initializing Execution Session"
        )
        await broadcast_session_update(websocket, _active_session)

        purge_stale_execution_artifacts(project_root)

        executable, args = resolve_test_args(project_path, test_file=test_file, device_id=device_id)
        cmd_str = " ".join(args)

        await websocket.send_text(f"[RUNNER SESSION] Execution ID: {_active_session.execution_id}")
        await websocket.send_text(f"[RUNNER] Selected test: {clean_test_name}")
        await websocket.send_text(f"[RUNNER] Executing command: {cmd_str}")
        await websocket.send_text("--------------------------------------------------")

        if framework == "maven":
            adb_bin = find_adb_executable()
            if not device_id and adb_bin:
                active_dev = clean_offline_and_get_online_adb_device(adb_bin)
                if active_dev:
                    target_udid = active_dev
                    _active_session.device_id = target_udid

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

            await ensure_appium_server_running(websocket)
            apk_success = await ensure_apk_installed(project_root, websocket)

            if not apk_success:
                _active_session.status = "FAILED"
                _active_session.error_message = "APK installation failed"
                await broadcast_session_update(websocket, _active_session)
                await websocket.send_text("[RUNNER FINISHED] Aborted due to APK installation failure.")
                return -1

        loop = asyncio.get_running_loop()

        async def on_report_generated(payload: dict):
            try:
                await websocket.send_text(json.dumps(payload))
            except Exception:
                pass

        watcher = ExcelReportWatcher(str(project_root), project_name, loop, on_report_generated)
        watcher.start()

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
                creationflags=creation_flags
            )
        except Exception as e:
            keep_alive_running = False
            keep_alive_task.cancel()
            watcher.stop()
            _active_session.status = "FAILED"
            _active_session.error_message = str(e)
            await broadcast_session_update(websocket, _active_session)
            await websocket.send_text(f"[RUNNER ERROR] Failed to spawn process: {e}")
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
                            _active_session.progress = prog
                            _active_session.last_action = text
                            if "Screen:" in text:
                                try:
                                    scr_match = re.search(r"Screen:\s*([^|]+)", text)
                                    if scr_match:
                                        _active_session.current_screen = scr_match.group(1).strip()
                                except Exception:
                                    pass
                            await broadcast_session_update(websocket, _active_session)

            await asyncio.gather(
                read_stream_thread(process.stdout, is_stderr=False),
                read_stream_thread(process.stderr, is_stderr=True)
            )

            exit_code = await asyncio.to_thread(process.wait)
            total_duration = time.time() - start_pipeline_time

            if exit_code == 0:
                _active_session.status = "COMPLETED"
                _active_session.progress = 100
            else:
                _active_session.status = "FAILED"
                _active_session.error_message = f"Process exited with code {exit_code}"

            await broadcast_session_update(websocket, _active_session)

            status_msg = f"[RUNNER FINISHED] Execution ID: {_active_session.execution_id} | Status: {_active_session.status} | Exit Code: {exit_code} ({total_duration:.2f}s)"
            try:
                await websocket.send_text("--------------------------------------------------")
                await websocket.send_text(status_msg)
            except Exception:
                pass

            return exit_code

        except Exception as e:
            _active_session.status = "FAILED"
            _active_session.error_message = str(e)
            await broadcast_session_update(websocket, _active_session)
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
