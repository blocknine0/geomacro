#!/usr/bin/env bash
set -euo pipefail

ITERATIONS="${GOAT_ACCEPTANCE_ITERATIONS:-250}"
WINDOW_ID="${GOAT_ACCEPTANCE_WINDOW_ID:-local-$(date -u +%Y%m%dT%H%M%SZ)}"
ARTIFACT_DIR="${GOAT_ACCEPTANCE_ARTIFACT_DIR:-artifacts/goat-acceptance/windows}"

if ! [[ "$ITERATIONS" =~ ^[0-9]+$ ]] || [ "$ITERATIONS" -lt 1 ] || [ "$ITERATIONS" -gt 500 ]; then
  echo "GOAT_ACCEPTANCE_ITERATIONS must be an integer from 1 to 500" >&2
  exit 2
fi

mkdir -p "$ARTIFACT_DIR"
REPORT="$ARTIFACT_DIR/${WINDOW_ID}.json"
RAW="$ARTIFACT_DIR/${WINDOW_ID}-vitest.json"
MATRIX_LOG="$ARTIFACT_DIR/${WINDOW_ID}-matrix.log"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
start_epoch_ms="$(date +%s%3N)"

bunx vitest run \
  src/__tests__/goat-flow-negative-contract.test.ts \
  src/__tests__/goat-mainnet-readiness-static.test.ts \
  --reporter=dot | tee "$MATRIX_LOG"

GOAT_ACCEPTANCE_ITERATIONS="$ITERATIONS" bunx vitest run \
  src/__tests__/goat-repeated-readiness.test.ts \
  --reporter=json \
  --outputFile="$RAW"

completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
end_epoch_ms="$(date +%s%3N)"

python3 - "$RAW" "$REPORT" "$WINDOW_ID" "$started_at" "$completed_at" "$ITERATIONS" "$((end_epoch_ms - start_epoch_ms))" <<'PY'
import json, statistics, sys
from pathlib import Path

raw_path, report_path, window_id, started_at, completed_at, expected, wall_ms = sys.argv[1:]
raw = json.loads(Path(raw_path).read_text(encoding="utf-8"))
expected = int(expected)
passed = int(raw.get("numPassedTests", 0))
failed = int(raw.get("numFailedTests", 0))
total = int(raw.get("numTotalTests", passed + failed))

durations = []
for suite in raw.get("testResults", []):
    for item in suite.get("assertionResults", []):
        value = item.get("duration")
        if isinstance(value, (int, float)) and value >= 0:
            durations.append(float(value))
durations.sort()

def pct(p):
    if not durations:
        return 0
    idx = max(0, min(len(durations) - 1, int((p / 100) * len(durations) + 0.999999) - 1))
    return durations[idx]

report = {
    "schema_version": "goat-acceptance-window-v2",
    "window_id": window_id,
    "environment": "testnet3",
    "started_at": started_at,
    "completed_at": completed_at,
    "target_repeated_cases": expected,
    "repeated_cases": total,
    "passed": passed,
    "failed": failed,
    "pass_rate": passed / total if total else 0,
    "matrix_gate_passed": True,
    "wall_clock_ms": int(wall_ms),
    "case_duration_ms": {
        "min": min(durations) if durations else 0,
        "median": statistics.median(durations) if durations else 0,
        "p95": pct(95),
        "p99": pct(99),
        "max": max(durations) if durations else 0,
    },
}
if total != expected:
    raise SystemExit(f"expected {expected} repeated cases but reporter recorded {total}")
Path(report_path).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
PY
