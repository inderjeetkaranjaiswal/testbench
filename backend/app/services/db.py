import sqlite3
import datetime
from pathlib import Path
from typing import Optional, Dict, Any

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
WORKSPACE_DIR = BASE_DIR / "workspace"
DB_PATH = WORKSPACE_DIR / "testbench.db"


def get_connection():
    WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initializes SQLite database schema for execution status tracking."""
    with get_connection() as conn:
        cursor = conn.cursor()
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
        conn.commit()


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
    """Returns the latest execution status for a given project, or default 'Idle' status."""
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
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
