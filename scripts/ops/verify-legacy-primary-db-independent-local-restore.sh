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
  node - "$ARTIFACT" "$reason" "${1:-}" "${2:-}" "${3:-}" "${4:-}" "${5:-}" "${6:-}" "${7:-}" <<'NODE'
const fs=require("node:fs");
const [out,reason,structured,storage,payments,risk,failureClass,firstErrorDetails,ledgerMatches]=process.argv.slice(2);
const good=reason==="B2_DB_INDEPENDENT_LOCAL_RESTORE_VERIFIED";
const report={
 schema:"geomacro.legacy-primary-disposable-b2-restore.v1",
 checked_at:new Date().toISOString(),source_project:"ldpwajisioljyjtojvfx",
 originating_verified_b2_archive_run:"39590890260",
 status:good?"B2_DB_INDEPENDENT_LOCAL_RESTORE_VERIFIED":"BLOCKED_NO_DELETION",
 blocker:good?null:reason,
 restore_failure_class:good?null:(failureClass||null),
 restore_first_error_details:good?null:(()=>{try{const d=JSON.parse(firstErrorDetails||'null');if(!d||!['MISSING_SCHEMA','MISSING_EXTENSION','MISSING_FUNCTION','MISSING_RELATION','MISSING_TYPE','MISSING_OPERATOR','MISSING_ROLE','MISSING_COLUMN','MISSING_CAST','MISSING_TABLESPACE','MISSING_OTHER_OBJECT','DUPLICATE_OBJECT','UNAVAILABLE_EXTENSION_LIBRARY','PERMISSION_PROBLEM','OTHER_SQL_FAILURE','NO_RESTORABLE_PG_ERROR_FOUND'].includes(d.first_server_error_kind)||d.error_text_or_object_identifiers_exposed!==false)return null;return d;}catch{return null}})(),
 independent_disposable_postgres17_database_restore_verified:good,
 restored_structured_event_rows:good?Number(structured):null,
 restored_storage_metadata_rows:good?Number(storage):null,
 restored_legacy_payment_event_rows:good?Number(payments):null,
 restored_geomacro_risk_object_rows:good?Number(risk):null,
 old_commercial_ledger_database_content_reconciled:good&&ledgerMatches==="9",
 historic_commercial_tables_exactly_reconciled:good?Number(ledgerMatches||0):0,
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
 local diagnosis=""
 if [[ "$reason" == "DISPOSABLE_INDEPENDENT_PHYSICAL_RESTORE_FAILED" &&
       -f "$PRIVATE/restore.stderr" ]];then
   # Classify only the FIRST PG error in the PRIVATE local stderr.
   diagnosis="$(node scripts/ops/classify-private-pg-restore-error.mjs "$PRIVATE/restore.stderr" || true)"
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
 write_receipt "" "" "" "" "$category" "$diagnosis"
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
# Only the disposable Supabase PG17 container may use its own admin role.
mapfile -t LOCAL_DB_CONTAINERS < <(docker ps --format '{{.Names}}' |
  grep -E '^supabase_db_[A-Za-z0-9_-]+$' || true)
[[ "${#LOCAL_DB_CONTAINERS[@]}" == "1" ]] ||
 block "DISPOSABLE_SINGLE_SUPABASE_DB_CONTAINER_NOT_PROVEN"
LOCAL_DB_CONTAINER="${LOCAL_DB_CONTAINERS[0]}"
LOCAL_ADMIN_IS_SUPER="$(docker exec "$LOCAL_DB_CONTAINER" \
  psql -U supabase_admin -d postgres -X -A -t -v ON_ERROR_STOP=1 \
  -c "SELECT CASE WHEN rolsuper THEN 1 ELSE 0 END FROM pg_roles WHERE rolname='supabase_admin';" \
  2>"$PRIVATE/privileges.stderr" || true)"
[[ "$LOCAL_ADMIN_IS_SUPER" == "1" ]] ||
 block "DISPOSABLE_SUPABASE_ADMIN_PRIVILEGE_UNAVAILABLE"
LOCAL_RESTORE_MAJOR="$(docker exec "$LOCAL_DB_CONTAINER" pg_restore --version \
  2>"$PRIVATE/local-pg-restore.stderr" || true)"
[[ "$LOCAL_RESTORE_MAJOR" =~ ^pg_restore[[:space:]]\(PostgreSQL\)[[:space:]]17\. ]] ||
 block "DISPOSABLE_SUPABASE_PG_RESTORE_VERSION_MISMATCH"
# The original custom dump can omit PostgreSQL's PINNED default public
# schema, which template1 already provides. Do not drop it blindly.
PUBLIC_IN_ARCHIVE="$(node --input-type=module - "$PRIVATE/toc" <<'NODE'
import {readFileSync} from "node:fs";
import {archiveDefinesSchema} from "./scripts/ops/legacy-restore-schema-bootstrap.mjs";
console.log(archiveDefinesSchema(readFileSync(process.argv[2],"utf8"),"public")?"1":"0");
NODE
)" || block "PRIVATE_ARCHIVE_SCHEMA_PLAN_UNAVAILABLE"
[[ "$PUBLIC_IN_ARCHIVE" == 0 || "$PUBLIC_IN_ARCHIVE" == 1 ]] ||
 block "PRIVATE_ARCHIVE_PUBLIC_SCHEMA_PLAN_INVALID"
# There is never a remote address in the restore target or administrative URL.
LOCAL_RESTORE_URL="postgresql://postgres:postgres@127.0.0.1:54322/geomacro_legacy_restored"
[[ "$LOCAL_RESTORE_URL" == "postgresql://postgres:postgres@127.0.0.1:54322/geomacro_legacy_restored" ]] ||
 block "DISPOSABLE_LOCAL_TARGET_IDENTITY_MISMATCH"
declare -a BOOTSTRAP_SCHEMAS=()
RESTORED=0
# Retry at most 4 isolated local DBs while reusing THE SAME previously
# downloaded and SHA-verified B2 archive. Zero extra B2 reads/puts.
for ATTEMPT in 0 1 2 3; do
  if (( ATTEMPT>0 ));then
    psql "$URL" -X -q -v ON_ERROR_STOP=1 \
      -c 'DROP DATABASE geomacro_legacy_restored WITH (FORCE);' \
      >"$PRIVATE/drop-local-db.stdout" 2>"$PRIVATE/drop-local-db.stderr" ||
      block "DISPOSABLE_LOCAL_RETRY_RESET_FAILED"
  fi
  psql "$URL" -X -q -v ON_ERROR_STOP=1 \
    -c 'CREATE DATABASE geomacro_legacy_restored;' \
    >"$PRIVATE/createdb.out" 2>"$PRIVATE/createdb.err" ||
    block "DISPOSABLE_TARGET_DB_CREATE_FAILED"
  if [[ "$PUBLIC_IN_ARCHIVE" == "1" ]];then
    psql "$LOCAL_RESTORE_URL" -X -q -v ON_ERROR_STOP=1 \
      -c 'DROP SCHEMA IF EXISTS public CASCADE;' \
      >"$PRIVATE/drop-default-public.stdout" 2>"$PRIVATE/drop-default-public.stderr" ||
      block "DISPOSABLE_DEFAULT_PUBLIC_SCHEMA_RESET_FAILED"
  fi
  for SCHEMA_NAME in "${BOOTSTRAP_SCHEMAS[@]}";do
    [[ "$SCHEMA_NAME" =~ ^(public|auth|storage|extensions|vault|graphql|graphql_public|pgbouncer|realtime|supabase_migrations)$ ]] ||
       block "RESTORE_SCHEMA_BOOTSTRAP_NOT_ALLOWED"
    psql "$LOCAL_RESTORE_URL" -X -q -v ON_ERROR_STOP=1 \
      -c "CREATE SCHEMA \"$SCHEMA_NAME\";" \
      >"$PRIVATE/bootstrap.stdout" 2>"$PRIVATE/bootstrap.stderr" ||
       block "DISPOSABLE_WHITELISTED_SCHEMA_BOOTSTRAP_FAILED"
  done
  # Uses only the disposable Docker PG17 Unix socket, never the old hosted URL.
  if docker exec -i "$LOCAL_DB_CONTAINER" \
      pg_restore -U supabase_admin -d geomacro_legacy_restored \
      --no-owner --no-privileges --exit-on-error \
      <"$PRIVATE/verified-old-primary.pgcustom" \
      >"$PRIVATE/restore.stdout" 2>"$PRIVATE/restore.stderr";then
    RESTORED=1
    break
  fi
  if (( ATTEMPT==3 ));then
    block "DISPOSABLE_INDEPENDENT_PHYSICAL_RESTORE_FAILED"
  fi
  NEXT_SCHEMA="$(node --input-type=module - "$PRIVATE/restore.stderr" "$PRIVATE/toc" "${BOOTSTRAP_SCHEMAS[@]}" <<'NODE'
import {readFileSync} from "node:fs";
import {privateMissingSchema} from "./scripts/ops/legacy-restore-schema-bootstrap.mjs";
const [errorPath,tocPath,...seen]=process.argv.slice(2);
const next=privateMissingSchema(readFileSync(errorPath,"utf8"),readFileSync(tocPath,"utf8"),seen);
if(next)process.stdout.write(next);
NODE
)" || block "PRIVATE_RESTORE_SCHEMA_DIAGNOSTIC_FAILED"
  [[ -n "$NEXT_SCHEMA" ]] || block "DISPOSABLE_INDEPENDENT_PHYSICAL_RESTORE_FAILED"
  BOOTSTRAP_SCHEMAS+=("$NEXT_SCHEMA")
done
[[ "$RESTORED" == "1" ]] || block "DISPOSABLE_INDEPENDENT_PHYSICAL_RESTORE_FAILED"
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
# Compare exact historical ledger row content, never print rows or private hashes.
[[ -n "${SUPABASE_DB_URL:-}" ]] || block "OLD_COMMERCIAL_SOURCE_DB_URL_MISSING"
node - "$SUPABASE_DB_URL" <<'NODE' || block "OLD_COMMERCIAL_SOURCE_DB_IDENTITY_INVALID"
const u=new URL(process.argv[2]);
const ref="ldpwajisioljyjtojvfx";
if(!["postgres:","postgresql:"].includes(u.protocol)||u.pathname!=="/postgres"||
 !(u.hostname==="db."+ref+".supabase.co"&&u.username==="postgres"||
   u.hostname.endsWith(".pooler.supabase.com")&&decodeURIComponent(u.username)==="postgres."+ref))
 process.exit(3);
NODE
COMMERCIAL_TABLES=(
 agent_payments commercial_credit_accounts commercial_credit_usage
 commercial_entitlement_grants commercial_payment_events
 early_warning_distribution_receipts live_source_endpoint_disposition_ledger
 private_commercial_revenue_delivery_ledger testnet_usdc_payment_claims
)
MATCHED=0
for TABLE in "${COMMERCIAL_TABLES[@]}";do
 [[ "$TABLE" =~ ^[a-z_]+$ ]] || block "LEGACY_COMMERCIAL_TABLE_IDENTIFIER_INVALID"
 QUERY="SELECT to_jsonb(t)::text FROM public.$TABLE AS t ORDER BY to_jsonb(t)::text;"
 psql "$SUPABASE_DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "$QUERY" \
   >"$PRIVATE/old-ledger" 2>"$PRIVATE/old-ledger.err" ||
   block "OLD_COMMERCIAL_LEDGER_READ_ONLY_SELECT_FAILED"
 psql "$LOCAL_RESTORE_URL" -X -qAt -v ON_ERROR_STOP=1 -c "$QUERY" \
   >"$PRIVATE/restored-ledger" 2>"$PRIVATE/restored-ledger.err" ||
   block "RESTORED_COMMERCIAL_LEDGER_SELECT_FAILED"
 cmp -s "$PRIVATE/old-ledger" "$PRIVATE/restored-ledger" ||
   block "LEGACY_COMMERCIAL_SNAPSHOT_CONTENT_MISMATCH"
 MATCHED=$((MATCHED+1))
done
[[ "$MATCHED" -eq 9 ]] || block "LEGACY_COMMERCIAL_ROW_RECONCILIATION_INCOMPLETE"
reason="B2_DB_INDEPENDENT_LOCAL_RESTORE_VERIFIED"
write_receipt "$STRUCTURED" "$STORAGE" "$PAYMENTS" "$RISK" "" "" "$MATCHED"
