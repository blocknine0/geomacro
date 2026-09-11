#!/usr/bin/env python3
import glob, json, statistics, sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/acceptance/windows")
out = Path(sys.argv[2] if len(sys.argv) > 2 else "artifacts/acceptance/final-report.json")
files = sorted(glob.glob(str(root / "*.json")))
if not files:
    raise SystemExit("no window JSON files found")

windows = [json.loads(Path(p).read_text(encoding="utf-8")) for p in files]
total = sum(int(x.get("suite_iterations", 0)) for x in windows)
passed = sum(int(x.get("passed", 0)) for x in windows)
failed = sum(int(x.get("failed", 0)) for x in windows)
wall = [int(x.get("wall_clock_ms", 0)) for x in windows]
p95 = [float(x.get("iteration_latency_ms", {}).get("p95", 0)) for x in windows]

report = {
    "schema_version": "acceptance-report-v1",
    "window_count": len(windows),
    "suite_iterations": total,
    "passed": passed,
    "failed": failed,
    "pass_rate": passed / total if total else 0,
    "target_iterations": 5000,
    "target_complete": total >= 5000,
    "first_window_started_at": min(x["started_at"] for x in windows),
    "last_window_completed_at": max(x["completed_at"] for x in windows),
    "window_wall_clock_ms": {"min": min(wall), "median": statistics.median(wall), "max": max(wall)},
    "window_iteration_p95_ms": {"min": min(p95), "median": statistics.median(p95), "max": max(p95)},
}
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
