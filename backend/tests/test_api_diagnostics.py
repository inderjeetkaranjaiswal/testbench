import asyncio
import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import health_check, system_diagnostics_endpoint


class TestApiDiagnostics(unittest.TestCase):

    def test_health_endpoint(self):
        result = asyncio.run(health_check())
        self.assertEqual(result.status, "online")
        self.assertTrue(len(result.workspace_path) > 0)
        self.assertTrue(isinstance(result.active_projects, int))

    def test_diagnostics_endpoint(self):
        result = asyncio.run(system_diagnostics_endpoint())
        self.assertIn("status", result)
        self.assertIn("workspace", result)
        self.assertIn("dependencies", result)
        self.assertTrue(len(result["dependencies"]) > 0)


if __name__ == "__main__":
    unittest.main()
