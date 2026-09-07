import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.runner import (
    allocate_appium_port,
    release_appium_port,
    allocate_system_port,
    release_system_port,
    resolve_test_args,
    is_appium_ready
)


class TestRunnerContract(unittest.TestCase):

    def test_port_allocation_and_release(self):
        """Test Appium and system port allocation and release."""
        port1 = allocate_appium_port(4723)
        port2 = allocate_appium_port(4723)
        self.assertNotEqual(port1, port2)

        sys_port1 = allocate_system_port(8200)
        sys_port2 = allocate_system_port(8200)
        self.assertNotEqual(sys_port1, sys_port2)

        release_appium_port(port1)
        release_appium_port(port2)
        release_system_port(sys_port1)
        release_system_port(sys_port2)

    def test_resolve_test_args_contract(self):
        """Test that resolve_test_args generates correct CLI properties and environment variables."""
        dummy_project = BACKEND_DIR.parent / "workspace" / "chekup_automation-Bhargav" / "chekup_automation-Bhargav"
        
        executable, args, env_vars, framework = resolve_test_args(
            str(dummy_project),
            test_file="LoginValidationTest.java",
            device_id="172.18.2.51:43431",
            appium_port=4725,
            system_port=8204,
            execution_id="test-exec-123"
        )

        self.assertEqual(framework, "maven")
        # Check CLI arguments
        self.assertIn("-DappiumServerUrl=http://127.0.0.1:4725", args)
        self.assertIn("-DdeviceUdid=172.18.2.51:43431", args)
        self.assertIn("-DsystemPort=8204", args)
        self.assertIn("-Dtest=LoginValidationTest", args)

        # Check environment variables contract
        self.assertEqual(env_vars["APPIUM_URL"], "http://127.0.0.1:4725")
        self.assertEqual(env_vars["DEVICE_UDID"], "172.18.2.51:43431")
        self.assertEqual(env_vars["SYSTEM_PORT"], "8204")
        self.assertEqual(env_vars["TESTBENCH_EXECUTION_ID"], "test-exec-123")


if __name__ == "__main__":
    unittest.main()
