import unittest
from unittest.mock import patch, MagicMock
import asyncio

from app.services.device_manager import UnifiedDevice, DeviceManager


class TestDeviceManager(unittest.TestCase):

    def setUp(self):
        self.dm = DeviceManager()

    def test_unified_device_model_serialization(self):
        device = UnifiedDevice(
            id="emulator-5556",
            type="emulator",
            name="Pixel 6a",
            model="Pixel 6a",
            manufacturer="Google",
            android_version="14",
            api_level=34,
            status="available",
            connection="local",
            avd_name="testbench_pixel_6a",
            is_emulator=True,
            is_busy=False,
            reserved_by=None,
            started_by_testbench=True,
            battery_level="100%",
            resolution="1080x2400",
            density="420 dpi"
        )
        d_dict = device.to_dict()
        self.assertEqual(d_dict["id"], "emulator-5556")
        self.assertEqual(d_dict["type"], "emulator")
        self.assertEqual(d_dict["status"], "available")
        self.assertTrue(d_dict["is_emulator"])
        self.assertFalse(d_dict["is_busy"])
        self.assertTrue(d_dict["started_by_testbench"])

    def test_reservation_lifecycle_sync(self):
        dev_id = "test-device-001"
        exec_id = "exec-test-123"

        self.assertFalse(self.dm.is_device_reserved(dev_id))
        self.assertIsNone(self.dm.get_device_reservation(dev_id))

        self.dm.reserve_device_sync(dev_id, exec_id)
        self.assertTrue(self.dm.is_device_reserved(dev_id))
        self.assertEqual(self.dm.get_device_reservation(dev_id), exec_id)

        self.dm.release_device_sync(dev_id, exec_id)
        self.assertFalse(self.dm.is_device_reserved(dev_id))
        self.assertIsNone(self.dm.get_device_reservation(dev_id))

    def test_reservation_lifecycle_async(self):
        dev_id = "test-device-async"
        exec_id = "exec-test-456"

        async def run_test():
            self.assertFalse(self.dm.is_device_reserved(dev_id))
            await self.dm.reserve_device_async(dev_id, exec_id)
            self.assertTrue(self.dm.is_device_reserved(dev_id))
            self.assertEqual(self.dm.get_device_reservation(dev_id), exec_id)
            await self.dm.release_device_async(dev_id, exec_id)
            self.assertFalse(self.dm.is_device_reserved(dev_id))

        asyncio.run(run_test())

    def test_emulator_ownership_tracking(self):
        avd_name = "testbench_pixel_test"
        self.assertNotIn(avd_name, self.dm._testbench_started_emulators)

        with patch("app.services.device_manager.adb_start_emulator_sync") as mock_start:
            mock_start.return_value = {"status": "success", "device_id": "emulator-5590"}
            res = self.dm.start_emulator_sync(avd_name)
            self.assertIn(avd_name, self.dm._testbench_started_emulators)
            self.assertIn("emulator-5590", self.dm._testbench_started_emulators)

    @patch("app.services.device_manager.find_adb_executable", return_value="adb")
    @patch("app.services.device_manager.find_emulator_executable", return_value="emulator")
    @patch("app.services.device_manager._exec_cmd_sync")
    def test_discover_all_devices(self, mock_cmd, mock_emu, mock_adb):
        def cmd_side_effect(cmd, timeout, flags):
            if "devices" in cmd:
                return "List of devices attached\n172.18.2.51:43431\tdevice product:RMX3868 model:RMX3868\nemulator-5556\tdevice product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64\n"
            elif "-list-avds" in cmd:
                return "testbench_pixel_6a\ntestbench_pixel\n"
            elif "ro.boot.qemu.avd_name" in cmd:
                return "testbench_pixel_6a\n"
            return ""

        mock_cmd.side_effect = cmd_side_effect

        devices = asyncio.run(self.dm.discover_all_devices_async())
        self.assertGreaterEqual(len(devices), 3)

        physical = next((d for d in devices if d.id == "172.18.2.51:43431"), None)
        self.assertIsNotNone(physical)
        self.assertEqual(physical.type, "physical")
        self.assertEqual(physical.connection, "wifi")
        self.assertEqual(physical.status, "available")

        running_emu = next((d for d in devices if d.id == "emulator-5556"), None)
        self.assertIsNotNone(running_emu)
        self.assertEqual(running_emu.type, "emulator")
        self.assertEqual(running_emu.avd_name, "testbench_pixel_6a")
        self.assertEqual(running_emu.status, "available")

        offline_emu = next((d for d in devices if d.avd_name == "testbench_pixel" and d.id is None), None)
        self.assertIsNotNone(offline_emu)
        self.assertEqual(offline_emu.type, "emulator")
        self.assertEqual(offline_emu.status, "offline")


if __name__ == "__main__":
    unittest.main()
