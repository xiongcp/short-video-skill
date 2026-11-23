"""复现 C01 的六个校准点。标准输出为 JSON，生成的媒体仅保存在临时目录。"""
import json
import platform
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "evals"))
from test_media_acceptance import make_clip


def version(tool):
    result = subprocess.run([tool, "-version"], check=True, text=True, capture_output=True)
    return result.stdout.splitlines()[0]


def main():
    results = []
    with TemporaryDirectory() as directory:
        for seconds in (60, 120, 180, 450, 480, 510):
            profile = "short" if seconds <= 180 else "standard8"
            path = make_clip(Path(directory), f"{profile}-{seconds}", seconds)
            result = subprocess.run(
                [sys.executable, "-B", str(ROOT / "evals/check_design.py"), "--media", str(path),
                 "--profile", profile, "--target-seconds", str(seconds)], capture_output=True, text=True)
            if not result.stdout.strip():
                raise RuntimeError(result.stderr)
            results.append({"name": path.name, "bytes": path.stat().st_size, "exit_code": result.returncode,
                            "report": json.loads(result.stdout)})
    report = {
        "case_id": "C01", "evidence_level": "FIXTURE_MEDIA",
        "completed_at": datetime.now(timezone(timedelta(hours=8))).isoformat(timespec="seconds"),
        "environment": {"python": platform.python_version(), "system": platform.platform(),
                        "ffmpeg": version("ffmpeg"), "ffprobe": version("ffprobe")},
        "source": "一秒深蓝色 1080p30 画面循环，独立编码连续 440 Hz 单音，整片解码。两个片长档共六个文件。",
        "results": results,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if all(item["exit_code"] == 0 and item["report"]["status"] == "PASS"
                    and item["report"]["observed"]["frames"] == 30 * item["report"]["target_seconds"]
                    for item in results) else 1


if __name__ == "__main__":
    sys.exit(main())
