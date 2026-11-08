# GeoMacro Step 3 V2 — Durable recovery, shadow rehearsal and protected Step 4

**State as of 8 Nov 2026:** IMPLEMENTATION UNDER REVIEW, PROVIDER
REHEARSAL **NOT_YET_VERIFIED**, PRODUCTION MIGRATION **HOLD**.
All documentation below is a **runbook**, never permission to turn on funds,
bypass D1 governance, remove the production HOLD, or interrupt Hot50
geopolitics/macro/minerals ingestion, B2 archive, customer APIs or signing.

## Safety prerequisites

- **Hard owner envelope:** current UTC day, account-wide Cloudflare
  GraphQL rows_read and rows_written individually **< 60,000** before
  each migration step; reserve >=80,000 against each separate 140,000
  owner soft target. Metrics are DELAYED, not atomic reservations.
- Production scheduler PR #3729 originally checks out legacy Step3
  `3c8fe6a51c8b34aa75d43ab0c77e5395d3fe16f2`.
  Safety PR #3731 adds mandatory V2 module/key checks, so this old pin
  is **HOLD** even if `GEOMACRO_STEP3_NOV9_ARMED=YES`.
  Never delete these guards. After shadow COMPLETE PASS, review/merge
  a separate PR updating the workflow to the **exact accepted V2 SHA**.
- D1 Time Travel: retrieval is GET
  `/accounts/{account}/d1/database/{db_uuid}/time_travel/bookmark`.
  Bookmarks have Cloudflare's service retention window; a long-lived
  encrypted manifest is NOT a long-lived D1 snapshot. Cloudflare
  recovery to an older point can destroy subsequent genuine writes;
  restoration requires an independent owner review + safe B2 journal replay.
- No raw bookmark in output, GitHub logs, plaintext file, artifact, or PR.
  The only ciphertext backup and signed recovery manifest are in private R2.
- Keep `GEOMACRO_PHASE2H_REF_ONLY_V1=0` (or absent) in BOTH
  production Worker versions during concurrent canary. Old Worker
  cannot read NEW reference-only IDs; pointer-only write cutover belongs
  to a later CONTRACT phase once rollback no longer depends on old code.

## Operator credentials and isolated R2 bucket

Provision a **PRIVATE** bucket (no public R2.dev / domain access),
with restricted R2 object read/write privileges to the recovery prefix
and retention for protected migration recovery. Minimize S3/R2
cost by one checkpoint per approved migration attempt and avoid LIST loops.

In GitHub `production` environment, configure *only the owner*:

| Variable or secret | Required | Purpose |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | existing secret | identity |
| `CLOUDFLARE_API_TOKEN` | existing secret; verify D1 Read + R2 Object Read/Write | native provider metadata/data |
| `D1_DATABASE_ID` | existing | production canonical |
| `GEOMACRO_D1_SHADOW_DATABASE_ID` | existing, distinct | dedicated shadow |
| `GEOMACRO_D1_RECOVERY_AES256_KEY_B64` | **NEW secret, 32 CSPRNG bytes base64** | AES-256-GCM data key |
| `GEOMACRO_D1_RECOVERY_R2_BUCKET` | **NEW variable**, private existing bucket name | recovery object store |
| `GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED` | **NEW variable**, `YES` after independent private policy review | explicit owner acceptance |
| `SIGNING_JWK` | protected secret | Ed25519 or ES256 signer, never log |
| `CONTROL_PLANE_TOKEN` | protected secret | real authenticated root Worker reader |
| `PHASE2H_R2_REFERENCE_HMAC_KEY` | protected secret, 64 hexadecimal chars | actual Phase2H pointer HMAC key |
| `GEOMACRO_STEP3_VERIFIED_WORKER_HOST` | `api.geomacro.live` | canonical protected reader |
| `GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST` | restricted `geomacro-step3-shadow.<account>.workers.dev` | MUST bind isolated shadow D1 |
| `GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED` | `YES` only after representative shadow dataset and bound Worker confirmed | shadow writes only |
| `GEOMACRO_STEP3_SHADOW_POINTER_SEED_APPROVED` | `YES` only for the isolated shadow | real previously B2-ACKnowledged shadow original to private R2 pointer |
| `GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET` | dedicated PRIVATE shadow R2 bucket | must match shadow Worker's `PHASE2H_PRIVATE_R2` binding |
| `GEOMACRO_STEP3_RECOVERY_V2_APPROVED` | keep `NO` until **full** provider shadow rehearsal | protected production admission |
| `GEOMACRO_STEP3_NOV9_ARMED` | keep `NO` until **full** provider shadow rehearsal | one-time scheduled production run |

Generate the AES key locally using a trusted secure terminal:
```bash
node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64")+"\\n")'
```
Store it as a masked **Environment Secret**, not in repo or issue.
Never paste secret values into ChatGPT, a workflow parameter, logs or docs.
Maintain independently protected secret version and key recovery policy.

## Shadow preflight (no production SQL)

Checkout the exact V2 PR branch, no local edits:
```bash
git fetch origin fix/step3-durable-recovery-expand-contract-20261108
git switch fix/step3-durable-recovery-expand-contract-20261108
git pull --ff-only
node --check scripts/ops/run-step3-protected-d1-migrations.mjs
node --test scripts/tests/d1-step3-durable-recovery.test.mjs
node --test scripts/tests/d1-step3-dual-worker-expand-contract.test.mjs
node scripts/ops/run-step3-protected-d1-migrations.mjs --plan
```

Before allowing any D1 write, independently confirm:
- `geomacro-d1-publisher-shadow` UUID != production UUID;
- shadow has representative **already authorized** legacy schema,
  existing raw source rows/clock, spool, website, OSINT and real
  B2-archived observation. Do not copy private production records
  into shadow without explicit rights/security review.
- a separate shadow Worker version pair has actually been uploaded
  and bound to the SHADOW D1 UUID and shadow R2 binding/secret;
- current-day *account-wide* D1 headroom is within 60k in both dimensions.

The shadow-only runner command, with protected environment injected:
```bash
export GEOMACRO_STEP3_EXACT_SHA="$(git rev-parse HEAD)"
export GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED=YES
export GEOMACRO_D1_SHADOW_TARGET_APPROVED=YES
node scripts/ops/check-d1-headroom.mjs --check
node scripts/ops/run-step3-protected-d1-migrations.mjs --rehearse-shadow
```

Execution path: real named shadow UUID → bounded source baseline →
real Cloudflare Time Travel bookmark → AES-256-GCM encrypt IN MEMORY →
private R2 PUT/GET exact byte and SHA compare → signed manifest R2
PUT/GET verification → _geomacro_migration_ledger creation →
0204 → 0211 → 0212 → 0213 sequential native migrations, with
real archived-record validator, shadow private R2 bundle PUT/GET, D1
HMAC-bound pointer insert and exact SHA readback, then
actual D1 history, schema/index/counter integrity and immutable source
baseline check after each.

The runner emits:
`artifacts/release/step3-shadow-rehearsal-receipt.json`.
It signs this truthful receipt if the real SIGNING_JWK is configured.
**Even a successful shadow SQL sequence is NOT_YET_VERIFIED until
the two shadow Worker versions physically read/write after migration
and a real shadow-only rollback to baseline 100% is verified, and
independent B2 byte parity is established.** No synthetic test,
SQL object existence or signed receipt alone can grant PASS.

Stop immediately if any gate fails. It is prohibited to run
`--apply` against production while shadow report is not a fully
independent, cryptographically authenticated PASS.

## Expand/contract guarantee

- EXPAND: 0204, 0211, 0212, 0213 add only safe tables/indexes/triggers,
  preserve existing legacy `phase2h_private_raw_news.raw_json`.
- Dual-read: old Worker sees the existing D1 legacy row; new Worker
  supports exact authenticated HMAC-verified R2 reference, falling back
  to validated legacy D1 only if no pointer exists. Invalid pointer
  NEVER downgrades to legacy.
- Dual-write phase: both Worker versions keep writing existing legacy
  D1 format while canary <100%. New R2 pointer-only writes MUST stay OFF.
- Canary rollback: revert **Worker version traffic only**. Do not
  restore D1 schema as an automatic reaction; storage restoration can
  delete legitimate concurrent ingestion since the bookmark.
- CONTRACT: only after sustained 100% new Worker, independent 24h
  parity proof and a separate approved rollback strategy may legacy
  storage writes/dependencies be removed. Not in this PR.

## Native full Step3 production admission

Only after the *complete real* shadow rehearsal, key/restore
certification, B2 parity, provider headroom, reviewed V2 immutable
SHA and production environment authorization:

```bash
# On a protected runner with scoped existing secrets; NEVER paste keys:
export GEOMACRO_STEP3_EXACT_SHA="$(git rev-parse HEAD)"
export GEOMACRO_STEP3_APPLY=APPROVE_ONLY_0204_0211_0212_0213
export GEOMACRO_STEP3_RECOVERY_V2_APPROVED=YES
node scripts/ops/check-d1-headroom.mjs --check
node scripts/ops/run-step3-protected-d1-migrations.mjs --apply
```

Runbook's CLI commands are not a substitute for the approved
production GitHub Actions environment. The one-shot 9 Nov workflow must
first be revised to pin this exact **reviewed** V2 commit. It still has
strict clock windows and can skip if late; do not extend them
silently. Use this command to arm ONLY AFTER all gates:
```bash
gh variable set GEOMACRO_STEP3_RECOVERY_V2_APPROVED --body YES --repo blocknine0/geomacro
gh variable set GEOMACRO_STEP3_NOV9_ARMED --body YES --repo blocknine0/geomacro
```
If 9 Nov 2026 window is missed, require a new reviewed schedule/date,
fresh Cloudflare provider receipt and explicit owner approval.
Do not call old `3c8fe6a5...` runner as a replacement.

## Protected Step 4 canary

Draft PR #3730 aligns the existing protected canary promoter to
`0% → 1% (30m) → 5% → 25% → 50% → 100%`. Each stage requires
provider-confirmed exact baseline/candidate UUID split, queue/binding
parity, authenticated HMAC/R2+B2 byte parity, verified ingestion
freshness and signed data, same-UTC account-wide read/write envelope,
and no >5,800/hour provider-observed read/write spikes. The Cloudflare
GraphQL metrics are delayed; detection/rollback can only occur after
a spike is OBSERVED, not instantaneously at the first physical D1 row.

Worker API error >0.5% is a mandatory maximum; the current
controller's <0.1% threshold is deliberately stricter. Candidate
Worker wall-time p95 is not HTTP response latency p95; independent
HTTP latency proof is needed before final acceptance.

Use the already protected `.github/workflows/canary-promotion.yml`
with `operation=verify` first; **do not choose** `promote`
until Step3 actual receipt, separate 0214 schema, correct exact-main
candidate Worker bindings, B2/R2 parity, and independent source
continuity are verified.

During rollout any failed gate performs a single-version **100%
previous-baseline** deployment and provider GET readback. Leave
`config/d1-hotspot-v2-canary.hold` in GitHub main throughout
the complete canary. Release it in a separately reviewed PR only
after 100% live stability, independent full 24h D1
<140,000 read and <140,000 write physical counter proof, and B2
archive + Hot50 certified signed source evidence.

## Acceptance classification

| Evidence | Current status |
|---|---|
| Implemented offline code and tests | Eligible for code review only |
| Real shadow D1 migrations/ledger readback | NOT_YET_VERIFIED |
| Signed, encrypted R2 provider PUT/GET | NOT_YET_VERIFIED |
| HMAC pointer + exact real original bytes | NOT_YET_VERIFIED |
| Independent Backblaze B2 byte readback | NOT_YET_VERIFIED |
| Legacy + new shadow Worker read/write + rollback | NOT_YET_VERIFIED |
| Step3 production migration | HOLD |
| Step4 0-100% live rollout & final D1 consumption | NOT_EXECUTED |

Signature proves byte integrity, not underlying event truth,
independent source corroboration or commercial rights.
