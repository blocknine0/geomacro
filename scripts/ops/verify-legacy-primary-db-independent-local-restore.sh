#!/usr/bin/env bash
# Retired: legacy inventory discovery is incompatible with the D1-only index.
set -euo pipefail
printf '%s\n' 'BLOCKED_D1_INDEX_REQUIRED: use the authenticated gateway and D1 exact-key ledger.' >&2
exit 3
