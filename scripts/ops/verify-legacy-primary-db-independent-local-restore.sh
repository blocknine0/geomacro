#!/usr/bin/env bash
# Retired: legacy inventory discovery is incompatible with the D1-only index.
set -euo pipefail
mkdir -p artifacts/legacy-exit
cat > artifacts/legacy-exit/primary-db-independent-restore.json <<'JSON'
{
  "schema": "geomacro.legacy-primary-disposable-b2-restore.v1",
  "status": "BLOCKED_NO_DELETION",
  "blocker": "LEGACY_DISCOVERY_RETIRED_USE_GATEWAY_D1_INDEX",
  "project_deletion_authorized": false,
  "independent_disposable_postgres17_database_restore_verified": false,
  "old_supabase_db_writes": 0,
  "old_supabase_storage_deletes": 0,
  "b2_writes": 0,
  "real_money_transactions": 0
}
JSON
printf '%s\n' 'BLOCKED_D1_INDEX_REQUIRED: use the authenticated gateway and D1 exact-key ledger.' >&2
exit 3
