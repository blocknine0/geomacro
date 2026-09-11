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
RESULTS="$ARTIFACT_DIR/${WINDOW_ID}.csv"
REPORT="$ARTIFACT_DIR/${WINDOW_ID}.json"
printf 'iteration,status,duration_ms\n' > "$RESULTS"

passed=0
failed=0
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
start_epoch_ms="$(date +%s%3N)"

for i in $(seq 1 "$ITERATIONS"); do
  case_start="$(date +%s%3N)"
  if bunx vitest run \
      src/__tests__/goat-flow-negative-contract.test.ts \
      src/__tests__/goat-mainnet-readiness-static.test.ts \
      --reporter=dot >/tmp/goat-acceptance-${WINDOW_ID}-${i}.log 2>&1; then
    status=pass
    passed=$((passed + 1))
  else
    status=fail
    failed=$((failed + 1))
    cat /tmp/goat-acceptance-${WINDOW_ID}-${i}.log >&2 || true
  fi
  case_end="$(date +%s%3N)"
  printf '%s,%s,%s\n' "$i" "$status" "$((case_end - case_start))" >> "$RESULTS"
  rm -f /tmp/goat-acceptance-${WINDOW_ID}-${i}.log
 done

completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
end_epoch_ms="$(date +%s%3N)"

python3 - "$RESULTS" "$REPORT" "$WINDOW_ID" "$started_at" "$completed_at" "$ITERATIONS" "$passed" "$failed" "$((end_epoch_ms - start_epoch_ms))" <<'PY'
import csv, json, statistics, sys
from pathlib import Path

csv_path, report_path, window_id, started_at, completed_at, total, passed, failed, wall_ms = sys.argv[1:]
rows = list(csv.DictReader(open(csv_path, newline="", encoding="utf-8")))
durations = sorted(int(row["duration_ms"]) for row in rows)

def pct(p):
    if not durations:
        return 0
    idx = max(0, min(len(durations) - 1, int((p / 100) * len(durations) + 0.999999) - 1))
    return durations[idx]

report = {
    "schema_version": "goat-acceptance-window-v1",
    "window_id": window_id,
    "environment": "testnet3",
    "started_at": started_at,
    "completed_at": completed_at,
    "suite_iterations": int(total),
    "passed": int(passed),
    "failed": int(failed),
    "pass_rate": int(passed) / int(total),
    "wall_clock_ms": int(wall_ms),
    "iteration_latency_ms": {
        "min": min(durations) if durations else 0,
        "median": statistics.median(durations) if durations else 0,
        "p95": pct(95),
        "p99": pct(99),
        "max": max(durations) if durations else 0,
    },
}
Path(report_path).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
PY

if [ "$failed" -ne 0 ]; then
  exit 1
fi
