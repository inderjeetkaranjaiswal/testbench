import unittest
from unittest.mock import patch, MagicMock, AsyncMock
import asyncio
import tempfile
from pathlib import Path

from app.services.capture_pipeline import (
    H264Packet,
    RecordingSink,
    DeviceCapturePipeline,
    CapturePipelineManager,
    capture_pipeline_manager,
    FLAG_CONFIG,
    FLAG_KEY_FRAME
)


class TestCapturePipeline(unittest.TestCase):

    def test_h264_packet_dataclass(self):
        pkt = H264Packet(pts=1000, is_config=True, is_key_frame=True, data=b"\x00\x00\x00\x01\x67\x42")
        self.assertEqual(pkt.pts, 1000)
        self.assertTrue(pkt.is_config)
        self.assertTrue(pkt.is_key_frame)
        self.assertEqual(len(pkt.data), 6)

    def test_recording_sink_lifecycle_and_muxing(self):
        async def run():
            with tempfile.TemporaryDirectory() as tmpdir:
                out_file = Path(tmpdir) / "test_rec.mp4"
                ffmpeg_bin = "ffmpeg"

                sink = RecordingSink("exec_001", out_file, ffmpeg_bin)

                mock_proc = AsyncMock()
                mock_proc.stdin = AsyncMock()
                mock_proc.stdin.is_closing = MagicMock(return_value=False)
                mock_proc.wait = AsyncMock(return_value=0)

                with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
                    await sink.start()
                    self.assertTrue(sink._is_active)

                    # Tee test packet
                    test_pkt = H264Packet(pts=2000, is_config=False, is_key_frame=True, data=b"\x00\x00\x00\x01\x65\x88")
                    await sink.write_packet(test_pkt)
                    mock_proc.stdin.write.assert_called_with(test_pkt.data)

                    # Finalize
                    # Touch file so stat check succeeds
                    out_file.write_bytes(b"dummy mp4 data")
                    result_path = await sink.stop()
                    self.assertEqual(result_path, str(out_file))
                    mock_proc.stdin.close.assert_called()

        asyncio.run(run())

    def test_single_capture_multiple_consumers_broadcasting(self):
        """
        Verifies that a single packet produced by DeviceCapturePipeline
        is simultaneously teed to both a recording sink and a live view consumer queue.
        """
        async def run():
            pipeline = DeviceCapturePipeline("emulator-5554")
            pipeline._video_width = 1080
            pipeline._video_height = 2400

            # 1. Attach live queue consumer
            live_queue, _, _, _ = pipeline.create_live_queue()

            # 2. Attach mock recording sink
            mock_sink = AsyncMock()
            pipeline._recording_sinks["exec_test"] = mock_sink

            # 3. Dispatch a test packet
            sample_data = b"\x00\x00\x00\x01\x65\xAA\xBB\xCC"
            pkt = H264Packet(pts=5000, is_config=False, is_key_frame=True, data=sample_data)
            await pipeline._dispatch_packet(pkt)

            # Assert recording sink received exact packet
            mock_sink.write_packet.assert_called_once_with(pkt)

            # Assert live queue received exact packet
            live_pkt = await live_queue.get()
            self.assertEqual(live_pkt.data, sample_data)
            self.assertEqual(live_pkt.pts, 5000)

            # Cleanup
            pipeline.remove_live_queue(live_queue)

        asyncio.run(run())

    def test_concurrent_device_isolation(self):
        """
        Verifies that pipelines for different device serials are completely isolated.
        """
        async def run():
            mgr = CapturePipelineManager()

            with patch.object(DeviceCapturePipeline, "start", new_callable=AsyncMock):
                pipe1 = await mgr.get_or_create_pipeline("emulator-5554")
                pipe2 = await mgr.get_or_create_pipeline("emulator-5556")

                self.assertIsNot(pipe1, pipe2)
                self.assertEqual(pipe1.device_id, "emulator-5554")
                self.assertEqual(pipe2.device_id, "emulator-5556")
                self.assertEqual(len(mgr._pipelines), 2)

                await mgr.stop_pipeline("emulator-5554")
                self.assertNotIn("emulator-5554", mgr._pipelines)
                self.assertIn("emulator-5556", mgr._pipelines)

                await mgr.stop_all()
                self.assertEqual(len(mgr._pipelines), 0)

        asyncio.run(run())

    def test_clean_pipeline_shutdown(self):
        """
        Verifies that stopping a pipeline cleans up subprocesses, writers, and ADB port forward.
        """
        async def run():
            pipeline = DeviceCapturePipeline("emulator-5554")
            pipeline._is_running = True
            pipeline._local_port = 27182

            mock_proc = AsyncMock()
            mock_proc.returncode = None
            mock_proc.terminate = MagicMock()
            mock_proc.kill = MagicMock()
            pipeline._scrcpy_proc = mock_proc

            mock_writer = AsyncMock()
            pipeline._client_writer = mock_writer

            with patch("app.services.capture_pipeline.find_adb", return_value="adb"):
                with patch("asyncio.create_subprocess_exec", return_value=AsyncMock()) as mock_sub:
                    await pipeline.stop()

                    self.assertFalse(pipeline.is_running)
                    mock_proc.terminate.assert_called()
                    mock_writer.close.assert_called()
                    self.assertIsNone(pipeline._local_port)

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
