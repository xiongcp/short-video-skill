"""使用本机 ffprobe 离线检查交付媒体，输出可保存的技术验收结果。"""
import hashlib
import json
import os
import subprocess
from fractions import Fraction


def check_video(video, frames, media, bounds, target, observed, issues):
    count = len(frames)
    observed.update(frames=count, width=video.get("width"), height=video.get("height"),
                    pixel_format=video.get("pix_fmt"), video_codec=video.get("codec_name"))
    if (observed["width"], observed["height"]) != (media["width"], media["height"]):
        issues.append("FRAME_SIZE")
    if observed["video_codec"] != "h264":
        issues.append("VIDEO_CODEC")
    if observed["pixel_format"] != "yuv420p":
        issues.append("PIXEL_FORMAT")
    fps = media["fps"]
    if not bounds["min_seconds"] * fps <= count <= bounds["max_seconds"] * fps:
        issues.append("DURATION_PROFILE")
    if target is not None and count != target * fps:
        issues.append("TARGET_FRAMES")
    tick = Fraction(video["time_base"])
    expected_end = Fraction(count, fps)
    tolerance = min(tick / 2, Fraction(1, 4 * fps))
    for index, frame in enumerate(frames):
        pts = frame.get("best_effort_timestamp")
        if pts is None or abs(pts * tick - Fraction(index, fps)) > tolerance:
            observed["first_off_grid_frame"] = index
            issues.append("FRAME_CADENCE")
            break
    if "duration_ts" not in video or abs(video["duration_ts"] * tick - expected_end) > tolerance:
        issues.append("VIDEO_SPAN")
    observed["frame_grid_fps"] = fps
    return expected_end


def check_audio(audio, audio_frames, media, expected_end, observed, issues):
    observed.update(sample_rate_hz=int(audio.get("sample_rate") or 0), audio_codec=audio.get("codec_name"))
    if observed["audio_codec"] != "aac":
        issues.append("AUDIO_CODEC")
    if observed["sample_rate_hz"] != media["sample_rate_hz"]:
        issues.append("SAMPLE_RATE")
    tick = Fraction(audio["time_base"])
    if not audio_frames or not observed["sample_rate_hz"] or "duration_ts" not in audio or "start_pts" not in audio:
        issues.append("AUDIO_SPAN")
        return
    if expected_end is None:
        return
    start = audio["start_pts"] * tick
    end = start + audio["duration_ts"] * tick
    first = audio_frames[0].get("best_effort_timestamp")
    last = audio_frames[-1].get("best_effort_timestamp")
    size = audio_frames[-1].get("nb_samples")
    tolerance = Fraction(1, media["fps"])
    observed["audio_start_seconds"] = float(start)
    observed["audio_end_seconds"] = float(end)
    if first is None or last is None or not size or max(
        abs(start), abs(first * tick), abs(end - expected_end),
        abs(last * tick + Fraction(size, observed["sample_rate_hz"]) - expected_end)
    ) > tolerance:
        issues.append("AUDIO_SPAN")
    rate = observed["sample_rate_hz"]
    for index, (left, right) in enumerate(zip(audio_frames, audio_frames[1:]), start=1):
        left_pts = left.get("best_effort_timestamp")
        right_pts = right.get("best_effort_timestamp")
        samples = left.get("nb_samples")
        if left_pts is None or right_pts is None or not samples or abs(
            (right_pts - left_pts) * tick - Fraction(samples, rate)
        ) > max(tick, Fraction(1, rate)):
            observed["first_discontinuous_audio_frame"] = index
            issues.append("AUDIO_GAP")
            break


def inspect_media(path, profile, target, config):
    observed = {}
    issues = []
    report = {"profile": profile, "target_seconds": target, "status": "FAIL",
              "observed": observed, "issues": issues}
    try:
        with path.open("rb") as source:
            original = os.fstat(source.fileno())
            digest = hashlib.sha256()
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
            report["media_hash"] = "sha256:" + digest.hexdigest()
    except OSError as error:
        report.update(issues=["INPUT_FILE"], diagnostic=str(error))
        return report
    fields = ("format=format_name:format_tags=major_brand:"
              "stream=index,codec_type,codec_name,width,height,pix_fmt,sample_rate,time_base,start_pts,duration_ts:"
              "stream_disposition=default,attached_pic:frame=stream_index,best_effort_timestamp,nb_samples")
    try:
        probe = subprocess.run(["ffprobe", "-v", "error", "-protocol_whitelist", "file", "-threads", "1",
                                "-show_frames", "-show_entries", fields, "-of", "json", "-i", str(path.resolve())],
                               capture_output=True, text=True)
    except FileNotFoundError:
        report.update(status="BLOCKED", issues=["FFPROBE_UNAVAILABLE"])
        return report
    if probe.returncode or probe.stderr.strip():
        report.update(issues=["DECODE"], diagnostic=probe.stderr.strip())
        return report
    try:
        current = path.stat()
    except OSError:
        current = None
    if current is None or any(getattr(current, k) != getattr(original, k)
                              for k in ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")):
        report.update(issues=["INPUT_CHANGED"])
        return report

    data = json.loads(probe.stdout)
    container = data.get("format", {})
    brand = container.get("tags", {}).get("major_brand", "").strip().lower()
    observed["major_brand"] = brand
    if "mp4" not in container.get("format_name", "").split(",") or not (
        brand.startswith(("iso", "mp4")) or brand in ("avc1", "m4v", "msnv", "dash")
    ):
        issues.append("CONTAINER")
    streams = data.get("streams", [])
    videos = [s for s in streams if s["codec_type"] == "video" and not s["disposition"]["attached_pic"]]
    audios = [s for s in streams if s["codec_type"] == "audio"]
    media = config["media"]
    frames = data.get("frames", [])
    expected_end = None
    if len(videos) == 1:
        video = videos[0]
        video_frames = [frame for frame in frames if frame["stream_index"] == video["index"]]
        expected_end = check_video(video, video_frames, media, config["profiles"][profile], target, observed, issues)
    else:
        issues.append("VIDEO_TRACK")
    if audios:
        audio = max(audios, key=lambda stream: stream["disposition"]["default"])
        audio_frames = [frame for frame in frames if frame["stream_index"] == audio["index"]]
        check_audio(audio, audio_frames, media, expected_end, observed, issues)
    else:
        issues.append("AUDIO_TRACK")
    if not issues:
        report["status"] = "PASS"
    return report
