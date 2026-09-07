import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path

from app.services.adb_bridge import (
    find_emulator_executable,
    start_emulator_sync,
    stop_emulator_async,
)
from app.services.runner import (
    resolve_and_prepare_device_sync,
    ensure_apk_installed_sync,
)


class TestEmulatorLifecycle(unittest.TestCase):

    def test_find_emulator_executable(self):
        emu = find_emulator_executable()
        self.assertIsNotNone(emu)
        self.assertTrue(Path(emu).exists())

    @patch("subprocess.run")
    def test_resolve_and_prepare_device_sync_existing_device(self, mock_run):
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = "List of devices attached\nemulator-5556\tdevice\n"
        mock_run.return_value = mock_proc

        resolved = resolve_and_prepare_device_sync("emulator-5556")
        self.assertEqual(resolved, "emulator-5556")

    @patch("subprocess.run")
    def test_resolve_and_prepare_device_sync_fallback_online(self, mock_run):
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.stdout = "List of devices attached\nemulator-5554\tdevice\n"
        mock_run.return_value = mock_proc

        resolved = resolve_and_prepare_device_sync(None)
        self.assertEqual(resolved, "emulator-5554")


if __name__ == "__main__":
    unittest.main()
