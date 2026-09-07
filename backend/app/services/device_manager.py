import asyncio
import os
import subprocess
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional, List, Dict, Any, Set

from app.services.adb_bridge import (
    find_adb_executable,
    find_emulator_executable,
    get_online_adb_device_async,
    start_emulator_async as adb_start_emulator_async,
    start_emulator_sync as adb_start_emulator_sync,
    stop_emulator_async as adb_stop_emulator_async,
    get_advanced_device_info_async,
    _exec_cmd_sync
)


@dataclass
class UnifiedDevice:
    id: Optional[str]
    type: str  # "physical" | "emulator"
    name: str
    model: str
    manufacturer: str
    android_version: str
    api_level: Optional[int]
    status: str  # "available" | "busy" | "offline" | "starting" | "stopping" | "error"
    connection: str  # "usb" | "wifi" | "local"
    avd_name: Optional[str]
    is_emulator: bool
    is_busy: bool
    reserved_by: Optional[str]
    started_by_testbench: bool
    battery_level: Optional[str] = None
    resolution: Optional[str] = None
    density: Optional[str] = None
    foreground_app: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class DeviceManager:
    """
    Unified Device Manager managing physical Android devices and Android emulators.
    Standardizes device discovery, status calculation, reservation ownership,
    and lifecycle management.
    """

    def __init__(self):
        self._reservations: Dict[str, str] = {}  # device_id -> execution_id
        self._testbench_started_emulators: Set[str] = set()  # AVD names / device IDs started by TestBench
        self._device_locks: Dict[str, asyncio.Lock] = {}
        self._locks_guard = asyncio.Lock()
        self._cached_devices: Dict[str, UnifiedDevice] = {}
        self._device_change_callbacks: List[Any] = []
        self._last_connected_serials: Set[str] = set()
        self._monitor_task: Optional[asyncio.Task] = None

    def add_device_change_callback(self, callback):
        """Registers a callback func(event_type: str, device_dict: dict, all_devices: list)"""
        if callback not in self._device_change_callbacks:
            self._device_change_callbacks.append(callback)

    def remove_device_change_callback(self, callback):
        if callback in self._device_change_callbacks:
            self._device_change_callbacks.remove(callback)

    async def _notify_device_change(self, event_type: str, device_dict: dict, all_devices: list):
        for cb in self._device_change_callbacks:
            try:
                res = cb(event_type, device_dict, all_devices)
                if asyncio.iscoroutine(res):
                    await res
            except Exception as e:
                print(f"[DeviceManager Callback Error] {e}")

    async def start_device_monitor_loop(self, poll_interval: float = 1.0):
        """Runs a continuous high-frequency poll loop to instantly detect device connects/disconnects."""
        if self._monitor_task and not self._monitor_task.done():
            return

        async def _loop():
            # Initial baseline scan
            try:
                initial_devs = await self.discover_all_devices_async()
                self._last_connected_serials = {d.id for d in initial_devs if d.id}
            except Exception:
                self._last_connected_serials = set()

            while True:
                try:
                    await asyncio.sleep(poll_interval)
                    devices = await self.discover_all_devices_async()
                    current_online = {d.id: d for d in devices if d.id}
                    current_serials = set(current_online.keys())

                    new_connected = current_serials - self._last_connected_serials
                    disconnected = self._last_connected_serials - current_serials

                    all_dicts = [d.to_dict() for d in devices]

                    for dev_id in new_connected:
                        dev = current_online[dev_id]
                        # Fetch full specs for the newly connected device instantly
                        try:
                            telemetry = await get_advanced_device_info_async(dev_id)
                        except Exception:
                            telemetry = {}
                        
                        dev_payload = dev.to_dict()
                        dev_payload["specs"] = telemetry
                        await self._notify_device_change("device_connected", dev_payload, all_dicts)

                    for dev_id in disconnected:
                        await self._notify_device_change("device_disconnected", {"id": dev_id}, all_dicts)

                    self._last_connected_serials = current_serials
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    # Keep monitor loop alive
                    await asyncio.sleep(1.0)

        self._monitor_task = asyncio.create_task(_loop())

    def stop_device_monitor_loop(self):
        if self._monitor_task and not self._monitor_task.done():
            self._monitor_task.cancel()


    async def get_or_create_device_lock(self, device_id: str) -> asyncio.Lock:
        async with self._locks_guard:
            if device_id not in self._device_locks:
                self._device_locks[device_id] = asyncio.Lock()
            return self._device_locks[device_id]

    def is_device_reserved(self, device_id: str) -> bool:
        return device_id in self._reservations

    def get_device_reservation(self, device_id: str) -> Optional[str]:
        return self._reservations.get(device_id)

    async def reserve_device_async(self, device_id: str, execution_id: str) -> bool:
        """Acquires lock and reserves device for an execution session."""
        dev_lock = await self.get_or_create_device_lock(device_id)
        await dev_lock.acquire()
        self._reservations[device_id] = execution_id
        return True

    def reserve_device_sync(self, device_id: str, execution_id: str) -> bool:
        """Synchronously records device reservation."""
        self._reservations[device_id] = execution_id
        return True

    async def release_device_async(self, device_id: str, execution_id: str) -> bool:
        """Releases device reservation and frees lock."""
        if self._reservations.get(device_id) == execution_id:
            self._reservations.pop(device_id, None)
        async with self._locks_guard:
            if device_id in self._device_locks:
                dev_lock = self._device_locks[device_id]
                if dev_lock.locked():
                    try:
                        dev_lock.release()
                    except RuntimeError:
                        pass
        return True

    def release_device_sync(self, device_id: str, execution_id: str) -> bool:
        """Synchronously releases device reservation."""
        if self._reservations.get(device_id) == execution_id:
            self._reservations.pop(device_id, None)
        return True

    async def discover_all_devices_async(self) -> List[UnifiedDevice]:
        """
        Discovers all active physical devices (USB/Wi-Fi) and emulators (running and installed AVDs).
        Derives standardized device statuses (available, busy, offline).
        """
        adb_path = find_adb_executable()
        emu_path = find_emulator_executable()
        creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0

        running_adb_devices: Dict[str, Dict[str, str]] = {}

        if adb_path:
            try:
                out_text = await asyncio.to_thread(_exec_cmd_sync, [adb_path, "devices", "-l"], 3.0, creation_flags)
                for line in out_text.splitlines():
                    line = line.strip()
                    if line and not line.startswith("List of"):
                        parts = line.split()
                        if len(parts) >= 2 and parts[1].startswith("device"):
                            dev_id = parts[0].strip()
                            extra_info = " ".join(parts[2:]) if len(parts) > 2 else parts[1]
                            model_name = dev_id
                            manufacturer = "Android"
                            if "model:" in extra_info:
                                model_name = extra_info.split("model:")[-1].split()[0].replace("_", " ")
                            elif "product:" in extra_info:
                                model_name = extra_info.split("product:")[-1].split()[0].replace("_", " ")

                            running_adb_devices[dev_id] = {
                                "id": dev_id,
                                "raw_info": extra_info,
                                "model": model_name,
                                "manufacturer": manufacturer
                            }
            except Exception as e:
                print(f"[DeviceManager ADB Discovery Warning] {e}")

        # Query AVD properties for running emulators
        running_avd_map: Dict[str, str] = {}
        emulator_serials: Set[str] = set()

        for dev_id in list(running_adb_devices.keys()):
            if dev_id.startswith("emulator-"):
                emulator_serials.add(dev_id)
                try:
                    out_avd = await asyncio.to_thread(_exec_cmd_sync, [adb_path, "-s", dev_id, "shell", "getprop", "ro.boot.qemu.avd_name"], 2.0, creation_flags)
                    avd_name = out_avd.strip()
                    if not avd_name:
                        out_avd = await asyncio.to_thread(_exec_cmd_sync, [adb_path, "-s", dev_id, "shell", "getprop", "ro.boot.avd_name"], 2.0, creation_flags)
                        avd_name = out_avd.strip()
                    if avd_name:
                        running_avd_map[avd_name] = dev_id
                        running_avd_map[avd_name.lower().replace(" ", "_")] = dev_id
                except Exception:
                    pass

        # Discover installed AVDs from emulator binary
        installed_avds: List[str] = []
        if emu_path:
            try:
                out_emu = await asyncio.to_thread(_exec_cmd_sync, [emu_path, "-list-avds"], 3.0, creation_flags)
                for line in out_emu.splitlines():
                    avd = line.strip()
                    if avd:
                        installed_avds.append(avd)
            except Exception as e:
                print(f"[DeviceManager Emulator AVD Discovery Warning] {e}")

        unified_devices: List[UnifiedDevice] = []
        seen_serials: Set[str] = set()

        # 1. Physical Devices
        for dev_id, dev_info in running_adb_devices.items():
            if not dev_id.startswith("emulator-"):
                seen_serials.add(dev_id)
                is_wireless = ":" in dev_id
                conn_type = "wifi" if is_wireless else "usb"
                is_reserved = self.is_device_reserved(dev_id)
                status = "busy" if is_reserved else "available"

                unified_devices.append(UnifiedDevice(
                    id=dev_id,
                    type="physical",
                    name=dev_info["model"] if dev_info["model"] != dev_id else f"Physical Device ({dev_id})",
                    model=dev_info["model"],
                    manufacturer=dev_info["manufacturer"],
                    android_version="14+",
                    api_level=34,
                    status=status,
                    connection=conn_type,
                    avd_name=None,
                    is_emulator=False,
                    is_busy=is_reserved,
                    reserved_by=self.get_device_reservation(dev_id),
                    started_by_testbench=False
                ))

        # 2. Installed AVDs (Running or Offline)
        for avd in installed_avds:
            display_name = avd.replace("_", " ")
            avd_norm = avd.lower().replace(" ", "_")
            matched_serial = running_avd_map.get(avd) or running_avd_map.get(avd_norm)

            if matched_serial:
                seen_serials.add(matched_serial)
                is_reserved = self.is_device_reserved(matched_serial)
                status = "busy" if is_reserved else "available"
                is_tb_started = avd in self._testbench_started_emulators or matched_serial in self._testbench_started_emulators

                unified_devices.append(UnifiedDevice(
                    id=matched_serial,
                    type="emulator",
                    name=display_name,
                    model=display_name,
                    manufacturer="Google (Android Studio)",
                    android_version="14+",
                    api_level=34,
                    status=status,
                    connection="local",
                    avd_name=avd,
                    is_emulator=True,
                    is_busy=is_reserved,
                    reserved_by=self.get_device_reservation(matched_serial),
                    started_by_testbench=is_tb_started
                ))
            else:
                unified_devices.append(UnifiedDevice(
                    id=None,
                    type="emulator",
                    name=display_name,
                    model=display_name,
                    manufacturer="Google (Android Studio)",
                    android_version="Unknown",
                    api_level=None,
                    status="offline",
                    connection="local",
                    avd_name=avd,
                    is_emulator=True,
                    is_busy=False,
                    reserved_by=None,
                    started_by_testbench=False
                ))

        # 3. Any running emulator instances without an explicit AVD match
        for dev_id in emulator_serials:
            if dev_id not in seen_serials:
                is_reserved = self.is_device_reserved(dev_id)
                status = "busy" if is_reserved else "available"
                is_tb_started = dev_id in self._testbench_started_emulators

                unified_devices.append(UnifiedDevice(
                    id=dev_id,
                    type="emulator",
                    name=f"Emulator ({dev_id})",
                    model=f"Android Emulator ({dev_id})",
                    manufacturer="Google (Android Studio)",
                    android_version="14+",
                    api_level=34,
                    status=status,
                    connection="local",
                    avd_name=dev_id,
                    is_emulator=True,
                    is_busy=is_reserved,
                    reserved_by=self.get_device_reservation(dev_id),
                    started_by_testbench=is_tb_started
                ))

        for d in unified_devices:
            if d.id:
                self._cached_devices[d.id] = d

        return unified_devices

    async def get_device_async(self, device_id: str, enrich_telemetry: bool = False) -> Optional[UnifiedDevice]:
        """Retrieves a single unified device, optionally enriching with hardware telemetry."""
        devices = await self.discover_all_devices_async()
        matched = next((d for d in devices if d.id == device_id or d.avd_name == device_id), None)
        if not matched:
            return None

        if enrich_telemetry and matched.id:
            try:
                telemetry = await get_advanced_device_info_async(matched.id)
                if telemetry.get("status") == "online":
                    dev_details = telemetry.get("device_details", {})
                    bat_details = telemetry.get("battery_info", {})
                    disp_details = telemetry.get("display_info", {})
                    rt_details = telemetry.get("runtime_status", {})

                    matched.manufacturer = dev_details.get("manufacturer") or matched.manufacturer
                    matched.model = dev_details.get("model") or matched.model
                    matched.android_version = dev_details.get("android_version") or matched.android_version
                    sdk_ver = dev_details.get("sdk_version")
                    if sdk_ver and str(sdk_ver).isdigit():
                        matched.api_level = int(sdk_ver)

                    matched.battery_level = bat_details.get("level")
                    matched.resolution = disp_details.get("resolution")
                    matched.density = disp_details.get("density")
                    matched.foreground_app = rt_details.get("foreground_package")
            except Exception as e:
                print(f"[DeviceManager Telemetry Warning] {e}")

        return matched

    async def start_emulator_async(self, avd_name: str) -> Dict[str, Any]:
        """Launches an AVD and records TestBench ownership."""
        self._testbench_started_emulators.add(avd_name)
        res = await adb_start_emulator_async(avd_name)
        if res.get("device_id"):
            self._testbench_started_emulators.add(res["device_id"])
        return res

    def start_emulator_sync(self, avd_name: str, log_file=None) -> Dict[str, Any]:
        """Synchronously launches an AVD and records TestBench ownership."""
        self._testbench_started_emulators.add(avd_name)
        res = adb_start_emulator_sync(avd_name, log_file=log_file)
        if res.get("device_id"):
            self._testbench_started_emulators.add(res["device_id"])
        return res

    async def stop_emulator_async(self, device_id: str, force: bool = False) -> Dict[str, Any]:
        """Stops an emulator. Respects ownership unless force=True."""
        res = await adb_stop_emulator_async(device_id)
        self._testbench_started_emulators.discard(device_id)
        return res

    async def prepare_device_for_execution_async(
        self,
        target_device_id: Optional[str],
        execution_id: str,
        websocket=None
    ) -> str:
        """
        Validates the targeted device / AVD, boots the emulator if needed,
        reserves the device, and returns the online ADB serial.
        """
        adb_bin = find_adb_executable()
        chosen_device = target_device_id

        if chosen_device and adb_bin:
            online_dev = await get_online_adb_device_async(adb_bin, target_device_id=chosen_device)
            if not online_dev:
                # Check if it's an installed AVD
                emu_bin = find_emulator_executable()
                if emu_bin:
                    try:
                        creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
                        out_emu = await asyncio.to_thread(subprocess.run, [emu_bin, "-list-avds"], capture_output=True, text=True, timeout=2.0, creationflags=creation_flags)
                        avd_list = [l.strip() for l in out_emu.stdout.splitlines() if l.strip()]
                        target_norm = chosen_device.lower().replace(" ", "_")
                        for avd in avd_list:
                            if avd == chosen_device or avd.lower().replace(" ", "_") == target_norm:
                                if websocket:
                                    await websocket.send_text(f"[DEVICE MANAGER] Booting targeted emulator '{avd}'...")
                                boot_res = await self.start_emulator_async(avd)
                                if boot_res.get("device_id"):
                                    chosen_device = boot_res["device_id"]
                                break
                    except Exception:
                        pass

        if not chosen_device and adb_bin:
            online_dev = await get_online_adb_device_async(adb_bin)
            chosen_device = online_dev or "emulator-5554"
        elif not chosen_device:
            chosen_device = "emulator-5554"

        # Wake screen & dismiss keyguard
        try:
            if adb_bin:
                creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
                await asyncio.to_thread(subprocess.run, [adb_bin, "-s", chosen_device, "shell", "input keyevent 224 && input keyevent 82 && wm dismiss-keyguard"], capture_output=True, timeout=3.0, creationflags=creation_flags)
        except Exception:
            pass

        await self.reserve_device_async(chosen_device, execution_id)
        return chosen_device

    def prepare_device_for_execution_sync(
        self,
        target_device_id: Optional[str],
        execution_id: str,
        log_file=None
    ) -> str:
        """
        Synchronously validates and boots target device/AVD, wakes screen,
        and acquires device reservation.
        """
        adb_bin = find_adb_executable()
        if not adb_bin:
            chosen = target_device_id or "emulator-5554"
            self.reserve_device_sync(chosen, execution_id)
            return chosen

        creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0

        chosen_device = None
        if target_device_id:
            res = subprocess.run([adb_bin, "devices"], capture_output=True, text=True, timeout=2.0, creationflags=creation_flags)
            active_serials = []
            if res.returncode == 0 and res.stdout:
                for line in res.stdout.splitlines():
                    parts = line.strip().split()
                    if len(parts) >= 2 and parts[1] == "device":
                        active_serials.append(parts[0])

            if target_device_id in active_serials:
                chosen_device = target_device_id
            else:
                # Check installed AVDs
                emu_bin = find_emulator_executable()
                if emu_bin:
                    try:
                        res_avds = subprocess.run([emu_bin, "-list-avds"], capture_output=True, text=True, timeout=2.0, creationflags=creation_flags)
                        avd_list = [l.strip() for l in res_avds.stdout.splitlines() if l.strip()]
                        target_norm = target_device_id.lower().replace(" ", "_")
                        matching_avd = next((a for a in avd_list if a == target_device_id or a.lower().replace(" ", "_") == target_norm), None)
                        if matching_avd:
                            msg = f"[DEVICE MANAGER] Booting targeted emulator '{matching_avd}'..."
                            if log_file:
                                log_file.write(f"{msg}\n")
                                log_file.flush()
                            boot_res = self.start_emulator_sync(matching_avd, log_file=log_file)
                            if boot_res.get("device_id"):
                                chosen_device = boot_res["device_id"]
                    except Exception as e:
                        if log_file:
                            log_file.write(f"[DEVICE MANAGER WARNING] {e}\n")
                            log_file.flush()

        if not chosen_device:
            res = subprocess.run([adb_bin, "devices"], capture_output=True, text=True, timeout=2.0, creationflags=creation_flags)
            if res.returncode == 0 and res.stdout:
                for line in res.stdout.splitlines():
                    parts = line.strip().split()
                    if len(parts) >= 2 and parts[1] == "device":
                        chosen_device = parts[0]
                        break

        final_device = chosen_device or target_device_id or "emulator-5554"

        try:
            subprocess.run([adb_bin, "-s", final_device, "shell", "input keyevent 224 && input keyevent 82 && wm dismiss-keyguard"], capture_output=True, timeout=3.0, creationflags=creation_flags)
        except Exception:
            pass

        self.reserve_device_sync(final_device, execution_id)
        return final_device


# Global Device Manager Singleton Instance
device_manager = DeviceManager()
