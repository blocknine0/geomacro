#!/usr/bin/env bash
set -euo pipefail
if [ -z "${B2_FRAGMENT_RESTORE_ID:-}" ]; then
  echo "B2_FRAGMENT_RESTORE_ID is required" >&2
  exit 2
fi
exec node scripts/ops/b2-fragment-restore.mjs
