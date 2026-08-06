import os
import sys
import shutil
import asyncio
import zipfile
import datetime
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.services.scanner import inspect_project
from app.services.analytics import parse_surefire_reports
from app.services.adb_bridge import (
    stream_emulator_frames,
    find_adb_executable,
    execute_device_control_async,
    get_advanced_device_info_async,
    list_all_devices_and_emulators_async,
    start_emulator_async,
    stop_emulator_async,
    execute_emulator_control_async
)
from app.services.runner import run_test_background, run_test_process_websocket, resolve_test_command, get_active_session
from app.services.db import init_db, get_latest_execution_status

if sys.platform == 'win32':
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

init_db()

app = FastAPI(
    title="TestBench Backend API",
    description="FastAPI backend for TestBench project management, execution, and real-time monitoring",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
WORKSPACE_DIR = BASE_DIR / "workspace"
WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)


class SystemStatus(BaseModel):
    status: str
    backend: str
    workspace_path: str
    active_projects: int


@app.get("/api/health", response_model=SystemStatus)
async def health_check():
    project_count = 0
    if WORKSPACE_DIR.exists():
        project_count = len([p for p in WORKSPACE_DIR.iterdir() if p.is_dir()])

    return SystemStatus(
        status="online",
        backend="FastAPI + Uvicorn",
        workspace_path=str(WORKSPACE_DIR),
        active_projects=project_count,
    )


@app.get("/api/execution/session")
async def get_execution_session_endpoint():
    """Returns the current Single Source of Truth execution session state."""
    return get_active_session()


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
    for pom_file in target_dir.rglob("pom.xml"):
        try:
            content = pom_file.read_text(encoding="utf-8", errors="ignore")
            modified = False
            if "maven-surefire-plugin" in content:
                if "<classesDirectory>" not in content and "<configuration>" in content:
                    content = content.replace(
                        "<configuration>",
                        "<configuration>\n                    <classesDirectory>${project.build.directory}/classes</classesDirectory>\n                    <testClassesDirectory>${project.build.directory}/classes</testClassesDirectory>"
                    )
                    modified = True

                if "<reuseForks>" not in content and "<configuration>" in content:
                    content = content.replace(
                        "<configuration>",
                        "<configuration>\n                    <reuseForks>true</reuseForks>\n                    <forkCount>1</forkCount>"
                    )
                    modified = True

                if modified:
                    pom_file.write_text(content, encoding="utf-8")
        except Exception as e:
            print(f"[POM Auto-Patch Warning] {e}")


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

        with zipfile.ZipFile(temp_zip_path, "r") as zip_ref:
            zip_ref.extractall(target_dir)

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
            "framework_type": inspection["framework_type"],
            "test_count": inspection["test_count"],
            "test_files": inspection["test_files"],
            "deleted_bloat_count": len(deleted_bloat),
            "deleted_bloat_items": deleted_bloat,
            "directory_tree": dir_tree,
        }

    except zipfile.BadZipFile:
        shutil.rmtree(target_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Uploaded file is corrupted or not a valid .zip file.")
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
                "framework_type": inspection["framework_type"],
                "test_count": inspection["test_count"],
                "test_files": inspection["test_files"],
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
        "framework_type": inspection["framework_type"],
        "sanitized_project_path": str(target_dir.resolve()),
        "relative_workspace_path": str(target_dir.relative_to(WORKSPACE_DIR)),
        "test_count": inspection["test_count"],
        "test_files": inspection["test_files"],
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
    return await list_all_devices_and_emulators_async()


class StartEmulatorRequest(BaseModel):
    avd_name: str


@app.post("/api/emulator/start")
async def start_emulator_endpoint(req: StartEmulatorRequest):
    result = await start_emulator_async(req.avd_name)
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("message", "Failed to start emulator"))
    return result


class StopEmulatorRequest(BaseModel):
    device_id: str


@app.post("/api/emulator/stop")
async def stop_emulator_endpoint(req: StopEmulatorRequest):
    result = await stop_emulator_async(req.device_id)
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


@app.post("/api/execute/{project_name}")
async def execute_test_endpoint(
    project_name: str,
    background_tasks: BackgroundTasks,
    test_file: Optional[str] = None
):
    """
    Triggers test execution asynchronously via FastAPI BackgroundTasks.
    Redirects stdout/stderr directly into workspace/logs/{project_name}_{timestamp}.log.
    """
    target_dir = WORKSPACE_DIR / project_name
    if not target_dir.exists() or not target_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found in workspace.")

    background_tasks.add_task(run_test_background, str(target_dir), project_name, test_file)

    return {
        "status": "queued",
        "message": f"Test execution queued for project '{project_name}'",
        "project_name": project_name,
    }


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
    logs_dir = WORKSPACE_DIR / "logs"
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
    logs_dir = WORKSPACE_DIR / "logs"
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


@app.websocket("/ws/emulator")
async def websocket_emulator_stream(websocket: WebSocket, device_id: Optional[str] = None):
    await websocket.accept()
    try:
        await stream_emulator_frames(websocket, fps=30, target_device_id=device_id)
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
