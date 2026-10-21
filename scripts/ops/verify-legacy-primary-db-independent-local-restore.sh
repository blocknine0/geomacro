#!/usr/bin/env bash
# One-shot independently restored PostgreSQL 17 readback of an existing,
# SHA-verified old primary database B2 archive. ONLY ephemeral local DB writes.
# Never permit source Supabase writes, Supabase Storage deletes, B2 PUT, money.
set -euo pipefail
umask 077
export AWS_DEFAULT_REGION=us-east-005 AWS_EC2_METADATA_DISABLED=true AWS_MAX_ATTEMPTS=1
ROOT="$(pwd)"
PRIVATE="$(mktemp -d)"
ARTIFACT="artifacts/legacy-exit/primary-db-independent-restore.json"
REF_RUN="39590890260"
BUCKET="geomacro-private-archive"
ENDPOINT="https://s3.us-east-005.backblazeb2.com"
PREFIX="geomacro-evidence/v1/legacy-supabase-safe-exit/db-"
local_started=0
cleanup() {
  if [[ "$local_started" == 1 ]]; then
    supabase stop --no-backup >"$PRIVATE/stop.stdout" 2>"$PRIVATE/stop.stderr" || true
  fi
  rm -rf -- "$PRIVATE"
}
trap cleanup EXIT
mkdir -p artifacts/legacy-exit
reason="NOT_STARTED"
write_receipt() {
  node - "$ARTIFACT" "$reason" "${1:-}" "${2:-}" "${3:-}" "${4:-}" "${5:-}" <<'NODE'
const fs=require("node:fs");
const [out,reason,structured,storage,payments,risk,failureClass]=process.argv.slice(2);
const good=reason==="B2_DB_INDEPENDENT_LOCAL_RESTORE_VERIFIED";
const report={
 schema:"geomacro.legacy-primary-disposable-b2-restore.v1",
 checked_at:new Date().toISOString(),source_project:"ldpwajisioljyjtojvfx",
 originating_verified_b2_archive_run:"39590890260",
 status:good?"B2_DB_INDEPENDENT_LOCAL_RESTORE_VERIFIED":"BLOCKED_NO_DELETION",
 blocker:good?null:reason,
 restore_failure_class:good?null:(failureClass||null),
 independent_disposable_postgres17_database_restore_verified:good,
 restored_structured_event_rows:good?Number(structured):null,
 restored_storage_metadata_rows:good?Number(storage):null,
 restored_legacy_payment_event_rows:good?Number(payments):null,
 restored_geomacro_risk_object_rows:good?Number(risk):null,
 source_storage_bytes_migrated:false,
 all_edge_function_settings_preserved:false,
 all_payment_entitlements_reconciled:false,
 entire_supabase_retirement_safe:false,
 project_deletion_authorized:false,
 old_supabase_db_writes:0,old_supabase_storage_deletes:0,
 b2_writes:0,real_money_transactions:0,
 raw_database_downloaded_to_github_artifacts:false,
 no_raw_source_data_in_receipt:true,
};
fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(report));
NODE
}
block(){
 reason="$1"
 local category=""
 if [[ "$reason" == "DISPOSABLE_INDEPENDENT_PHYSICAL_RESTORE_FAILED" &&
       -f "$PRIVATE/restore.stderr" ]];then
   # Privacy-safe diagnostics: NEVER copy SQL error text or object names into
   # public logs or GitHub artifacts. Only constant error family identifiers.
   if grep -Fq 'schema "public" already exists' "$PRIVATE/restore.stderr";then
     category="DEFAULT_PUBLIC_SCHEMA_COLLISION"
   elif grep -Eiq 'extension .* is not available|could not open extension control file' "$PRIVATE/restore.stderr";then
     category="LOCAL_REQUIRED_EXTENSION_UNAVAILABLE"
   elif grep -Eiq 'role "[^"]+" does not exist|permission denied' "$PRIVATE/restore.stderr";then
     category="LOCAL_ROLE_OR_PERMISSION_NOT_AVAILABLE"
   elif grep -Eiq 'already exists|duplicate key value' "$PRIVATE/restore.stderr";then
     category="LOCAL_PREEXISTING_OBJECT_COLLISION"
   elif grep -Eiq 'does not exist|undefined' "$PRIVATE/restore.stderr";then
     category="LOCAL_DEPENDENCY_MISSING"
   else
     category="OTHER_PRIVATE_PG_RESTORE_FAILURE"
   fi
 fi
 write_receipt "" "" "" "" "$category"
 exit 3
}
if [[ "${APP_SUPABASE_URL:-}" != "https://ldpwajisioljyjtojvfx.supabase.co" ]]; then
  block "LEGACY_ORIGIN_NOT_PINNED"
fi
for key in B2_KEY_ID B2_APPLICATION_KEY B2_LEGACY_INVENTORY_KEY_ID B2_LEGACY_INVENTORY_APPLICATION_KEY CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID D1_DATABASE_ID; do
  [[ -n "${!key:-}" ]] || block "PRIVATE_RUNTIME_CONFIG_INCOMPLETE"
done
for bin in aws jq psql sha256sum supabase docker node; do
  command -v "$bin" >/dev/null 2>&1 || block "DISPOSABLE_RESTORE_DEPENDENCY_MISSING"
done
# Read-only inventory key, no write access. Keep response in protected runner.
export AWS_ACCESS_KEY_ID="$B2_LEGACY_INVENTORY_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$B2_LEGACY_INVENTORY_APPLICATION_KEY"
aws --endpoint-url "$ENDPOINT" s3api list-objects-v2 --bucket "$BUCKET" \
  --prefix "$PREFIX" --output json >"$PRIVATE/list.json" 2>"$PRIVATE/list.err" ||
  block "B2_READONLY_ORIGINAL_BACKUP_INVENTORY_FAILED"
KEY="$(jq -er --arg suffix "-$REF_RUN.pgcustom" '
  [.Contents[]? | select(.Key | endswith($suffix))] |
  if length==1 then .[0].Key else empty end
' "$PRIVATE/list.json")" || block "UNIQUE_ATTESTED_ORIGINAL_DB_ARCHIVE_NOT_FOUND"
# Validate the entire private key before passing it into a network command.
if [[ ! "$KEY" =~ ^geomacro-evidence/v1/legacy-supabase-safe-exit/db-([a-f0-9]{20})-39590890260\.pgcustom$ ]];then
 block "PRIVATE_ORIGINAL_DB_ARCHIVE_KEY_INVALID"
fi
SHA_PREFIX="${BASH_REMATCH[1]}"
# An independent B2 GET must be counted BEFORE physical network I/O.
node --input-type=module >"$PRIVATE/quota.out" 2>"$PRIVATE/quota.err" <<'NODE' ||
  block "B2_ACCOUNT_D1_RESERVATION_UNAVAILABLE"
import {createB2D1AccountGovernor} from "./scripts/ops/b2-d1-account-governor.mjs";
const g=createB2D1AccountGovernor({env:{
 ...process.env,B2_ACCOUNT_QUOTA_WORKFLOW_ID:"legacy_primary_restore",
}});
const s=await g.status();
if(!s?.ok||s.used.GET+1>s.limits.GET-2||
  s.used.total+1>s.limits.total-3)process.exit(2);
await g.reserve("GET");
NODE
export AWS_ACCESS_KEY_ID="$B2_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$B2_APPLICATION_KEY"
aws --endpoint-url "$ENDPOINT" s3api get-object --bucket "$BUCKET" \
 --key "$KEY" "$PRIVATE/verified-old-primary.pgcustom" --output json \
 >"$PRIVATE/get.json" 2>"$PRIVATE/get.err" ||
 block "VERIFIED_OLD_PRIMARY_B2_GET_FAILED"
HASH="$(sha256sum "$PRIVATE/verified-old-primary.pgcustom" | cut -d' ' -f1)"
[[ "${HASH:0:20}" == "$SHA_PREFIX" ]] ||
 block "B2_ARCHIVE_SHA256_DOES_NOT_MATCH_PREVIOUS_ATTESTED_KEY"
BYTES="$(stat -c '%s' "$PRIVATE/verified-old-primary.pgcustom")"
[[ "$BYTES" -ge 1048576 && "$BYTES" -le 891289600 ]] ||
 block "B2_ARCHIVE_BYTES_OUTSIDE_SAFE_BOUND"
docker run --rm --network none -v "$PRIVATE:/backup:ro" postgres:17-alpine \
 pg_restore --list /backup/verified-old-primary.pgcustom >"$PRIVATE/toc" \
 2>"$PRIVATE/toc.err" || block "B2_CUSTOM_POSTGRES_ARCHIVE_INVALID"
# Existing PG17 logical backup reported at least this many table definitions.
node - "$PRIVATE/toc" <<'NODE' || block "BACKUP_SCHEMA_DEFINITION_UNEXPECTED"
const fs=require("node:fs");
const toc=fs.readFileSync(process.argv[2],"utf8").split("\n");
for(const [schema,min] of [["public",141],["auth",27],["storage",8]]){
 const n=toc.filter(x=>new RegExp("; .* TABLE "+schema+" ").test(x)).length;
 if(n<min)process.exit(1);
}
NODE
# Start a completely ISOLATED local Supabase/Postgres instance; never connect
# any migration or restore operation to an actual Supabase production host.
supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,kong,gotrue,realtime,postgrest,storage-api,postgres-meta,mailpit \
 >"$PRIVATE/supabase.stdout" 2>"$PRIVATE/supabase.stderr" ||
 block "DISPOSABLE_SUPABASE_POSTGRES17_BOOT_FAILED"
local_started=1
URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
MAJOR="$(psql "$URL" -X -A -t -v ON_ERROR_STOP=1 -c 'show server_version_num;' \
 2>"$PRIVATE/pg.err" || true)"
[[ "$MAJOR" =~ ^17[0-9]{4}$ ]] ||
 block "DISPOSABLE_TARGET_NOT_POSTGRES17"
psql "$URL" -X -q -v ON_ERROR_STOP=1 \
 -c 'CREATE DATABASE geomacro_legacy_restored;' \
 >"$PRIVATE/createdb.out" 2>"$PRIVATE/createdb.err" ||
 block "DISPOSABLE_TARGET_DB_CREATE_FAILED"
# All SQL writes are ONLY to fresh local dedicated localhost database.
LOCAL_RESTORE_URL="postgresql://postgres:postgres@127.0.0.1:54322/geomacro_legacy_restored"
# PostgreSQL 15+ creates the default 'public' schema in a fresh database;
# the independently backed-up archive also defines that schema. Drop ONLY
# the empty disposable target's default schema, never the production source.
[[ "$LOCAL_RESTORE_URL" == "postgresql://postgres:postgres@127.0.0.1:54322/geomacro_legacy_restored" ]] ||
 block "DISPOSABLE_LOCAL_TARGET_IDENTITY_MISMATCH"
psql "$LOCAL_RESTORE_URL" -X -q -v ON_ERROR_STOP=1 \
 -c 'DROP SCHEMA IF EXISTS public CASCADE;' \
 >"$PRIVATE/drop-default-public.stdout" 2>"$PRIVATE/drop-default-public.stderr" ||
 block "DISPOSABLE_DEFAULT_PUBLIC_SCHEMA_RESET_FAILED"
docker run --rm --network host -v "$PRIVATE:/backup:ro" postgres:17-alpine \
 pg_restore --dbname "$LOCAL_RESTORE_URL" --no-owner --no-privileges \
 --exit-on-error /backup/verified-old-primary.pgcustom \
 >"$PRIVATE/restore.stdout" 2>"$PRIVATE/restore.stderr" ||
 block "DISPOSABLE_INDEPENDENT_PHYSICAL_RESTORE_FAILED"
COUNTS="$(psql "$LOCAL_RESTORE_URL" -X -A -t -F '|' -v ON_ERROR_STOP=1 \
 -c 'SELECT (SELECT count(*) FROM public.live_structured_events),
            (SELECT count(*) FROM storage.objects),
            (SELECT count(*) FROM public.commercial_payment_events),
            (SELECT count(*) FROM public.geomacro_risk_objects);' \
 2>"$PRIVATE/counts.err")" || block "INDEPENDENT_RESTORED_CANONICAL_ROWS_UNAVAILABLE"
IFS='|' read -r STRUCTURED STORAGE PAYMENTS RISK <<<"$COUNTS"
[[ "$STRUCTURED" =~ ^[0-9]+$ && "$STORAGE" =~ ^[0-9]+$ &&
   "$PAYMENTS" =~ ^[0-9]+$ && "$RISK" =~ ^[0-9]+$ ]] ||
 block "DISPOSABLE_RESTORED_COUNTS_INVALID"
(( STRUCTURED >= 33138 && STORAGE >= 23648 && PAYMENTS >= 5 && RISK >= 21178 )) ||
 block "DISPOSABLE_RESTORED_CANONICAL_ROW_COUNTS_BELOW_BASELINE"
reason="B2_DB_INDEPENDENT_LOCAL_RESTORE_VERIFIED"
write_receipt "$STRUCTURED" "$STORAGE" "$PAYMENTS" "$RISK"
