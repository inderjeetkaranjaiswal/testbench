import os
import sys
import shutil
import asyncio
# Force reload uvicorn server for updated adb_bridge discovery
import zipfile
import datetime
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.services.scanner import inspect_project
from app.services.analytics import parse_surefire_reports
from app.services.adb_bridge import (
    stream_emulator_frames,
    generate_mjpeg_stream_async,
    find_adb_executable,
    execute_device_control_async,
    get_advanced_device_info_async,
    list_all_devices_and_emulators_async,
    start_emulator_async,
    stop_emulator_async,
    execute_emulator_control_async
)
from app.services.runner import (
    run_test_background,
    run_test_process_websocket,
    resolve_test_command,
    get_active_session,
    get_all_active_sessions,
    get_device_reservations
)
from app.services.device_manager import device_manager
from app.services.execution_manager import execution_manager, ExecutionJob
from app.services.db import init_db, get_latest_execution_status
from app.config import (
    get_workspace_dir,
    get_logs_dir,
    get_diagnostics,
    log_startup_diagnostics
)

if sys.platform == 'win32':
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

init_db()

WORKSPACE_DIR = get_workspace_dir()
LOGS_DIR = get_logs_dir()

app = FastAPI(
    title="TestBench Backend API",
    description="FastAPI backend for TestBench project management, execution, and real-time monitoring",
    version="1.0.0",
)

@app.on_event("startup")
async def startup_event():
    log_startup_diagnostics()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SystemStatus(BaseModel):
    status: str
    backend: str
    workspace_path: str
    active_projects: int


@app.get("/api/health", response_model=SystemStatus)
async def health_check():
    ws_dir = get_workspace_dir()
    project_count = 0
    if ws_dir.exists():
        project_count = len([p for p in ws_dir.iterdir() if p.is_dir() and p.name != ".gitkeep"])

    return SystemStatus(
        status="online",
        backend="FastAPI + Uvicorn (v2)",
        workspace_path=str(ws_dir),
        active_projects=project_count,
    )


@app.get("/api/system/diagnostics")
async def system_diagnostics_endpoint():
    """Returns detailed environment diagnostics and tool discovery status."""
    return get_diagnostics()


@app.get("/api/execution/sessions")
async def get_execution_sessions_endpoint():
    """Returns list of all active/recent execution sessions and device reservations."""
    return {
        "sessions": get_all_active_sessions(),
        "reservations": get_device_reservations()
    }


@app.get("/api/execution/session")
async def get_execution_session_endpoint(execution_id: Optional[str] = None, device_id: Optional[str] = None):
    """Returns the Single Source of Truth execution session state for execution_id, device_id, or latest."""
    return get_active_session(execution_id=execution_id, device_id=device_id)


@app.get("/api/workspace/files")
async def list_workspace_files():
    if not WORKSPACE_DIR.exists():
        return {"items": []}

    items = []
    for entry in WORKSPACE_DIR.iterdir():
        if entry.name == ".gitkeep":
            continue
        items.append({
            "name": entry.name,
            "is_directory": entry.is_dir(),
            "path": str(entry.relative_to(WORKSPACE_DIR)),
            "size_bytes": entry.stat().st_size if entry.is_file() else 0,
        })
    return {"items": items}


@app.post("/api/workspace/upload")
async def upload_file(file: UploadFile = File(...)):
    destination = WORKSPACE_DIR / file.filename
    try:
        with destination.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        return {
            "message": f"Successfully uploaded '{file.filename}' to workspace",
            "filename": file.filename,
            "path": str(destination.relative_to(WORKSPACE_DIR)),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")


BLOAT_ITEMS = {".git", ".idea", ".mvn", "target", ".DS_Store", "node_modules"}


def sanitize_directory(target_dir: Path) -> List[str]:
    removed_items = []
    for root, dirs, files in os.walk(target_dir, topdown=False):
        current_root = Path(root)

        for f in files:
            if f in BLOAT_ITEMS:
                file_path = current_root / f
                try:
                    file_path.unlink()
                    removed_items.append(str(file_path.relative_to(target_dir)))
                except Exception as e:
                    print(f"Error deleting file {file_path}: {e}")

        for d in dirs:
            if d in BLOAT_ITEMS:
                dir_path = current_root / d
                try:
                    shutil.rmtree(dir_path)
                    removed_items.append(str(dir_path.relative_to(target_dir)))
                except Exception as e:
                    print(f"Error deleting dir {dir_path}: {e}")

    return removed_items


IGNORED_TREE_ITEMS = {".git", ".idea", ".mvn", "target", ".DS_Store", "node_modules", "apache-maven-3.9.16", "platform-tools", "logs", "__pycache__"}


def build_directory_tree(path: Path) -> dict:
    if path.is_file():
        return {
            "name": path.name,
            "type": "file",
            "size_bytes": path.stat().st_size,
        }

    children = []
    try:
        entries = sorted(list(path.iterdir()), key=lambda p: (not p.is_dir(), p.name.lower()))
        for entry in entries:
            if entry.name in IGNORED_TREE_ITEMS:
                continue
            children.append(build_directory_tree(entry))
    except Exception:
        pass

    return {
        "name": path.name,
        "type": "directory",
        "children": children,
    }


def auto_patch_maven_pom(target_dir: Path):
    """
    Safely inspects pom.xml without destructive string replacements.
    Configuration parameters are passed at runtime via Maven CLI arguments.
    """
    pass


def safe_extract_zip(zip_file_path: Path, target_dir: Path):
    """Safely extracts a ZIP archive preventing path traversal attacks."""
    resolved_target = target_dir.resolve()
    with zipfile.ZipFile(zip_file_path, "r") as zip_ref:
        for member in zip_ref.infolist():
            # Check for path traversal attempts (e.g. ../../)
            member_path = (target_dir / member.filename).resolve()
            if not str(member_path).startswith(str(resolved_target)):
                raise ValueError(f"Path traversal detected in archive entry: {member.filename}")
            zip_ref.extract(member, target_dir)


@app.post("/api/upload")
async def upload_and_sanitize_zip(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Please upload a .zip archive."
        )

    raw_name = Path(file.filename).stem
    project_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in raw_name)
    if not project_name:
        project_name = "project"

    target_dir = WORKSPACE_DIR / project_name
    counter = 1
    while target_dir.exists():
        target_dir = WORKSPACE_DIR / f"{project_name}_{counter}"
        counter += 1

    target_dir.mkdir(parents=True, exist_ok=True)

    try:
        temp_zip_path = target_dir / "_temp_upload.zip"
        with temp_zip_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        safe_extract_zip(temp_zip_path, target_dir)
        temp_zip_path.unlink(missing_ok=True)

        deleted_bloat = sanitize_directory(target_dir)
        auto_patch_maven_pom(target_dir)

        dir_tree = build_directory_tree(target_dir)
        inspection = inspect_project(str(target_dir))

        return {
            "message": f"Project '{file.filename}' successfully uploaded, extracted, and sanitized.",
            "project_name": target_dir.name,
            "sanitized_project_path": str(target_dir.resolve()),
            "relative_workspace_path": str(target_dir.relative_to(WORKSPACE_DIR)),
            "framework": inspection.get("framework", "generic"),
            "framework_type": inspection.get("framework_type", "generic"),
            "frameworks": inspection.get("frameworks", []),
            "language": inspection.get("language", "unknown"),
            "build_system": inspection.get("build_system", "unknown"),
            "test_framework": inspection.get("test_framework", "unknown"),
            "platform": inspection.get("platform", "unknown"),
            "test_count": inspection.get("test_count", 0),
            "test_files": inspection.get("test_files", []),
            "tests": inspection.get("tests", []),
            "confidence": inspection.get("confidence", "high"),
            "evidence": inspection.get("evidence", []),
            "deleted_bloat_count": len(deleted_bloat),
            "deleted_bloat_items": deleted_bloat,
            "directory_tree": dir_tree,
        }

    except zipfile.BadZipFile:
        shutil.rmtree(target_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Uploaded file is corrupted or not a valid .zip file.")
    except ValueError as ve:
        shutil.rmtree(target_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        shutil.rmtree(target_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to process zip file: {str(e)}")


@app.get("/api/projects")
async def list_projects():
    if not WORKSPACE_DIR.exists():
        return {"projects": []}

    projects = []
    entries = sorted(list(WORKSPACE_DIR.iterdir()), key=lambda p: p.name.lower())
    for entry in entries:
        if entry.is_dir() and entry.name != ".gitkeep":
            inspection = await asyncio.to_thread(inspect_project, str(entry))
            projects.append({
                "project_name": entry.name,
                "sanitized_project_path": str(entry.resolve()),
                "relative_workspace_path": str(entry.relative_to(WORKSPACE_DIR)),
                "framework": inspection.get("framework", "generic"),
                "framework_type": inspection.get("framework_type", "generic"),
                "frameworks": inspection.get("frameworks", []),
                "language": inspection.get("language", "unknown"),
                "build_system": inspection.get("build_system", "unknown"),
                "test_framework": inspection.get("test_framework", "unknown"),
                "platform": inspection.get("platform", "unknown"),
                "test_count": inspection.get("test_count", 0),
                "test_files": inspection.get("test_files", []),
                "tests": inspection.get("tests", []),
                "confidence": inspection.get("confidence", "high"),
                "evidence": inspection.get("evidence", [])
            })
    return {"projects": projects}


@app.get("/api/projects/{project_name}")
async def get_project_details(project_name: str):
    target_dir = WORKSPACE_DIR / project_name
    if not target_dir.exists() or not target_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found in workspace.")

    inspection = await asyncio.to_thread(inspect_project, str(target_dir))

    return {
        "project_name": project_name,
        "sanitized_project_path": str(target_dir.resolve()),
        "relative_workspace_path": str(target_dir.relative_to(WORKSPACE_DIR)),
        "framework": inspection.get("framework", "generic"),
        "framework_type": inspection.get("framework_type", "generic"),
        "frameworks": inspection.get("frameworks", []),
        "language": inspection.get("language", "unknown"),
        "build_system": inspection.get("build_system", "unknown"),
        "test_framework": inspection.get("test_framework", "unknown"),
        "platform": inspection.get("platform", "unknown"),
        "test_count": inspection.get("test_count", 0),
        "test_files": inspection.get("test_files", []),
        "tests": inspection.get("tests", []),
        "confidence": inspection.get("confidence", "high"),
        "evidence": inspection.get("evidence", [])
    }


@app.get("/api/projects/{project_name}/tests")
async def get_project_tests_endpoint(project_name: str):
    target_dir = WORKSPACE_DIR / project_name
    if not target_dir.exists() or not target_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found in workspace.")

    inspection = await asyncio.to_thread(inspect_project, str(target_dir))
    return {
        "project_name": project_name,
        "test_count": inspection.get("test_count", 0),
        "test_files": inspection.get("test_files", []),
        "tests": inspection.get("tests", []),
        "framework": inspection.get("framework", "generic"),
        "language": inspection.get("language", "unknown"),
        "build_system": inspection.get("build_system", "unknown")
    }


@app.get("/api/projects/{project_name}/tree")
async def get_project_tree_endpoint(project_name: str):
    target_dir = WORKSPACE_DIR / project_name
    if not target_dir.exists() or not target_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found in workspace.")

    tree = await asyncio.to_thread(build_directory_tree, target_dir)
    return {
        "project_name": project_name,
        "tree": tree
    }


@app.get("/api/reports/{project_name}/{filename}")
async def get_excel_report(project_name: str, filename: str):
    project_dir = WORKSPACE_DIR / project_name
    if not project_dir.exists() or not project_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found in workspace.")

    file_path = project_dir / filename
    if not file_path.exists():
        matching_files = list(project_dir.glob(f"**/{filename}"))
        if matching_files:
            file_path = matching_files[0]
        else:
            raise HTTPException(status_code=404, detail=f"Report file '{filename}' not found.")

    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    if filename.lower().endswith(".xls"):
        media_type = "application/vnd.ms-excel"

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=filename,
    )


@app.get("/api/analytics/{project_name}")
async def get_project_analytics(project_name: str):
    project_dir = WORKSPACE_DIR / project_name
    if not project_dir.exists() or not project_dir.is_dir():
        return {"passed": 0, "failed": 0, "skipped": 0, "total": 0}

    metrics = parse_surefire_reports(str(project_dir))

    return {
        "project_name": project_name,
        "passed": metrics["passed"],
        "failed": metrics["failed"],
        "skipped": metrics["skipped"],
        "total": metrics["total"],
    }


class ThrottleRequest(BaseModel):
    speed: str


SPEED_MAPPING = {
    "full": "full",
    "5g": "full",
    "4g": "lte",
    "3g": "umts",
    "edge": "edge"
}


@app.post("/api/network/throttle")
async def throttle_network(req: ThrottleRequest):
    raw_speed = req.speed.lower()
    adb_speed = SPEED_MAPPING.get(raw_speed, raw_speed)

    adb_path = find_adb_executable()
    if not adb_path:
        return {
            "message": f"Network speed preference set to '{req.speed}' (ADB offline)",
            "speed": req.speed,
            "adb_executed": False
        }

    try:
        process = await asyncio.create_subprocess_exec(
            adb_path,
            "emu",
            "network",
            "speed",
            adb_speed,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=3.0)

        return {
            "message": f"Successfully throttled AVD network speed to '{req.speed}' ({adb_speed})",
            "speed": req.speed,
            "adb_executed": True,
            "stdout": stdout.decode(errors="ignore").strip()
        }
    except Exception as e:
        return {
            "message": f"Network speed preference saved: '{req.speed}'",
            "speed": req.speed,
            "adb_executed": False,
            "error": str(e)
        }


@app.get("/api/devices")
async def list_devices_endpoint():
    """
    Unified device discovery returning physical Android devices (USB/Wi-Fi)
    and Android Studio Emulators with standardized statuses.
    """
    unified_devices = await device_manager.discover_all_devices_async()
    dev_dicts = [d.to_dict() for d in unified_devices]
    real_devices = [d for d in dev_dicts if d["type"] == "physical"]
    emulators = [d for d in dev_dicts if d["type"] == "emulator"]
    reservations = device_manager._reservations

    return {
        "devices": dev_dicts,
        "real_devices": real_devices,
        "emulators": emulators,
        "reservations": reservations
    }


@app.get("/api/devices/{device_id}")
async def get_single_device_endpoint(device_id: str):
    """Returns detailed unified device model with hardware telemetry."""
    device = await device_manager.get_device_async(device_id, enrich_telemetry=True)
    if not device:
        raise HTTPException(status_code=404, detail=f"Device '{device_id}' not found")
    return device.to_dict()


@app.get("/api/stream/{device_id}")
async def get_device_stream_endpoint(device_id: str):
    """Streams live MJPEG frames directly over HTTP for target device."""
    return StreamingResponse(
        generate_mjpeg_stream_async(target_device_id=device_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


class StartEmulatorRequest(BaseModel):
    avd_name: str


@app.post("/api/emulator/start")
async def start_emulator_endpoint(req: StartEmulatorRequest):
    result = await device_manager.start_emulator_async(req.avd_name)
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("message", "Failed to start emulator"))
    return result


class StopEmulatorRequest(BaseModel):
    device_id: str


@app.post("/api/emulator/stop")
async def stop_emulator_endpoint(req: StopEmulatorRequest):
    result = await device_manager.stop_emulator_async(req.device_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("message", "Failed to stop emulator"))
    return result


class EmulatorControlRequest(BaseModel):
    action: str
    device_id: Optional[str] = None
    params: Optional[dict] = None


@app.post("/api/emulator/control")
async def emulator_control_endpoint(req: EmulatorControlRequest):
    result = await execute_emulator_control_async(req.action, target_device_id=req.device_id, params=req.params)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "Emulator control action failed"))
    return result


class DeviceControlRequest(BaseModel):
    action: str
    device_id: Optional[str] = None
    params: Optional[dict] = None


@app.post("/api/device/control")
async def device_control_endpoint(req: DeviceControlRequest):
    result = await execute_device_control_async(req.action, params=req.params or {}, target_device_id=req.device_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "Device control execution failed"))
    return result


@app.get("/api/device/info")
async def device_info_endpoint(device_id: Optional[str] = None):
    return await get_advanced_device_info_async(target_device_id=device_id)


@app.post("/api/emulator/open-studio")
async def open_android_studio_endpoint():
    try:
        if os.name == 'posix':
            subprocess.Popen(["open", "-a", "Android Studio"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif os.name == 'nt':
            subprocess.Popen(["cmd", "/c", "start", "studio64.exe"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return {"status": "success", "message": "Launching Android Studio..."}
    except Exception as e:
        return {"status": "error", "message": f"Please open Android Studio manually: {str(e)}"}


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)


manager = ConnectionManager()


@app.on_event("startup")
async def startup_event():
    execution_manager.start_worker()


class CreateExecutionRequest(BaseModel):
    project: str
    test: Optional[str] = None
    device_id: Optional[str] = None


@app.post("/api/executions")
async def create_execution_endpoint(req: CreateExecutionRequest):
    """
    Creates and enqueues an ExecutionJob into the single worker sequential queue (FIFO).
    Returns immediately with execution_id and status='QUEUED'.
    """
    try:
        job = await execution_manager.create_and_enqueue_job(
            project=req.project,
            test=req.test,
            device_id=req.device_id
        )
        return {
            "execution_id": job.id,
            "status": job.status,
            "job": job.to_dict()
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/executions")
async def list_executions_endpoint(project: Optional[str] = None, limit: int = 50):
    """Lists recent execution jobs, optionally filtered by project name."""
    jobs = execution_manager.list_jobs(project=project, limit=limit)
    return {"executions": [j.to_dict() for j in jobs]}


@app.get("/api/executions/{execution_id}")
async def get_execution_endpoint(execution_id: str):
    """Retrieves full execution job status and telemetry."""
    job = execution_manager.get_job(execution_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Execution '{execution_id}' not found")
    return job.to_dict()


@app.post("/api/executions/{execution_id}/cancel")
async def cancel_execution_endpoint(execution_id: str):
    """
    Cancels an execution job.
    - If QUEUED: transitions immediately to CANCELLED.
    - If RUNNING / STARTING: transitions to CANCEL_REQUESTED and terminates subprocess safely.
    """
    job = await execution_manager.cancel_job(execution_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Execution '{execution_id}' not found")
    return {
        "status": job.status,
        "message": f"Execution '{execution_id}' cancellation requested",
        "job": job.to_dict()
    }


@app.post("/api/execute/{project_name}")
async def execute_test_endpoint(
    project_name: str,
    test_file: Optional[str] = None,
    device_id: Optional[str] = None
):
    """
    Backward-compatible test execution endpoint.
    Creates and enqueues an ExecutionJob into the sequential queue and returns immediately.
    """
    try:
        job = await execution_manager.create_and_enqueue_job(
            project=project_name,
            test=test_file,
            device_id=device_id
        )
        return {
            "status": "queued",
            "message": f"Test execution queued for project '{project_name}'",
            "project_name": project_name,
            "device_id": device_id,
            "execution_id": job.id,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/execute/{project_name}")
async def websocket_execute_test(websocket: WebSocket, project_name: str, test_file: Optional[str] = None, device_id: Optional[str] = None):
    await websocket.accept()
    target_dir = WORKSPACE_DIR / project_name

    if not target_dir.exists() or not target_dir.is_dir():
        await websocket.send_text(f"[RUNNER ERROR] Project directory '{project_name}' not found in workspace.")
        await websocket.close(code=4004)
        return

    try:
        await run_test_process_websocket(str(target_dir), websocket, test_file=test_file, device_id=device_id)
    except Exception as e:
        try:
            await websocket.send_text(f"[RUNNER ERROR] Execution exception: {str(e)}")
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@app.get("/api/status/{project_name}")
async def get_execution_status_endpoint(project_name: str):
    """Returns current execution status flag ('Idle', 'Running', 'Completed', 'Failed') and details."""
    return get_latest_execution_status(project_name)


@app.get("/api/logs/{project_name}")
async def list_project_logs(project_name: str):
    """Lists available log files stored in workspace/logs/ for project_name."""
    logs_dir = get_logs_dir()
    if not logs_dir.exists():
        return {"project_name": project_name, "logs": []}

    log_files = []
    prefix = f"{project_name}_"
    for f in sorted(logs_dir.glob("*.log"), key=lambda p: p.stat().st_mtime, reverse=True):
        if f.name.startswith(prefix) or f.name == f"{project_name}.log":
            log_files.append({
                "filename": f.name,
                "size_bytes": f.stat().st_size,
                "created_at": datetime.datetime.fromtimestamp(f.stat().st_ctime, datetime.timezone.utc).isoformat(),
                "download_url": f"/api/logs/{project_name}/{f.name}"
            })

    return {"project_name": project_name, "logs": log_files}


@app.get("/api/logs/{project_name}/{filename}")
async def get_log_file_endpoint(project_name: str, filename: str, download: bool = False):
    """Returns content of specified log file or downloads it as plain text."""
    logs_dir = get_logs_dir()
    file_path = logs_dir / filename

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"Log file '{filename}' not found.")

    if download:
        return FileResponse(
            path=file_path,
            media_type="text/plain",
            filename=filename
        )

    try:
        content = file_path.read_text(encoding="utf-8", errors="ignore")
        return {
            "project_name": project_name,
            "filename": filename,
            "content": content,
            "size_bytes": file_path.stat().st_size
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read log file: {str(e)}")


@app.get("/api/recordings/{filename}")
async def get_recording_file_endpoint(filename: str, download: bool = False):
    """Streams or downloads an MP4 screen recording with range request support."""
    recordings_dir = get_logs_dir() / "recordings"
    file_path = recordings_dir / filename

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"Recording file '{filename}' not found.")

    return FileResponse(
        path=file_path,
        media_type="video/mp4",
        filename=filename if download else None,
        headers={"Accept-Ranges": "bytes"}
    )


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanly stops all active device capture pipelines on server shutdown."""
    from app.services.capture_pipeline import capture_pipeline_manager
    await capture_pipeline_manager.stop_all()


@app.websocket("/ws/emulator")
async def websocket_emulator_stream(websocket: WebSocket, device_id: Optional[str] = None):
    """Unified WebSocket streaming endpoint powered by single-capture pipeline."""
    await websocket.accept()
    try:
        from app.services.capture_pipeline import capture_pipeline_manager
        from app.services.adb_bridge import find_adb_executable, get_online_adb_device_async
        adb_path = find_adb_executable()
        target_device = None
        if adb_path:
            target_device = await get_online_adb_device_async(adb_path, target_device_id=device_id)
        if not target_device and device_id:
            target_device = device_id

        if not target_device:
            await websocket.send_text("ERR: [ADB_DISCONNECTED] No online Android device detected.")
            return

        await capture_pipeline_manager.stream_live_view(websocket, target_device)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[WS Emulator Error] {e}")


@app.websocket("/ws/logs")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        await websocket.send_text("TestBench WebSocket connected.")
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Event received: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
