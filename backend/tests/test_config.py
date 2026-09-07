import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

# Ensure backend root is on sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import (
    get_workspace_dir,
    get_logs_dir,
    get_db_path,
    find_adb,
    find_emulator,
    find_maven,
    find_node,
    find_npx,
    find_appium,
    find_ffmpeg,
    find_scrcpy_server_jar,
    get_diagnostics,
    BASE_DIR
)


class TestConfigAndDiscovery(unittest.TestCase):

    def test_default_workspace_resolution(self):
        """Test default workspace directory resolves to <repo_root>/workspace."""
        with patch.dict(os.environ, {}, clear=False):
            if "TESTBENCH_WORKSPACE" in os.environ:
                del os.environ["TESTBENCH_WORKSPACE"]
            ws = get_workspace_dir()
            expected = (BASE_DIR / "workspace").resolve()
            self.assertEqual(ws, expected)
            self.assertTrue(ws.exists())

    def test_workspace_override_via_env(self):
        """Test workspace directory override via TESTBENCH_WORKSPACE environment variable."""
        custom_path = (BASE_DIR / "backend" / "temp" / "custom_ws_test").resolve()
        with patch.dict(os.environ, {"TESTBENCH_WORKSPACE": str(custom_path)}):
            ws = get_workspace_dir()
            self.assertEqual(ws, custom_path)
            self.assertTrue(ws.exists())
            # Clean up test directory
            try:
                ws.rmdir()
            except Exception:
                pass

    def test_logs_dir_and_db_path(self):
        """Test logs directory and db path are located inside the workspace."""
        ws = get_workspace_dir()
        logs_dir = get_logs_dir()
        db_path = get_db_path()
        self.assertEqual(logs_dir, ws / "logs")
        self.assertEqual(db_path, ws / "testbench.db")
        self.assertTrue(logs_dir.exists())

    def test_explicit_adb_command_override(self):
        """Test ADB_COMMAND override."""
        with patch.dict(os.environ, {"ADB_COMMAND": "custom_adb_binary"}):
            with patch("shutil.which", return_value="/usr/local/bin/custom_adb_binary"):
                result = find_adb()
                self.assertEqual(result, "/usr/local/bin/custom_adb_binary")

    def test_android_home_adb_discovery(self):
        """Test ADB discovery via ANDROID_HOME / ANDROID_SDK_ROOT."""
        fake_sdk = (BASE_DIR / "backend" / "temp" / "fake_sdk").resolve()
        platform_tools = fake_sdk / "platform-tools"
        platform_tools.mkdir(parents=True, exist_ok=True)
        adb_binary = platform_tools / ("adb.exe" if os.name == 'nt' else "adb")
        adb_binary.write_text("fake adb binary", encoding="utf-8")

        try:
            with patch.dict(os.environ, {"ANDROID_HOME": str(fake_sdk), "ADB_COMMAND": ""}):
                with patch("shutil.which", return_value=None):
                    result = find_adb(force_refresh=True)
                    self.assertIsNotNone(result)
                    self.assertEqual(Path(result).resolve(), adb_binary.resolve())
        finally:
            try:
                adb_binary.unlink()
                platform_tools.rmdir()
                fake_sdk.rmdir()
            except Exception:
                pass

    def test_missing_adb_fallback(self):
        """Test find_adb returns None when executable is not found anywhere."""
        with patch.dict(os.environ, {}, clear=True):
            with patch("shutil.which", return_value=None):
                with patch("pathlib.Path.exists", return_value=False):
                    result = find_adb(force_refresh=True)
                    self.assertIsNone(result)

    def test_explicit_emulator_override(self):
        """Test EMULATOR_COMMAND override."""
        with patch.dict(os.environ, {"EMULATOR_COMMAND": "custom_emu"}):
            with patch("shutil.which", return_value="/bin/custom_emu"):
                result = find_emulator()
                self.assertEqual(result, "/bin/custom_emu")

    def test_explicit_maven_override(self):
        """Test MAVEN_COMMAND override."""
        with patch.dict(os.environ, {"MAVEN_COMMAND": "custom_mvn"}):
            with patch("shutil.which", return_value="/bin/custom_mvn"):
                result = find_maven()
                self.assertEqual(result, "/bin/custom_mvn")

    def test_node_and_npx_discovery(self):
        """Test NODE_COMMAND and NPX_COMMAND overrides."""
        with patch.dict(os.environ, {"NODE_COMMAND": "/custom/node", "NPX_COMMAND": "/custom/npx"}):
            with patch("shutil.which", side_effect=lambda x: f"/bin/{x}"):
                self.assertEqual(find_node(), "/custom/node")
                self.assertEqual(find_npx(), "/custom/npx")

    def test_appium_discovery_fallback(self):
        """Test find_appium detection via npx."""
        with patch.dict(os.environ, {}, clear=False):
            if "APPIUM_COMMAND" in os.environ:
                del os.environ["APPIUM_COMMAND"]
            with patch("shutil.which", side_effect=lambda name: "/usr/bin/npx" if "npx" in name else None):
                avail, cmd, detail = find_appium()
                self.assertTrue(avail)
                self.assertIn("npx", cmd)

    def test_ffmpeg_discovery(self):
        """Test FFMPEG_COMMAND override."""
        with patch.dict(os.environ, {"FFMPEG_COMMAND": "/opt/ffmpeg"}):
            with patch("shutil.which", return_value="/opt/ffmpeg"):
                result = find_ffmpeg()
                self.assertEqual(result, "/opt/ffmpeg")

    def test_diagnostics_structure(self):
        """Test get_diagnostics returns all expected keys and dep types."""
        diag = get_diagnostics()
        self.assertIn("status", diag)
        self.assertIn("workspace", diag)
        self.assertIn("dependencies", diag)
        self.assertTrue(isinstance(diag["dependencies"], list))

        dep_names = [d["name"] for d in diag["dependencies"]]
        expected_names = ["Python", "ADB", "Android SDK", "Android Emulator", "Maven", "Node.js", "npx", "Appium", "FFmpeg", "scrcpy-server"]
        for expected in expected_names:
            self.assertIn(expected, dep_names)


if __name__ == "__main__":
    unittest.main()
