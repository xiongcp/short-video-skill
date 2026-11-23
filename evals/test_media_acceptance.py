"""用实际封装、可解码的本地校准片验证交付技术检查。"""
import json
import hashlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


CHECK = Path(__file__).with_name("check_design.py")


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", *args],
                   check=True, capture_output=True, text=True)


def make_clip(folder, name, seconds, *, size="1920x1080", pixel_format="yuv420p",
              rate=48000, audio_seconds=None, jitter=False):
    """循环一秒校准画面，另编码连续的音轨。输出严格局限于传入的临时目录。"""
    seed = folder / f"seed-{size}-{pixel_format}-{int(jitter)}.mp4"
    if not seed.exists():
        filters = ["-vf", "settb=1/3000,setpts='PTS+if(eq(N,15),50,0)'"] if jitter else []
        ffmpeg("-f", "lavfi", "-i", f"color=c=navy:s={size}:r=30:d=1", *filters,
               "-fps_mode", "passthrough", "-enc_time_base", "1:3000", "-video_track_timescale", "3000",
               "-c:v", "libx264", "-threads", "1", "-preset", "ultrafast", "-bf", "0",
               "-g", "30", "-pix_fmt", pixel_format, str(seed))
    path = folder / f"{name}.mp4"
    audio = []
    if rate:
        length = seconds if audio_seconds is None else audio_seconds
        audio = ["-f", "lavfi", "-i", f"sine=frequency=440:sample_rate={rate}:duration={length}",
                 "-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-b:a", "48k"]
    ffmpeg("-stream_loop", str(seconds - 1), "-i", str(seed), *audio,
           "-c:v", "copy", "-t", str(seconds), "-movflags", "+faststart", str(path))
    return path


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "媒体校准需要 FFmpeg 和 ffprobe")
class MediaAcceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        temp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(temp.cleanup)
        cls.folder = Path(temp.name)

    def inspect(self, path, profile, *options):
        return subprocess.run([sys.executable, "-B", str(CHECK), "--media", str(path),
                               "--profile", profile, *options], capture_output=True, text=True)

    def test_short_exact_60s_decodes_to_1800_frames(self):
        path = make_clip(self.folder, "short", 60)
        result = self.inspect(path, "short", "--target-seconds", "60")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["status"], "PASS")
        self.assertEqual(report["observed"]["frames"], 1800)
        self.assertEqual(report["observed"]["sample_rate_hz"], 48000)

    def test_compatible_length_still_requires_420p(self):
        path = make_clip(self.folder, "wrong-pixel-format", 60, pixel_format="yuv444p")
        result = self.inspect(path, "short")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("PIXEL_FORMAT", json.loads(result.stdout)["issues"])

    def test_missing_audio_is_a_delivery_failure(self):
        path = make_clip(self.folder, "silent-track-missing", 60, rate=None)
        result = self.inspect(path, "short")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("AUDIO_TRACK", json.loads(result.stdout)["issues"])

    def assert_issue(self, path, code, *options):
        result = self.inspect(path, "short", *options)
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn(code, json.loads(result.stdout)["issues"])

    def test_short_audio_does_not_cover_the_last_second(self):
        path = make_clip(self.folder, "trimmed-audio", 60, audio_seconds=59)
        self.assert_issue(path, "AUDIO_SPAN")

    def test_repeated_irregular_timestamp_with_right_total_frames(self):
        path = make_clip(self.folder, "jitter", 60, jitter=True)
        self.assert_issue(path, "FRAME_CADENCE")

    def test_proxy_size_cannot_pass_as_master(self):
        path = make_clip(self.folder, "proxy", 60, size="640x360")
        self.assert_issue(path, "FRAME_SIZE")

    def test_quicktime_renamed_mp4_is_detected(self):
        path = make_clip(self.folder, "source-for-mov", 60)
        renamed = self.folder / "quicktime.mp4"
        ffmpeg("-i", str(path), "-map", "0", "-c", "copy", "-f", "mov", str(renamed))
        self.assert_issue(renamed, "CONTAINER")

    def test_non_aac_audio_is_detected(self):
        path = make_clip(self.folder, "source-for-alac", 60)
        alac = self.folder / "alac.mp4"
        ffmpeg("-i", str(path), "-c:v", "copy", "-c:a", "alac", str(alac))
        self.assert_issue(alac, "AUDIO_CODEC")

    def test_a_60s_file_cannot_be_called_an_exact_61s_delivery(self):
        path = make_clip(self.folder, "wrong-target", 60)
        self.assert_issue(path, "TARGET_FRAMES", "--target-seconds", "61")

    def test_real_eight_minute_container_has_14400_decoded_frames(self):
        path = make_clip(self.folder, "long", 480)
        result = self.inspect(path, "standard8", "--target-seconds", "480")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout)["observed"]["frames"], 14400)

    def test_gap_in_middle_of_audio_is_not_hidden_by_endpoints(self):
        source = make_clip(self.folder, "source-for-gap", 60)
        edited = self.folder / "audio-gap.mp4"
        ffmpeg("-i", str(source), "-c:v", "copy", "-af", "aselect='not(between(t,20,21))'",
               "-c:a", "aac", str(edited))
        self.assert_issue(edited, "AUDIO_GAP")

    def test_report_is_bound_to_the_input_bytes(self):
        path = make_clip(self.folder, "hash", 60)
        result = self.inspect(path, "short")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        expected = "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()
        self.assertEqual(json.loads(result.stdout).get("media_hash"), expected)

    def test_sample_rate_44100_is_detected(self):
        path = make_clip(self.folder, "wrong-rate", 60, rate=44100)
        self.assert_issue(path, "SAMPLE_RATE")

    def test_corrupt_file_reports_decode_failure(self):
        path = self.folder / "invalid.mp4"
        path.write_bytes(b"invalid media")
        self.assert_issue(path, "DECODE")
