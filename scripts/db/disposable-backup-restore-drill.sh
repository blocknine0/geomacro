#!/usr/bin/env bash
set -euo pipefail

DB_URL="${LAUNCH_DRILL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
ACK="${GEOMACRO_BACKUP_RESTORE_DRILL_ACK:-}"
ARTIFACT_DIR="${GEOMACRO_BACKUP_RESTORE_ARTIFACT_DIR:-artifacts}"

if [[ "$ACK" != "DISPOSABLE_LOCAL_ONLY" ]]; then
  echo "ERROR: GEOMACRO_BACKUP_RESTORE_DRILL_ACK must equal DISPOSABLE_LOCAL_ONLY" >&2
  exit 1
fi

case "$DB_URL" in
  postgresql://*@127.0.0.1:*/*|postgresql://*@localhost:*/*) ;;
  *)
    echo "ERROR: refusing backup/restore drill against non-local database URL" >&2
    exit 1
    ;;
esac

command -v psql >/dev/null 2>&1 || { echo "ERROR: psql is required" >&2; exit 1; }
command -v sha256sum >/dev/null 2>&1 || { echo "ERROR: sha256sum is required" >&2; exit 1; }

mkdir -p "$ARTIFACT_DIR"
DUMP_PATH="$ARTIFACT_DIR/disposable-public-backup.dump"
EVIDENCE_PATH="$ARTIFACT_DIR/disposable-backup-restore-drill.json"
PROBE_ID="launch-backup-restore-probe-$(date -u +%s)"

psql "$DB_URL" -v ON_ERROR_STOP=1 <<SQL
create table if not exists public.launch_backup_restore_probe (
  id text primary key,
  created_at timestamptz not null default now()
);
insert into public.launch_backup_restore_probe(id)
values ('$PROBE_ID')
on conflict (id) do nothing;
SQL

PRE_TABLE_COUNT="$(psql "$DB_URL" -At -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")"
if [[ "$PRE_TABLE_COUNT" -lt 1 ]]; then
  echo "ERROR: public schema unexpectedly has no tables before backup" >&2
  exit 1
fi

SERVER_MAJOR="$(psql "$DB_URL" -At -v ON_ERROR_STOP=1 -c "show server_version_num;" | awk '{print int($1/10000)}')"
HOST_DUMP_MAJOR=""
if command -v pg_dump >/dev/null 2>&1; then
  HOST_DUMP_MAJOR="$(pg_dump --version | sed -E 's/.* ([0-9]+)(\..*)?$/\1/' || true)"
fi

DUMP_CLIENT="host"
if [[ -n "$HOST_DUMP_MAJOR" && "$HOST_DUMP_MAJOR" == "$SERVER_MAJOR" ]] && command -v pg_restore >/dev/null 2>&1; then
  pg_dump "$DB_URL" \
    --schema=public \
    --format=custom \
    --no-owner \
    --no-privileges \
    --file="$DUMP_PATH"
else
  command -v docker >/dev/null 2>&1 || { echo "ERROR: matching pg_dump not available and docker is required for local Supabase client fallback" >&2; exit 1; }
  DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -n 1 || true)"
  [[ -n "$DB_CONTAINER" ]] || { echo "ERROR: local Supabase database container not found" >&2; exit 1; }
  CONTAINER_MAJOR="$(docker exec "$DB_CONTAINER" pg_dump --version | sed -E 's/.* ([0-9]+)(\..*)?$/\1/')"
  [[ "$CONTAINER_MAJOR" == "$SERVER_MAJOR" ]] || { echo "ERROR: local Supabase pg_dump major $CONTAINER_MAJOR does not match server major $SERVER_MAJOR" >&2; exit 1; }
  DUMP_CLIENT="supabase_container_pg_${CONTAINER_MAJOR}"
  docker exec "$DB_CONTAINER" pg_dump \
    -U postgres \
    -d postgres \
    --schema=public \
    --format=custom \
    --no-owner \
    --no-privileges > "$DUMP_PATH"
fi

DUMP_SHA256="$(sha256sum "$DUMP_PATH" | awk '{print $1}')"
DUMP_BYTES="$(wc -c < "$DUMP_PATH" | tr -d ' ')"
if [[ "$DUMP_BYTES" -lt 1024 ]]; then
  echo "ERROR: backup dump is unexpectedly small" >&2
  exit 1
fi

psql "$DB_URL" -v ON_ERROR_STOP=1 -c 'drop schema public cascade; create schema public;'

if [[ "$DUMP_CLIENT" == "host" ]]; then
  pg_restore \
    --dbname="$DB_URL" \
    --no-owner \
    --no-privileges \
    --exit-on-error \
    "$DUMP_PATH"
else
  DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -n 1)"
  cat "$DUMP_PATH" | docker exec -i "$DB_CONTAINER" pg_restore \
    -U postgres \
    -d postgres \
    --no-owner \
    --no-privileges \
    --exit-on-error
fi

RESTORED_PROBE_COUNT="$(psql "$DB_URL" -At -v ON_ERROR_STOP=1 -c "select count(*) from public.launch_backup_restore_probe where id='$PROBE_ID';")"
POST_TABLE_COUNT="$(psql "$DB_URL" -At -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")"
EVENTS_TABLE_COUNT="$(psql "$DB_URL" -At -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.tables where table_schema='public' and table_name='events';")"

if [[ "$RESTORED_PROBE_COUNT" != "1" ]]; then
  echo "ERROR: backup/restore probe row was not restored" >&2
  exit 1
fi
if [[ "$POST_TABLE_COUNT" != "$PRE_TABLE_COUNT" ]]; then
  echo "ERROR: public table count changed across restore: before=$PRE_TABLE_COUNT after=$POST_TABLE_COUNT" >&2
  exit 1
fi
if [[ "$EVENTS_TABLE_COUNT" != "1" ]]; then
  echo "ERROR: expected core public.events table missing after restore" >&2
  exit 1
fi

node - "$EVIDENCE_PATH" "$DUMP_SHA256" "$DUMP_BYTES" "$PRE_TABLE_COUNT" "$POST_TABLE_COUNT" "$PROBE_ID" "$SERVER_MAJOR" "$DUMP_CLIENT" <<'NODE'
const fs = require('fs');
const [out, sha, bytes, beforeCount, afterCount, probeId, serverMajor, dumpClient] = process.argv.slice(2);
const evidence = {
  schema_version: 'geomacro.disposable-backup-restore-drill.v1',
  generated_at: new Date().toISOString(),
  database_scope: 'disposable_local_supabase_public_schema',
  production_database_touched: false,
  destructive_actions_production: false,
  postgres_server_major: Number(serverMajor),
  dump_restore_client: dumpClient,
  backup_sha256: sha,
  backup_bytes: Number(bytes),
  public_table_count_before: Number(beforeCount),
  public_table_count_after: Number(afterCount),
  core_events_table_restored: true,
  probe_id: probeId,
  probe_row_restored: true,
  result: 'PASS'
};
fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + '\n');
NODE

echo "PASS: disposable local Supabase public-schema backup -> destructive local reset -> restore -> integrity verification succeeded."
echo "INFO: PostgreSQL server major $SERVER_MAJOR; dump/restore client $DUMP_CLIENT."
echo "BOUNDARY: production database was not touched."
