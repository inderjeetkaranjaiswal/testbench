import unittest
from unittest.mock import patch, MagicMock
import asyncio
import os
import tempfile
from pathlib import Path

from app.services.execution_manager import ExecutionJob, ExecutionManager
from app.services.db import get_execution_job, list_execution_jobs, init_db


class TestExecutionManager(unittest.TestCase):

    def setUp(self):
        init_db()
        self.em = ExecutionManager()

    def test_job_model_serialization(self):
        job = ExecutionJob(
            id="exec_test_001",
            project="chekup_automation-Bhargav",
            test="LoginValidationTest#testEmptyMobileNumber",
            device_id="emulator-5554",
            device_type="emulator",
            status="QUEUED",
            created_at="2026-08-18T10:30:00Z"
        )
        d = job.to_dict()
        self.assertEqual(d["id"], "exec_test_001")
        self.assertEqual(d["status"], "QUEUED")
        self.assertEqual(d["device_type"], "emulator")

    def test_create_and_enqueue_job(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            proj_dir = Path(tmpdir) / "test_proj"
            proj_dir.mkdir(parents=True, exist_ok=True)

            with patch("app.services.execution_manager.get_workspace_dir", return_value=Path(tmpdir)):
                async def run():
                    job = await self.em.create_and_enqueue_job(
                        project="test_proj",
                        test="testMethod",
                        device_id="emulator-5554"
                    )
                    self.assertEqual(job.status, "QUEUED")
                    self.assertEqual(job.project, "test_proj")
                    self.assertIsNotNone(job.id)

                    # Verify lookup
                    fetched = self.em.get_job(job.id)
                    self.assertIsNotNone(fetched)
                    self.assertEqual(fetched.id, job.id)

                asyncio.run(run())

    def test_queued_cancellation(self):
        async def run():
            job = ExecutionJob(
                id="exec_cancel_test",
                project="test_proj",
                test="testMethod",
                device_id="emulator-5554",
                device_type="emulator",
                status="QUEUED",
                created_at="2026-08-18T10:30:00Z"
            )
            self.em._jobs[job.id] = job
            await self.em._queue.put(job.id)

            cancelled_job = await self.em.cancel_job("exec_cancel_test")
            self.assertIsNotNone(cancelled_job)
            self.assertEqual(cancelled_job.status, "CANCELLED")
            self.assertEqual(cancelled_job.result, "cancelled")

        asyncio.run(run())

    def test_running_cancellation(self):
        async def run():
            mock_proc = MagicMock()
            mock_proc.poll.return_value = None

            job = ExecutionJob(
                id="exec_running_cancel_test",
                project="test_proj",
                test="testMethod",
                device_id="emulator-5554",
                device_type="emulator",
                status="RUNNING",
                created_at="2026-08-18T10:30:00Z"
            )
            self.em._jobs[job.id] = job
            self.em._active_job_id = job.id
            self.em._active_proc = mock_proc

            cancelled_job = await self.em.cancel_job("exec_running_cancel_test")
            self.assertIsNotNone(cancelled_job)
            self.assertEqual(cancelled_job.status, "CANCEL_REQUESTED")
            mock_proc.terminate.assert_called_once()

        asyncio.run(run())

    @patch("app.services.execution_manager.get_workspace_dir")
    def test_fifo_ordering(self, mock_ws):
        async def run():
            job1 = ExecutionJob("j1", "proj", "t1", "dev", "emulator", "QUEUED", "2026-08-18T10:00:00Z")
            job2 = ExecutionJob("j2", "proj", "t2", "dev", "emulator", "QUEUED", "2026-08-18T10:00:01Z")
            self.em._jobs["j1"] = job1
            self.em._jobs["j2"] = job2
            await self.em._queue.put("j1")
            await self.em._queue.put("j2")

            pulled1 = await self.em._queue.get()
            pulled2 = await self.em._queue.get()
            self.assertEqual(pulled1, "j1")
            self.assertEqual(pulled2, "j2")

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
