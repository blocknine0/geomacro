#!/usr/bin/env bash
set -euo pipefail
export B2_FRAGMENT_ARCHIVE_LIMIT=1
export B2_FRAGMENT_MIN_AGE_HOURS=168
export B2_FRAGMENT_DELETE_SOURCE=0
exec node scripts/ops/b2-fragment-archive-offload.mjs
