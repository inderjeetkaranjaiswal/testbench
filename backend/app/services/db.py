import sqlite3
import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List

from app.config import get_db_path, get_workspace_dir


def get_connection():
    get_workspace_dir().mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(get_db_path()), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initializes SQLite database schema for execution jobs and status tracking."""
    with get_connection() as conn:
        cursor = conn.cursor()
        # Legacy status table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS execution_status (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_name TEXT NOT NULL,
                status TEXT NOT NULL,
                log_file TEXT,
                started_at TEXT,
                completed_at TEXT,
                exit_code INTEGER
            )
        """)
        # Unified Execution Jobs table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS execution_jobs (
                id TEXT PRIMARY KEY,
                project TEXT NOT NULL,
                test TEXT,
                device_id TEXT,
                device_type TEXT,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT,
                duration REAL,
                exit_code INTEGER,
                result TEXT,
                log_file TEXT,
                report_file TEXT,
                recording_file TEXT,
                error TEXT
            )
        """)
        # Auto-migrate table if recording_file column is missing
        cursor.execute("PRAGMA table_info(execution_jobs)")
        columns = [col[1] for col in cursor.fetchall()]
        if "recording_file" not in columns:
            try:
                cursor.execute("ALTER TABLE execution_jobs ADD COLUMN recording_file TEXT")
            except Exception:
                pass
        conn.commit()


# ==============================================================================
# EXECUTION JOBS CRUD OPERATIONS
# ==============================================================================

def insert_execution_job(job_data: Dict[str, Any]):
    """Persists a new execution job into execution_jobs."""
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO execution_jobs (
                id, project, test, device_id, device_type, status,
                created_at, started_at, completed_at, duration,
                exit_code, result, log_file, report_file, recording_file, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            job_data.get("id"),
            job_data.get("project"),
            job_data.get("test"),
            job_data.get("device_id"),
            job_data.get("device_type"),
            job_data.get("status"),
            job_data.get("created_at"),
            job_data.get("started_at"),
            job_data.get("completed_at"),
            job_data.get("duration"),
            job_data.get("exit_code"),
            job_data.get("result"),
            job_data.get("log_file"),
            job_data.get("report_file"),
            job_data.get("recording_file"),
            job_data.get("error")
        ))
        conn.commit()


def update_execution_job(job_id: str, **kwargs):
    """Updates fields on an existing execution job."""
    init_db()
    if not kwargs:
        return
    set_clause = ", ".join(f"{k} = ?" for k in kwargs.keys())
    values = list(kwargs.values()) + [job_id]
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE execution_jobs SET {set_clause} WHERE id = ?", values)
        conn.commit()


def get_execution_job(job_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves an execution job by ID."""
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM execution_jobs WHERE id = ?", (job_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def list_execution_jobs(project: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """Lists execution jobs, optionally filtered by project name, ordered by created_at DESC."""
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        if project:
            cursor.execute("""
                SELECT * FROM execution_jobs
                WHERE project = ?
                ORDER BY created_at DESC LIMIT ?
            """, (project, limit))
        else:
            cursor.execute("""
                SELECT * FROM execution_jobs
                ORDER BY created_at DESC LIMIT ?
            """, (limit,))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]


# ==============================================================================
# LEGACY STATUS TABLE COMPATIBILITY
# ==============================================================================

def start_execution(project_name: str, log_file: str) -> int:
    """Inserts a new execution record with status 'Running' and returns record ID."""
    init_db()
    now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO execution_status (project_name, status, log_file, started_at)
            VALUES (?, 'Running', ?, ?)
        """, (project_name, log_file, now_str))
        conn.commit()
        return cursor.lastrowid


def update_execution_status(execution_id: int, status: str, exit_code: Optional[int] = None):
    """Updates status ('Completed' | 'Failed') and completed_at timestamp for a given execution record ID."""
    now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE execution_status
            SET status = ?, completed_at = ?, exit_code = ?
            WHERE id = ?
        """, (status, now_str, exit_code, execution_id))
        conn.commit()


def get_latest_execution_status(project_name: str) -> Dict[str, Any]:
    """Returns the latest execution status for a given project from execution_jobs or execution_status."""
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM execution_jobs
            WHERE project = ?
            ORDER BY created_at DESC LIMIT 1
        """, (project_name,))
        job_row = cursor.fetchone()

        if job_row:
            j = dict(job_row)
            # Map standardized job statuses to UI status string
            st_map = {
                "QUEUED": "Running",
                "STARTING": "Running",
                "RUNNING": "Running",
                "COMPLETED": "Completed",
                "FAILED": "Failed",
                "CANCEL_REQUESTED": "Running",
                "CANCELLED": "Failed"
            }
            return {
                "project_name": j["project"],
                "status": st_map.get(j["status"], j["status"].capitalize()),
                "log_file": j.get("log_file"),
                "started_at": j.get("started_at"),
                "completed_at": j.get("completed_at"),
                "exit_code": j.get("exit_code"),
                "execution_id": j.get("id"),
                "result": j.get("result")
            }

        # Fallback to execution_status table
        cursor.execute("""
            SELECT * FROM execution_status
            WHERE project_name = ?
            ORDER BY id DESC LIMIT 1
        """, (project_name,))
        row = cursor.fetchone()

        if row:
            return dict(row)
        else:
            return {
                "project_name": project_name,
                "status": "Idle",
                "log_file": None,
                "started_at": None,
                "completed_at": None,
                "exit_code": None
            }
