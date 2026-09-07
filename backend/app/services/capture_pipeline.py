import asyncio
import os
import shutil
import socket
import struct
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Dict, Set, List, Callable, Any
from fastapi import WebSocket, WebSocketDisconnect

from app.config import (
    find_adb,
    find_ffmpeg,
    find_scrcpy_server_jar,
    get_logs_dir
)


# Scrcpy protocol flags
FLAG_CONFIG = 1 << 63
FLAG_KEY_FRAME = 1 << 62


@dataclass
class H264Packet:
    pts: int
    is_config: bool
    is_key_frame: bool
    data: bytes


class RecordingSink:
    """
    Consumer that tees H.264 packets directly into FFmpeg stdin to mux into an MP4 file.
    Uses stream copy (-c:v copy) to achieve zero CPU transcoding overhead.
    """

    def __init__(self, execution_id: str, output_path: Path, ffmpeg_bin: str):
        self.execution_id = execution_id
        self.output_path = output_path
        self.ffmpeg_bin = ffmpeg_bin
        self.process: Optional[asyncio.subprocess.Process] = None
        self._is_active = False
        self._bytes_written = 0
        self._lock = asyncio.Lock()

    async def start(self, initial_config_packet: Optional[H264Packet] = None):
        """Spawns FFmpeg subprocess for container muxing."""
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0

        ffmpeg_cmd = [
            self.ffmpeg_bin,
            "-y",
            "-f", "h264",
            "-probesize", "32",
            "-analyzeduration", "0",
            "-i", "pipe:0",
            "-c:v", "copy",
            "-movflags", "+faststart",
            str(self.output_path)
        ]

        self.process = await asyncio.create_subprocess_exec(
            *ffmpeg_cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
            creationflags=creation_flags
        )
        self._is_active = True

        if initial_config_packet and initial_config_packet.data:
            await self.write_packet(initial_config_packet)

    async def write_packet(self, packet: H264Packet):
        """Pushes raw H.264 NAL bytes into FFmpeg stdin."""
        if not self._is_active or not self.process or not self.process.stdin:
            return

        async with self._lock:
            try:
                if not self.process.stdin.is_closing():
                    self.process.stdin.write(packet.data)
                    await self.process.stdin.drain()
                    self._bytes_written += len(packet.data)
            except Exception:
                self._is_active = False

    async def stop(self) -> Optional[str]:
        """Finalizes FFmpeg recording, closes stdin, and ensures the MP4 file is written cleanly."""
        self._is_active = False
        if self.process:
            async with self._lock:
                try:
                    if self.process.stdin and not self.process.stdin.is_closing():
                        self.process.stdin.close()
                        await self.process.stdin.wait_closed()
                except Exception:
                    pass

            try:
                await asyncio.wait_for(self.process.wait(), timeout=5.0)
            except (asyncio.TimeoutError, Exception):
                try:
                    self.process.terminate()
                    await asyncio.sleep(0.3)
                    if self.process.returncode is None:
                        self.process.kill()
                except Exception:
                    pass

        if self.output_path.exists() and self.output_path.stat().st_size > 0:
            return str(self.output_path)
        return None


class DeviceCapturePipeline:
    """
    Manages a single hardware capture process (scrcpy-server or adb screenrecord) for one device.
    Broadcasts the exact same H.264 byte stream simultaneously to:
    1. Active live WebSocket clients (browser view)
    2. Active recording sinks (disk MP4 files)
    """

    def __init__(self, device_id: str):
        self.device_id = device_id
        self._is_running = False
        self._capture_task: Optional[asyncio.Task] = None
        self._scrcpy_proc: Optional[asyncio.subprocess.Process] = None
        self._local_port: Optional[int] = None
        self._socket_name: Optional[str] = None
        self._client_reader: Optional[asyncio.StreamReader] = None
        self._client_writer: Optional[asyncio.StreamWriter] = None

        self._recording_sinks: Dict[str, RecordingSink] = {}
        self._live_queues: Set[asyncio.Queue] = set()
        self._last_config_packet: Optional[H264Packet] = None
        self._video_width: int = 1080
        self._video_height: int = 2400
        self._lock = asyncio.Lock()

    @property
    def is_running(self) -> bool:
        return self._is_running

    @property
    def has_consumers(self) -> bool:
        return bool(self._recording_sinks or self._live_queues)

    def find_free_port(self) -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]

    async def _push_scrcpy_server_if_needed(self, adb_path: str) -> bool:
        jar_path = find_scrcpy_server_jar()
        if not jar_path or not Path(jar_path).exists():
            return False

        creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        try:
            proc = await asyncio.create_subprocess_exec(
                adb_path, "-s", self.device_id, "push", str(jar_path), "/data/local/tmp/scrcpy-server.jar",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                creationflags=creation_flags
            )
            await proc.wait()
            return proc.returncode == 0
        except Exception:
            return False

    async def start(self, fps: int = 30):
        """Starts the capture pipeline if not already running."""
        async with self._lock:
            if self._is_running:
                return

            self._is_running = True
            self._capture_task = asyncio.create_task(self._capture_loop(fps=fps))

    async def _capture_loop(self, fps: int = 30):
        """Main capture loop: spawns scrcpy-server, connects to socket, and demuxes H.264 packets."""
        adb_path = find_adb()
        if not adb_path:
            self._is_running = False
            return

        pushed = await self._push_scrcpy_server_if_needed(adb_path)
        if not pushed:
            self._is_running = False
            return

        creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        self._local_port = self.find_free_port()
        scid = f"{self._local_port:08x}"
        self._socket_name = f"scrcpy_{scid}"

        # 1. Forward local socket to device abstract socket
        proc_fwd = await asyncio.create_subprocess_exec(
            adb_path, "-s", self.device_id, "forward", f"tcp:{self._local_port}", f"localabstract:{self._socket_name}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            creationflags=creation_flags
        )
        await proc_fwd.wait()

        # 2. Spawn scrcpy-server on device
        scrcpy_cmd = [
            adb_path, "-s", self.device_id, "shell",
            f"CLASSPATH=/data/local/tmp/scrcpy-server.jar app_process / com.genymobile.scrcpy.Server 2.4 "
            f"scid={scid} tunnel_forward=true max_fps={fps} video_bit_rate=4000000 "
            f"control=false audio=false cleanup=false send_device_meta=false"
        ]

        self._scrcpy_proc = await asyncio.create_subprocess_exec(
            *scrcpy_cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
            creationflags=creation_flags
        )

        # 3. Connect to forward socket (wait for scrcpy-server to bind and send dummy byte)
        connected = False
        for _ in range(30):
            if not self._is_running:
                break
            await asyncio.sleep(0.15)
            try:
                reader, writer = await asyncio.open_connection("127.0.0.1", self._local_port)
                try:
                    dummy = await asyncio.wait_for(reader.read(1), timeout=0.8)
                    if dummy:
                        self._client_reader = reader
                        self._client_writer = writer
                        connected = True
                        break
                    else:
                        try:
                            writer.close()
                            await writer.wait_closed()
                        except Exception:
                            pass
                except (asyncio.TimeoutError, Exception):
                    try:
                        writer.close()
                        await writer.wait_closed()
                    except Exception:
                        pass
            except Exception:
                pass

        if not connected or not self._client_reader:
            await self.stop()
            return

        try:
            # Read 12-byte video metadata header (4-byte codec, 4-byte width, 4-byte height)
            codec_hdr = await self._client_reader.read(12)
            if len(codec_hdr) == 12:
                self._video_width = int.from_bytes(codec_hdr[4:8], byteorder="big")
                self._video_height = int.from_bytes(codec_hdr[8:12], byteorder="big")

            # Continuously read H.264 packets
            while self._is_running:
                header = await self._client_reader.readexactly(12)
                raw_pts = int.from_bytes(header[0:8], byteorder="big")
                packet_size = int.from_bytes(header[8:12], byteorder="big")

                is_config = bool(raw_pts & FLAG_CONFIG)
                is_key = bool(raw_pts & FLAG_KEY_FRAME)
                pts = raw_pts & 0x3FFFFFFFFFFFFFFF

                if packet_size > 0:
                    packet_data = await self._client_reader.readexactly(packet_size)
                    packet = H264Packet(
                        pts=pts,
                        is_config=is_config,
                        is_key_frame=is_key,
                        data=packet_data
                    )

                    if is_config:
                        self._last_config_packet = packet

                    # Dispatch to all consumers (teeing)
                    await self._dispatch_packet(packet)

        except (asyncio.IncompleteReadError, ConnectionResetError, asyncio.CancelledError):
            pass
        except Exception as e:
            print(f"[CAPTURE PIPELINE ERROR] {self.device_id}: {e}")
        finally:
            await self.stop()

    async def _dispatch_packet(self, packet: H264Packet):
        """Dispatches packet to all active recording sinks and live view queues."""
        # 1. Dispatch to all active recording sinks
        for sink in list(self._recording_sinks.values()):
            try:
                await sink.write_packet(packet)
            except Exception:
                pass

        # 2. Dispatch to all active live WebSocket queues
        for q in list(self._live_queues):
            try:
                # If queue is backed up, drop old frames to prioritize low latency (skip if keyframe)
                if q.qsize() > 20 and not packet.is_key_frame and not packet.is_config:
                    continue
                q.put_nowait(packet)
            except Exception:
                pass

    async def attach_recording(self, execution_id: str, output_path: Path) -> RecordingSink:
        """Attaches a recording sink for an execution run."""
        ffmpeg_bin = find_ffmpeg()
        if not ffmpeg_bin:
            raise RuntimeError("FFmpeg executable not found. Cannot start recording sink.")

        sink = RecordingSink(execution_id, output_path, ffmpeg_bin)
        await sink.start(initial_config_packet=self._last_config_packet)
        self._recording_sinks[execution_id] = sink
        return sink

    async def detach_recording(self, execution_id: str) -> Optional[str]:
        """Detaches and finalizes a recording sink."""
        sink = self._recording_sinks.pop(execution_id, None)
        if sink:
            return await sink.stop()
        return None

    def create_live_queue(self) -> tuple[asyncio.Queue, Optional[H264Packet], int, int]:
        """Registers a live view consumer queue and returns initial config packet and resolution."""
        q = asyncio.Queue(maxsize=60)
        self._live_queues.add(q)
        return q, self._last_config_packet, self._video_width, self._video_height

    def remove_live_queue(self, q: asyncio.Queue):
        """Unregisters a live view consumer queue."""
        self._live_queues.discard(q)

    async def stop(self):
        """Cleanly stops the capture pipeline and cleans up all processes and ADB forwards."""
        self._is_running = False

        if self._client_writer:
            try:
                self._client_writer.close()
                await self._client_writer.wait_closed()
            except Exception:
                pass
            self._client_writer = None
            self._client_reader = None

        if self._scrcpy_proc:
            try:
                self._scrcpy_proc.terminate()
                await asyncio.sleep(0.1)
                if self._scrcpy_proc.returncode is None:
                    self._scrcpy_proc.kill()
            except Exception:
                pass
            self._scrcpy_proc = None

        if self._capture_task and not self._capture_task.done():
            self._capture_task.cancel()

        # Stop any remaining recording sinks
        for exec_id in list(self._recording_sinks.keys()):
            await self.detach_recording(exec_id)

        # Remove ADB port forward
        if self._local_port and self.device_id:
            adb_path = find_adb()
            if adb_path:
                try:
                    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
                    p_rm = await asyncio.create_subprocess_exec(
                        adb_path, "-s", self.device_id, "forward", "--remove", f"tcp:{self._local_port}",
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.DEVNULL,
                        creationflags=creation_flags
                    )
                    await p_rm.wait()
                except Exception:
                    pass
            self._local_port = None


class CapturePipelineManager:
    """
    Singleton manager for device capture pipelines.
    Guarantees exactly ONE capture pipeline per physical device or emulator.
    Provides isolated concurrency across multiple devices.
    """

    def __init__(self):
        self._pipelines: Dict[str, DeviceCapturePipeline] = {}
        self._lock = asyncio.Lock()

    async def get_or_create_pipeline(self, device_id: str, fps: int = 30) -> DeviceCapturePipeline:
        """Retrieves an existing capture pipeline or starts a new one for the device."""
        async with self._lock:
            if device_id in self._pipelines:
                pipeline = self._pipelines[device_id]
                if pipeline.is_running:
                    return pipeline

            pipeline = DeviceCapturePipeline(device_id)
            self._pipelines[device_id] = pipeline
            await pipeline.start(fps=fps)
            return pipeline

    async def start_recording(self, device_id: str, execution_id: str, output_path: Optional[Path] = None) -> Optional[RecordingSink]:
        """Starts recording the device capture stream for a test execution."""
        if not output_path:
            recordings_dir = get_logs_dir() / "recordings"
            recordings_dir.mkdir(parents=True, exist_ok=True)
            output_path = recordings_dir / f"{execution_id}.mp4"

        pipeline = await self.get_or_create_pipeline(device_id)
        try:
            return await pipeline.attach_recording(execution_id, output_path)
        except Exception as e:
            print(f"[RECORDING ATTACH ERROR] {device_id} - {execution_id}: {e}")
            return None

    async def stop_recording(self, device_id: str, execution_id: str) -> Optional[str]:
        """Stops recording and returns the path to the completed MP4 video file."""
        pipeline = self._pipelines.get(device_id)
        if pipeline:
            result_path = await pipeline.detach_recording(execution_id)
            return result_path
        return None

    async def stream_live_view(self, websocket: WebSocket, device_id: str):
        """
        Streams binary H.264 packets directly to the frontend WebSocket for hardware WebCodecs decoding.
        Transmits stream metadata, cached SPS/PPS parameters, and real-time NAL chunks.
        """
        pipeline = await self.get_or_create_pipeline(device_id)
        queue, initial_config, width, height = pipeline.create_live_queue()

        try:
            # 1. Send metadata handshake (JSON text)
            await websocket.send_json({
                "type": "stream_meta",
                "codec": "h264",
                "width": width,
                "height": height
            })

            # 2. If cached SPS/PPS exists, send it immediately as binary frame
            if initial_config and initial_config.data:
                await websocket.send_bytes(initial_config.data)

            # 3. Stream real-time H.264 packets
            while True:
                packet: H264Packet = await queue.get()
                if packet.data:
                    await websocket.send_bytes(packet.data)

        except (WebSocketDisconnect, ConnectionResetError):
            pass
        finally:
            pipeline.remove_live_queue(queue)

    async def stop_pipeline(self, device_id: str):
        """Stops and cleans up the pipeline for a specific device."""
        async with self._lock:
            pipeline = self._pipelines.pop(device_id, None)
            if pipeline:
                await pipeline.stop()

    async def stop_all(self):
        """Stops all active pipelines (for server shutdown)."""
        async with self._lock:
            for dev_id, pipeline in list(self._pipelines.items()):
                await pipeline.stop()
            self._pipelines.clear()


# Global Capture Pipeline Manager
capture_pipeline_manager = CapturePipelineManager()
