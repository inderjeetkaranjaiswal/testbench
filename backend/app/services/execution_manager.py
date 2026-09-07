import asyncio
import datetime
import os
import subprocess
import time
import uuid
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional, Dict, Any, List

from app.config import get_workspace_dir, get_logs_dir
from app.services.scanner import find_project_root
from app.services.device_manager import device_manager
from app.services.capture_pipeline import capture_pipeline_manager
from app.services.db import (
    insert_execution_job,
    update_execution_job,
    get_execution_job,
    list_execution_jobs
)


@dataclass
class ExecutionJob:
    id: str
    project: str
    test: Optional[str]
    device_id: Optional[str]
    device_type: Optional[str]
    status: str  # QUEUED, STARTING, RUNNING, COMPLETED, FAILED, CANCEL_REQUESTED, CANCELLED
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration: Optional[float] = None
    exit_code: Optional[int] = None
    result: Optional[str] = None  # passed, failed, cancelled
    log_file: Optional[str] = None
    report_file: Optional[str] = None
    recording_file: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ExecutionManager:
    """
    Manages execution jobs and a single sequential FIFO execution queue.
    Guarantees that exactly ONE test job runs at any time.
    Provides cancellation for queued and running jobs with clean device release.
    """

    def __init__(self):
        self._queue: asyncio.Queue = asyncio.Queue()
        self._jobs: Dict[str, ExecutionJob] = {}
        self._active_job_id: Optional[str] = None
        self._active_proc: Optional[subprocess.Popen] = None
        self._active_cancel_flag: bool = False
        self._worker_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    def start_worker(self):
        """Starts the sequential background worker loop if not already running."""
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker_loop())

    async def create_and_enqueue_job(
        self,
        project: str,
        test: Optional[str] = None,
        device_id: Optional[str] = None
    ) -> ExecutionJob:
        """
        Validates project, creates a unique ExecutionJob, persists it in DB,
        enqueues it into the FIFO queue, and returns immediately.
        """
        workspace_dir = get_workspace_dir()
        proj_dir = workspace_dir / project
        if not proj_dir.exists():
            raise ValueError(f"Project '{project}' not found in workspace.")

        # Resolve device info if possible
        dev_type = "emulator" if (device_id and device_id.startswith("emulator-")) else "physical"
        if device_id:
            dev_obj = await device_manager.get_device_async(device_id)
            if dev_obj:
                dev_type = dev_obj.type

        timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_suffix = uuid.uuid4().hex[:6]
        job_id = f"exec_{timestamp_str}_{unique_suffix}"
        log_filename = f"{project}_{timestamp_str}_{unique_suffix}.log"

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        job = ExecutionJob(
            id=job_id,
            project=project,
            test=test,
            device_id=device_id or "emulator-5554",
            device_type=dev_type,
            status="QUEUED",
            created_at=now_iso,
            log_file=log_filename
        )

        self._jobs[job_id] = job
        insert_execution_job(job.to_dict())

        await self._queue.put(job_id)
        self.start_worker()

        return job

    async def cancel_job(self, job_id: str) -> Optional[ExecutionJob]:
        """
        Cancels an execution job.
        - If QUEUED: marks CANCELLED immediately.
        - If RUNNING / STARTING: sets CANCEL_REQUESTED and terminates active subprocess.
        """
        job = self._jobs.get(job_id)
        if not job:
            db_data = get_execution_job(job_id)
            if db_data:
                job = ExecutionJob(**db_data)
                self._jobs[job_id] = job
            else:
                return None

        if job.status == "QUEUED":
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            job.status = "CANCELLED"
            job.result = "cancelled"
            job.completed_at = now_iso
            job.error = "Cancelled by user while in queue."
            update_execution_job(
                job_id,
                status="CANCELLED",
                result="cancelled",
                completed_at=now_iso,
                error=job.error
            )
            try:
                from app.services.runner import update_session_status
                update_session_status(job_id, "CANCELLED", error_message=job.error)
            except Exception:
                pass
            return job

        if job.status in ("STARTING", "RUNNING"):
            job.status = "CANCEL_REQUESTED"
            self._active_cancel_flag = True
            update_execution_job(job_id, status="CANCEL_REQUESTED")

            # Terminate active process safely
            if self._active_proc:
                try:
                    self._active_proc.terminate()
                    await asyncio.sleep(0.3)
                    if self._active_proc.poll() is None:
                        self._active_proc.kill()
                except Exception:
                    pass

            return job

        return job

    def get_job(self, job_id: str) -> Optional[ExecutionJob]:
        """Gets an execution job from in-memory cache or SQLite database."""
        if job_id in self._jobs:
            return self._jobs[job_id]
        db_data = get_execution_job(job_id)
        if db_data:
            job = ExecutionJob(**db_data)
            self._jobs[job_id] = job
            return job
        return None

    def list_jobs(self, project: Optional[str] = None, limit: int = 50) -> List[ExecutionJob]:
        """Lists recent execution jobs."""
        db_rows = list_execution_jobs(project=project, limit=limit)
        results = []
        for r in db_rows:
            job = ExecutionJob(**r)
            self._jobs[job.id] = job
            results.append(job)
        return results

    async def _worker_loop(self):
        """
        Sequential worker loop: pulls one job from FIFO queue and executes it.
        Guarantees single worker concurrency and cleans up device reservation.
        """
        from app.services.runner import execute_job_sync

        while True:
            try:
                job_id = await self._queue.get()
            except asyncio.CancelledError:
                break

            job = self.get_job(job_id)
            if not job:
                self._queue.task_done()
                continue

            # If job was cancelled while waiting in queue, skip execution
            if job.status == "CANCELLED":
                self._queue.task_done()
                continue

            async with self._lock:
                self._active_job_id = job_id
                self._active_cancel_flag = False
                now_start = datetime.datetime.now(datetime.timezone.utc)
                start_time_sec = time.time()

                job.status = "STARTING"
                job.started_at = now_start.isoformat()
                update_execution_job(job_id, status="STARTING", started_at=job.started_at)

                def _set_proc_callback(proc):
                    self._active_proc = proc

                def _check_cancel_callback():
                    return self._active_cancel_flag

                try:
                    job.status = "RUNNING"
                    update_execution_job(job_id, status="RUNNING")

                    # Start unified capture recording for this device & execution
                    rec_output_dir = get_logs_dir() / "recordings"
                    rec_output_dir.mkdir(parents=True, exist_ok=True)
                    rec_output_path = rec_output_dir / f"{job_id}.mp4"
                    target_dev = job.device_id or "emulator-5554"

                    try:
                        await capture_pipeline_manager.start_recording(target_dev, job_id, rec_output_path)
                    except Exception as rec_err:
                        print(f"[EXECUTION MANAGER RECORDING START WARNING] {rec_err}")

                    # Run job synchronously in thread pool to avoid blocking asyncio event loop
                    exit_code, report_path, error_msg = await asyncio.to_thread(
                        execute_job_sync,
                        job,
                        set_proc_callback=_set_proc_callback,
                        check_cancel_callback=_check_cancel_callback
                    )

                    # Stop recording and retrieve saved MP4 file path
                    recording_path = None
                    try:
                        recording_path = await capture_pipeline_manager.stop_recording(target_dev, job_id)
                    except Exception as rec_err:
                        print(f"[EXECUTION MANAGER RECORDING STOP WARNING] {rec_err}")

                    now_end = datetime.datetime.now(datetime.timezone.utc)
                    duration_sec = round(time.time() - start_time_sec, 2)

                    job.completed_at = now_end.isoformat()
                    job.duration = duration_sec
                    job.exit_code = exit_code
                    job.report_file = report_path
                    job.recording_file = recording_path

                    if self._active_cancel_flag:
                        job.status = "CANCELLED"
                        job.result = "cancelled"
                        job.error = error_msg or "Execution cancelled by user."
                    elif exit_code == 0:
                        job.status = "COMPLETED"
                        job.result = "passed"
                    else:
                        job.status = "FAILED"
                        job.result = "failed"
                        job.error = error_msg or f"Process exited with code {exit_code}"

                    update_execution_job(
                        job_id,
                        status=job.status,
                        completed_at=job.completed_at,
                        duration=job.duration,
                        exit_code=job.exit_code,
                        result=job.result,
                        report_file=job.report_file,
                        recording_file=job.recording_file,
                        error=job.error
                    )

                    try:
                        from app.services.runner import update_session_status
                        update_session_status(job_id, job.status, exit_code=job.exit_code, error_message=job.error, duration=job.duration)
                    except Exception:
                        pass

                except Exception as e:
                    now_end = datetime.datetime.now(datetime.timezone.utc)
                    job.completed_at = now_end.isoformat()
                    job.duration = round(time.time() - start_time_sec, 2)
                    job.status = "FAILED"
                    job.result = "failed"
                    job.error = str(e)
                    update_execution_job(
                        job_id,
                        status="FAILED",
                        completed_at=job.completed_at,
                        duration=job.duration,
                        result="failed",
                        error=str(e)
                    )
                    try:
                        from app.services.runner import update_session_status
                        update_session_status(job_id, "FAILED", error_message=str(e))
                    except Exception:
                        pass
                finally:
                    self._active_job_id = None
                    self._active_proc = None
                    self._active_cancel_flag = False
                    self._queue.task_done()


# Global Execution Manager Singleton
execution_manager = ExecutionManager()
