#!/usr/bin/env bash
# A-G protected canary. Run only via workflow with owner and GitHub environment approval.
set -Eeuo pipefail
umask 077
: "${CLOUDFLARE_API_TOKEN:?}" "${CLOUDFLARE_ACCOUNT_ID:?}" "${D1_DATABASE_ID:?}"
: "${GITHUB_SHA:?}" "${CONTROL_PLANE_TOKEN:?}" "${GEOMACRO_CUSTOMER_SSR_TOKEN:?}"
: "${BASE_VERSION_ID:?}" "${CANARY_OWNER_APPROVAL:?}"
[[ "$CANARY_OWNER_APPROVAL" == "APPROVE_PHASE1_PART01_02_NO_FUNDS" ]] || exit 20
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ ]] || exit 21
[[ -f config/d1-hotspot-v2-canary.hold ]] || { echo 'CANARY_HOLD_MUST_REMAIN'; exit 22; }
[[ "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]] || exit 23
[[ "$(git branch --show-current)" == 'main' || -n "${GITHUB_ACTIONS:-}" ]] || exit 24
ROOT="$PWD"
TEMP="$(mktemp -d)"
mkdir -p artifacts/phase1-canary
trap 'rm -rf "$TEMP"' EXIT
CF=(npx -y wrangler@4.136.3)
CFG="$ROOT/workers/control-plane/wrangler.runtime.jsonc"
DB=geomacro-control-plane
BASE="$BASE_VERSION_ID"
NEW=''
DEPLOYED=0
rollback(){
 local ec=$?
 [[ "$ec" -gt 0 ]] || ec=1
 trap - ERR INT TERM
 if [[ "$DEPLOYED" == 1 && -n "$NEW" ]]; then
  echo 'CANARY_FAILURE: rolling Worker traffic back to prior 100% version' >&2
  (cd workers/control-plane && "${CF[@]}" versions deploy "${BASE}@100%" --yes --config "$CFG" \
    --message 'GeoMacro Phase1 automatic safety rollback') || echo 'ROLLBACK_FAILED_MANUAL_ACTION_REQUIRED' >&2
 fi
 exit "$ec"
}
trap rollback ERR INT TERM

echo 'Stage A: protected Worker snapshot and D1 Time Travel bookmark'
node scripts/ops/phase1-writer-integration-gate.mjs
node scripts/ops/phase1-config.mjs
(cd workers/control-plane && "${CF[@]}" deployments list --json --config "$CFG") > "$TEMP/deployments.json"
CURRENT="$(node scripts/ops/phase1-parse-wrangler.mjs current "$TEMP/deployments.json")"
[[ "$CURRENT" == "$BASE" ]] || { echo 'BASELINE_WORKER_VERSION_MISMATCH'; exit 25; }
(cd workers/control-plane && "${CF[@]}" versions view "$BASE" --json --config "$CFG") > "$TEMP/worker-snapshot.json"
(cd workers/control-plane && "${CF[@]}" d1 info "$DB" --json --config "$CFG") > "$TEMP/d1-info.json"
node -e 'const d=require(process.argv[1]);if(d.version!=="production")throw Error("D1_TIME_TRAVEL_BACKEND_NOT_PROVEN")' "$TEMP/d1-info.json"
(cd workers/control-plane && "${CF[@]}" d1 time-travel info "$DB" --json --config "$CFG") > "$TEMP/d1-bookmark.json"
node -e 'const d=require(process.argv[1]);if(!JSON.stringify(d).match(/[0-9a-f]{8}-[0-9a-f-]{30,}/i))throw Error("D1_BACKUP_BOOKMARK_MISSING")' "$TEMP/d1-bookmark.json"
sha256sum "$TEMP/worker-snapshot.json" "$TEMP/d1-bookmark.json" | sed "s#$TEMP/##"
node -e '''const fs=require("node:fs"),c=require("node:crypto");
const [snapshot,bookmark,out]=process.argv.slice(1);
const json=JSON.parse(fs.readFileSync(bookmark,"utf8"));
const sha=p=>c.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
fs.writeFileSync(out,JSON.stringify({schema:"geomacro.phase1.backup-point.v1",
 checked_at:new Date().toISOString(),release_sha:process.env.GITHUB_SHA,
 previous_worker_version:process.env.BASE_VERSION_ID,
 worker_snapshot_sha256:sha(snapshot),d1_time_travel_info_sha256:sha(bookmark),
 d1_time_travel_info:json,auto_d1_restore_permitted:false},null,2),{mode:0o600});''' \
 "$TEMP/worker-snapshot.json" "$TEMP/d1-bookmark.json" \
 artifacts/phase1-canary/backup-point.json
node scripts/ops/phase1-provider-check.mjs

echo 'Stage B: 0204 + 0205 migrations and schema readback'
(cd workers/control-plane && "${CF[@]}" d1 migrations list "$DB" --remote --config "$CFG") > "$TEMP/pending.txt"
grep -Fq '0205_d1_internal_soft_budget.sql' "$TEMP/pending.txt" || {
 echo 'D1_PENDING_MIGRATION_FORMAT_OR_ALREADY_APPLIED_REQUIRES_OPERATOR_REVIEW'; exit 26;
}
if grep -Eo '[0-9]{4}_[a-zA-Z0-9_-]+\.sql' "$TEMP/pending.txt" | \
   grep -Ev '^(0204_d1_read_hotspot_optimization|0205_d1_internal_soft_budget)\.sql$' >/dev/null; then
 echo 'UNREVIEWED_PENDING_MIGRATION_BLOCKS_CANARY'; exit 26
fi
(cd workers/control-plane && "${CF[@]}" d1 migrations apply "$DB" --remote --config "$CFG")
SQL="SELECT name FROM sqlite_master WHERE name IN ('materialized_cache','idx_private_osint_country_category_clock_v2','idx_private_osint_check_category_status_v2','idx_website_derived_hot_order_v2','geomacro_d1_soft_write_budget')"
(cd workers/control-plane && "${CF[@]}" d1 execute "$DB" --remote --json --config "$CFG" --command "$SQL") > "$TEMP/schema.json"
node scripts/ops/phase1-parse-wrangler.mjs schema "$TEMP/schema.json"

echo 'Stage C: upload reviewed Worker (not deployed)'
TAG="phase1-${GITHUB_SHA:0:12}"
(cd workers/control-plane && "${CF[@]}" versions upload --tag "$TAG" --message "Phase1 ${GITHUB_SHA} no-funds" --config "$CFG") > "$TEMP/upload.log"
(cd workers/control-plane && "${CF[@]}" versions list --json --config "$CFG") > "$TEMP/versions.json"
NEW="$(node scripts/ops/phase1-parse-wrangler.mjs uploaded "$TEMP/versions.json" "$TAG")"
export NEW_VERSION_ID="$NEW"
echo "CANDIDATE_VERSION_ID=$NEW"

echo 'Stage D: 0% candidate, version-targeted authenticated smoke'
(cd workers/control-plane && "${CF[@]}" versions deploy "${BASE}@100%" "${NEW}@0%" --yes --config "$CFG")
DEPLOYED=1
SMOKE_SCOPE=canary node scripts/ops/phase1-verify.mjs

echo 'Stage E: protected CQRS warm and one-row readback'
node scripts/ops/phase1-provider-check.mjs
SMOKE_SCOPE=warm node scripts/ops/phase1-verify.mjs
SQL="SELECT count(*) AS n, max(updated_at) AS updated_at, max(length(payload)) AS bytes FROM materialized_cache WHERE key='public_derived_news_hot50'"
(cd workers/control-plane && "${CF[@]}" d1 execute "$DB" --remote --json --config "$CFG" --command "$SQL") > "$TEMP/cqrs.json"
node -e 'const d=require(process.argv[1]);const a=(Array.isArray(d)?d:[d]).flatMap(x=>x?.results??[]);const x=a[0];if(Number(x?.n)!==1||Number(x?.bytes)<2||Date.now()-Number(x?.updated_at)>660000)throw Error("CQRS_WARM_READBACK_FAILED")' "$TEMP/cqrs.json"

echo 'Stage F: incremental ramp, provider metrics, automatic rollback on failure'
for PERCENT in 1 5 25 50 100; do
 node scripts/ops/phase1-provider-check.mjs
 OLD_PCT=$((100-PERCENT))
 if [[ "$PERCENT" == 100 ]]; then
  (cd workers/control-plane && "${CF[@]}" versions deploy "${NEW}@100%" --yes --config "$CFG")
 else
  (cd workers/control-plane && "${CF[@]}" versions deploy "${BASE}@${OLD_PCT}%" "${NEW}@${PERCENT}%" --yes --config "$CFG")
 fi
 SMOKE_SCOPE=canary node scripts/ops/phase1-verify.mjs
 sleep "${CANARY_OBSERVATION_SECONDS:-600}"
 node scripts/ops/phase1-workers-telemetry.mjs
 echo "CANARY_RAMP_ACCEPTED=${PERCENT}%"
done

echo 'Stage G: exact Worker SHA, D1 quota, schema and release readback'
(cd workers/control-plane && "${CF[@]}" deployments list --json --config "$CFG") > "$TEMP/final-deployments.json"
FINAL="$(node scripts/ops/phase1-parse-wrangler.mjs current "$TEMP/final-deployments.json")"
[[ "$FINAL" == "$NEW" ]] || { echo 'FINAL_WORKER_VERSION_PARITY_FAILED'; false; }
node scripts/ops/phase1-provider-check.mjs
SMOKE_SCOPE=canary node scripts/ops/phase1-verify.mjs
(cd workers/control-plane && "${CF[@]}" d1 execute "$DB" --remote --json --config "$CFG" --command "$SQL") > "$TEMP/final-readback.json"
[[ -f config/d1-hotspot-v2-canary.hold ]] || { echo 'RELEASE_HOLD_REMOVED_UNSAFELY'; false; }
printf 'PHASE1_PROTECTED_WORKER_ACCEPTED sha=%s worker_version=%s migrations=0204,0205 payment_locked=TRUE\n' "$GITHUB_SHA" "$NEW"
printf '{"schema":"geomacro.phase1.acceptance.v1","release_sha":"%s","base_version":"%s","worker_version":"%s","traffic_percent":100,"funds_enabled":false}\n' \
  "$GITHUB_SHA" "$BASE" "$NEW" > artifacts/phase1-canary/final-receipt.json
