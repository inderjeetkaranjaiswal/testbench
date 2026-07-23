import asyncio
import os
import json
import shutil
import subprocess
import time
import zipfile
import re
from pathlib import Path
from typing import Optional, List, Tuple
from fastapi import WebSocket, WebSocketDisconnect
from app.services.scanner import inspect_project, find_project_root
from app.services.watcher import ExcelReportWatcher
from app.services.adb_bridge import find_adb_executable, get_online_adb_device_async

_installed_apks_cache = set()


def find_mvn_executable(project_path: str) -> str:
    """
    Finds system mvn or project-embedded apache-maven bin executable.
    Returns plain unquoted path string for cross-platform subprocess execution.
    """
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


# Global execution lock to enforce sequential test execution without race conditions or deadlocks
_execution_lock = asyncio.Lock()


def clean_offline_and_get_online_adb_device(adb_bin: str) -> Optional[str]:
    """
    Returns active online ADB device serial using cached adb_bridge discovery.
    """
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


def extract_apk_package_name(apk_path: Path) -> Optional[str]:
    """
    Extracts the Android package name from an .apk file's AndroidManifest.xml string pool.
    """
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
    """
    Checks if package_name is already installed on the connected Android device via `pm list packages`.
    """
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
    """
    Scans the extracted project directory for any .apk file.
    If found, checks if app is already installed/verified in this session.
    If already verified, skips re-installation instantly.
    Returns True if no APK was found or if installation succeeded.
    """
    global _installed_apks_cache
    apk_files = [p for p in project_root.rglob("*.apk") if "target" not in p.parts]
    if not apk_files:
        return True

    adb_bin = find_adb_executable()
    if not adb_bin:
        adb_bin = "adb"

    for apk_path in apk_files:
        apk_key = str(apk_path.resolve())
        if apk_key in _installed_apks_cache:
            if websocket:
                await websocket.send_text(f"[ADB] Found APK in project: {apk_path.name}")
                await websocket.send_text(f"[ADB SUCCESS] Package is ALREADY installed/verified for this session.")
                await websocket.send_text(f"[ADB] Skipping APK re-installation and proceeding directly to test execution.")
            continue

        device_id = await get_online_adb_device_async(adb_bin)
        pkg_name = extract_apk_package_name(apk_path)
        if pkg_name:
            installed = await asyncio.to_thread(is_package_installed_on_device, adb_bin, device_id, pkg_name)
            if installed:
                _installed_apks_cache.add(apk_key)
                if websocket:
                    await websocket.send_text(f"[ADB] Found APK in project: {apk_path.name}")
                    await websocket.send_text(f"[ADB SUCCESS] Package '{pkg_name}' is ALREADY installed on target device.")
                    await websocket.send_text(f"[ADB] Skipping APK re-installation and proceeding directly to test execution.")
                continue

        cmd = [adb_bin]
        if device_id:
            cmd.extend(["-s", device_id])
        cmd.extend(["install", "-r", "-t", str(apk_path)])

        cmd_display = f"adb {'-s ' + device_id + ' ' if device_id else ''}install -r -t \"{apk_path}\""

        if websocket:
            await websocket.send_text(f"[ADB] Found APK in project: {apk_path.name}")
            if device_id:
                await websocket.send_text(f"[ADB] Target device selected: {device_id}")
            await websocket.send_text(f"[ADB] Executing command: {cmd_display}")

        try:
            creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            proc = await asyncio.to_thread(
                subprocess.Popen,
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                creationflags=creation_flags
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    asyncio.gather(
                        asyncio.to_thread(proc.stdout.read),
                        asyncio.to_thread(proc.stderr.read)
                    ),
                    timeout=25.0
                )
            except asyncio.TimeoutError:
                proc.kill()
                if websocket:
                    await websocket.send_text(f"[ADB WARNING] adb install timed out after 25s. Proceeding with test execution.")
                _installed_apks_cache.add(apk_key)
                continue

            exit_code = await asyncio.to_thread(proc.wait)
            combined_out = (stdout or "") + (stderr or "")

            if stdout and stdout.strip():
                if websocket:
                    for line in stdout.strip().splitlines():
                        await websocket.send_text(f"[ADB STDOUT] {line}")

            if exit_code == 0 or "Success" in combined_out:
                _installed_apks_cache.add(apk_key)
                if websocket:
                    await websocket.send_text(f"[ADB SUCCESS] Successfully installed {apk_path.name} onto target device.")
            else:
                if websocket:
                    await websocket.send_text(f"[ADB ERROR] Failed to install {apk_path.name} (exit code {exit_code}). Aborting test run.")
                return False

        except Exception as e:
            if websocket:
                await websocket.send_text(f"[ADB ERROR] Failed to execute adb install for {apk_path.name}: {e}")
            return False

    return True


def resolve_test_args(project_path: str, test_file: Optional[str] = None) -> Tuple[str, List[str]]:
    """
    Resolves the executable binary path and arguments list for clean cross-platform subprocess spawning.
    Includes flags for unbuffered real-time stdout streaming and Appium session reuse.
    Returns (executable, args_list).
    """
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

        adb_bin = find_adb_executable()
        if adb_bin:
            active_device = clean_offline_and_get_online_adb_device(adb_bin)
            if active_device:
                args.append(f"-DdeviceUdid={active_device}")

        return mvn_bin, args

    elif framework == "playwright":
        npx_bin = shutil.which("npx") or shutil.which("npx.cmd") or "npx"
        args = [npx_bin, "playwright", "test"]
        if test_file:
            clean_test_file = test_file.replace("\\", "/")
            args.append(clean_test_file)
        return npx_bin, args

    elif framework == "javascript":
        npm_bin = shutil.which("npm") or shutil.which("npm.cmd") or "npm"
        args = [npm_bin, "test"]
        if test_file:
            clean_test_file = test_file.replace("\\", "/")
            args.extend(["--", clean_test_file])
        return npm_bin, args

    else:
        if test_file and test_file.endswith(".py"):
            pytest_bin = shutil.which("pytest") or shutil.which("pytest.exe") or "pytest"
            return pytest_bin, [pytest_bin, test_file]
        npm_bin = shutil.which("npm") or shutil.which("npm.cmd") or "npm"
        args = [npm_bin, "test"]
        if test_file:
            clean_test_file = test_file.replace("\\", "/")
            args.extend(["--", clean_test_file])
        return npm_bin, args


def resolve_test_command(project_path: str, test_file: Optional[str] = None) -> str:
    """
    Legacy helper returning formatted string representation of resolved test command.
    """
    _, args = resolve_test_args(project_path, test_file)
    return " ".join(args)


async def ensure_appium_server_running(websocket: Optional[WebSocket] = None) -> bool:
    """
    Checks if Appium server is active on http://127.0.0.1:4723/status.
    If not running, automatically spawns an Appium server background process with retry logic.
    """
    import urllib.request
    for attempt in range(2):
        try:
            req = urllib.request.Request("http://127.0.0.1:4723/status")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass

    if websocket:
        await websocket.send_text("[APPIUM] Appium Server not active on 127.0.0.1:4723. Auto-launching Appium Server...")

    npx_bin = shutil.which("npx") or shutil.which("npx.cmd") or "npx"
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0

    try:
        subprocess.Popen(
            [npx_bin, "appium", "--port", "4723", "--relaxed-security"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creation_flags
        )
        # Wait up to 8 seconds for Appium server to start listening
        for _ in range(16):
            await asyncio.sleep(0.5)
            try:
                req = urllib.request.Request("http://127.0.0.1:4723/status")
                with urllib.request.urlopen(req, timeout=1.5) as resp:
                    if resp.status == 200:
                        if websocket:
                            await websocket.send_text("[APPIUM] Appium Server started successfully on port 4723!")
                        return True
            except Exception:
                pass
    except Exception as e:
        if websocket:
            await websocket.send_text(f"[APPIUM WARNING] Could not auto-launch Appium server: {e}")

    return False


async def run_test_process_websocket(
    project_path: str,
    websocket: WebSocket,
    test_file: Optional[str] = None
) -> int:
    """
    Spawns the test process sequentially via execution lock, starts Excel report watchdog,
    streams stdout/stderr in real-time, sends WebSocket keep-alive heartbeats,
    and guarantees process & watchdog cleanup on completion or disconnect.
    """
    async with _execution_lock:
        start_pipeline_time = time.time()
        
        t0 = time.time()
        project_root, framework = find_project_root(project_path)
        t_detect = time.time() - t0

        executable, args = resolve_test_args(project_path, test_file)
        project_name = Path(project_path).name
        cmd_str = " ".join(args)

        await websocket.send_text(f"[RUNNER] Target project: {project_name}")
        await websocket.send_text(f"[RUNNER] Executing command: {cmd_str}")
        await websocket.send_text(f"[RUNNER] Working directory: {project_root}")
        await websocket.send_text(f"[PROFILE] 1. Project Detection & Command Resolution: {t_detect:.3f}s")
        await websocket.send_text("--------------------------------------------------")

        # Automatically launch Appium server & install APK if executing Maven/Appium mobile automation
        if framework == "maven":
            t_appium_start = time.time()
            await ensure_appium_server_running(websocket)
            t_appium = time.time() - t_appium_start
            await websocket.send_text(f"[PROFILE] 2. Appium Server Status Check: {t_appium:.3f}s")

            t_apk_start = time.time()
            apk_success = await ensure_apk_installed(project_root, websocket)
            t_apk = time.time() - t_apk_start
            await websocket.send_text(f"[PROFILE] 3. APK Installation Check & Verification: {t_apk:.3f}s")

            if not apk_success:
                await websocket.send_text("--------------------------------------------------")
                await websocket.send_text("[RUNNER FINISHED] Execution aborted due to APK installation failure.")
                return -1

        loop = asyncio.get_running_loop()

        async def on_report_generated(payload: dict):
            try:
                await websocket.send_text(json.dumps(payload))
                await websocket.send_text(
                    f"[WATCHDOG] Excel Report Generated: {payload['file_name']} -> {payload['download_url']}"
                )
            except Exception:
                pass

        watcher = ExcelReportWatcher(str(project_root), project_name, loop, on_report_generated)
        watcher.start()

        creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        process = None

        # Keep-alive heartbeat background worker to prevent WebSocket timeouts during long runs
        keep_alive_running = True

        async def keep_alive_worker():
            while keep_alive_running:
                await asyncio.sleep(10)
                if keep_alive_running:
                    try:
                        await websocket.send_text("[KEEPALIVE] Pipeline active.")
                    except Exception:
                        break

        keep_alive_task = asyncio.create_task(keep_alive_worker())

        t_spawn_start = time.time()
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
            t_spawn = time.time() - t_spawn_start
            await websocket.send_text(f"[PROFILE] 4. Subprocess Spawn: {t_spawn:.3f}s")
        except Exception as e:
            keep_alive_running = False
            keep_alive_task.cancel()
            watcher.stop()
            error_msg = f"[RUNNER ERROR] Failed to spawn process: {type(e).__name__} - {str(e)}"
            await websocket.send_text(error_msg)
            return -1

        try:
            async def read_stream_thread(stream, is_stderr=False):
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

            await asyncio.gather(
                read_stream_thread(process.stdout, is_stderr=False),
                read_stream_thread(process.stderr, is_stderr=True)
            )

            exit_code = await asyncio.to_thread(process.wait)
            total_duration = time.time() - start_pipeline_time
            status_msg = f"[RUNNER FINISHED] Process exited with code {exit_code}"
            try:
                await websocket.send_text("--------------------------------------------------")
                await websocket.send_text(f"[PROFILE] TOTAL PIPELINE EXECUTION DURATION: {total_duration:.2f}s")
                await websocket.send_text(status_msg)
            except Exception:
                pass

            return exit_code

        except Exception as e:
            try:
                await websocket.send_text(f"[RUNNER EXCEPTION] Execution interrupted: {e}")
            except Exception:
                pass
            return -1

        finally:
            keep_alive_running = False
            keep_alive_task.cancel()
            watcher.stop()

            # Ensure process termination on disconnect or abort
            if process and process.poll() is None:
                try:
                    process.terminate()
                    await asyncio.sleep(0.5)
                    if process.poll() is None:
                        process.kill()
                except Exception as clean_err:
                    print(f"[RUNNER CLEANUP WARNING] Process cleanup: {clean_err}")


