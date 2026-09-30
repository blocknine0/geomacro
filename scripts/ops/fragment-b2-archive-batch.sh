#!/usr/bin/env bash
set -euo pipefail
limit="${B2_FRAGMENT_ARCHIVE_LIMIT:-25}"
case "$limit" in ''|*[!0-9]*) echo "invalid limit" >&2; exit 2;; esac
if [ "$limit" -lt 1 ] || [ "$limit" -gt 100 ]; then echo "limit must be 1..100" >&2; exit 2; fi
export B2_FRAGMENT_ARCHIVE_LIMIT="$limit"
export B2_FRAGMENT_MIN_AGE_HOURS="${B2_FRAGMENT_MIN_AGE_HOURS:-168}"
export B2_FRAGMENT_DELETE_SOURCE=0
exec node scripts/ops/b2-fragment-archive-offload.mjs
