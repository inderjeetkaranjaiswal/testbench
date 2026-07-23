import asyncio
import os
from pathlib import Path
from typing import Callable, Awaitable, Set
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileSystemEvent


class ExcelReportHandler(FileSystemEventHandler):
    """Watchdog event handler for detecting newly created or modified .xlsx / .xls report files."""

    def __init__(
        self,
        project_name: str,
        loop: asyncio.AbstractEventLoop,
        async_callback: Callable[[dict], Awaitable[None]]
    ):
        super().__init__()
        self.project_name = project_name
        self.loop = loop
        self.async_callback = async_callback
        self.emitted_files: Set[str] = set()

    def _handle_event(self, event: FileSystemEvent):
        if event.is_directory:
            return

        file_path = Path(event.src_path)
        filename = file_path.name

        # Ignore Excel temporary lock files starting with ~$
        if filename.startswith("~$"):
            return

        if filename.lower().endswith((".xlsx", ".xls")):
            if filename not in self.emitted_files:
                self.emitted_files.add(filename)
                payload = {
                    "type": "REPORT_GENERATED",
                    "file_name": filename,
                    "download_url": f"/api/reports/{self.project_name}/{filename}"
                }
                # Thread-safe dispatch to asyncio event loop
                asyncio.run_coroutine_threadsafe(self.async_callback(payload), self.loop)

    def on_created(self, event: FileSystemEvent):
        self._handle_event(event)

    def on_modified(self, event: FileSystemEvent):
        self._handle_event(event)


class ExcelReportWatcher:
    """Wrapper around watchdog Observer for monitoring active project execution folders."""

    def __init__(
        self,
        project_path: str,
        project_name: str,
        loop: asyncio.AbstractEventLoop,
        async_callback: Callable[[dict], Awaitable[None]]
    ):
        self.project_path = project_path
        self.project_name = project_name
        self.loop = loop
        self.async_callback = async_callback
        self.observer = Observer()

    def start(self):
        handler = ExcelReportHandler(self.project_name, self.loop, self.async_callback)
        self.observer.schedule(handler, path=self.project_path, recursive=True)
        self.observer.start()

    def stop(self):
        try:
            self.observer.stop()
            self.observer.join(timeout=2)
        except Exception:
            pass
