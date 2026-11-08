# GeoMacro Step 3 — protected D1 shadow, 80k headroom gate and migrations 0204–0213

**Release state: DRAFT / HOLD; not executed against Cloudflare.**

This branch is an **offline-reviewable migration executor**, not permission
to merge PR #3725 or #3726 or to remove `config/d1-hotspot-v2-canary.hold`.
The user-approved scope is exactly **0204 -> 0211 -> 0212 -> 0213**.
Cloudflare D1 rows include index/trigger writes, not one write per SQL
statement. No source intake cron, authenticated API, live signer or B2 flow
is stopped.

## Required real Cloudflare provider resources

- A live scoped token with the minimum permissions needed for D1
  account GraphQL/metadata/queries/Time Travel/migrations, and the
  **true** 32-hex account ID.
- Production `geomacro-control-plane` UUID and **different**, independently
  provisioned and explicitly approved `geomacro-d1-publisher-shadow`
  UUID. The shadow script itself checks exact provider DB name/UUID.
- Actual current UTC **account-wide** GraphQL
  `d1AnalyticsAdaptiveGroups` (all database IDs). A screenshot or
  manually supplied value is not acceptable.
- Cloudflare D1 production backend supporting automatic Time Travel
  bookmarks (per provider API). Do not use a destructive restore to
  attempt to back up the DB.
- Existing protected SHA-pin + **clean** Git checkout and retained HOLD
  file. Staged 0212/0213 files are NOT copied into the canonical default
  migrations directory.
- Authenticated newly written private R2 reference HMAC/readback proof,
  once references actually exist. An empty 0213 table cannot prove
  that any signature has ever been checked.

## Local execution: exact commands

From the **reviewed, checked-out Step 3 commit**, with a clean tree.
Do not paste credentials into this document or the repository. Do not
use the production UUID as the shadow target.

```bash
cd ~/geomacro-delegation-main
git fetch origin
git switch perf/d1-step3-protected-headroom-shadow-20261108
git pull --ff-only origin perf/d1-step3-protected-headroom-shadow-20261108
git status --short
git rev-parse HEAD

# Zero-provider-cost contract and SHA-only migration plan
node --test scripts/tests/d1-step3-headroom.test.mjs \
  scripts/tests/d1-step3-protected-migration-contract.test.mjs \
  scripts/tests/d1-publisher-shadow-billable.test.mjs
node scripts/ops/run-step3-protected-d1-migrations.mjs --plan
node scripts/ops/verify-d1-publisher-billable-shadow.mjs --dry-run

# Export via SECURE SHELL variables; substitute actual values:
export CLOUDFLARE_ACCOUNT_ID='<your-account-id>'
export CLOUDFLARE_API_TOKEN='<scoped-cloudflare-token>'
export D1_DATABASE_ID='<geomacro-control-plane-prod-uuid>'
export GEOMACRO_D1_SHADOW_DATABASE_ID='<geomacro-d1-publisher-shadow-uuid>'
export GEOMACRO_D1_SHADOW_TARGET_APPROVED=YES

# Read-only authoritative account-wide current UTC headroom gate.
# Exits nonzero and emits MIGRATION_ACCOUNT_80K_HEADROOM_UNAVAILABLE
# if either counter reaches 60,000 or provider proof is unavailable.
node scripts/ops/check-d1-headroom.mjs --check
cat artifacts/release/d1-migration-headroom-current-utc.json

# Real provider shadow test ONLY if the gate just returned PASS:
node scripts/ops/verify-d1-publisher-billable-shadow.mjs --run-shadow
cat artifacts/release/d1-publisher-shadow-billable-rows.json

# Re-check headroom AFTER spending rows on the shadow itself:
node scripts/ops/check-d1-headroom.mjs --check

# Explicitly approve only the four named migrations on the exact SHA
# AFTER reviewing the plan, cost probes, current data/counters,
# R2 pointer readiness, and accessible Cloudflare Time Travel.
export GEOMACRO_STEP3_EXACT_SHA="$(git rev-parse HEAD)"
export GEOMACRO_STEP3_APPLY=APPROVE_ONLY_0204_0211_0212_0213

# This executor REPEATS the shadow test and does its own pre/post gates.
# Do not run it merely because an earlier shadow receipt exists:
# repeated shadow runs spend account-wide D1 rows.
node scripts/ops/run-step3-protected-d1-migrations.mjs --apply
cat artifacts/release/d1-step3-migration-execution.json
```

**Important:** The orchestrator executes its **own** shadow test and repeat
GraphQL gating. To avoid an unnecessary second shadow test, the standalone
`--run-shadow` command above is for independent proof/diagnosis; when the
one-step orchestrator is used, only `--dry-run` beforehand is necessary.
Any additional shadow run consumes real D1 allowance. All provider calls
are forbidden if the initial gate is HOLD.

The approved shadow script writes a real **native** provider JSON receipt to:

`artifacts/release/d1-publisher-shadow-billable-rows.json`

Required receipt fields:

- `metrics.bulk_50_first.rows_written > 0`;
- `metrics.bulk_50_identical_retry.rows_written === 0`;
- `metrics.one_changed_50.rows_written ===
   metrics.standalone_one_record_change.rows_written`;
- `conditional_batch_avoided_50_row_rewrite === true`;
- exact **50-record readback** and 50 separate baseline writes.

**Do not expect `rows_written === 1` for a changed record.** Cloudflare
counts updated index entries and the canonical revision-trigger row, too.

## UTC account headroom equation

For *all* D1 databases on the account and the **same UTC date**:

```text
max internal rows_read/day       = 140,000
max internal rows_written/day    = 140,000

requires observed rows_read      < 60,000
requires observed rows_written   < 60,000

therefore remaining rows_read    > 80,000
therefore remaining rows_written > 80,000
```

GraphQL metrics are non-atomic and may lag. The runner rechecks the provider
after shadow, before the bookmark, before **each** migration, and after each
migration. If provider response is missing, stale, ambiguous or an account
dimension reaches 60,000: **hard HOLD**. This is a migration-only gate, not
a worker deployment/customer availability or commercial payment authorization.

## Protected migration readback matrix

The runner writes **one** reviewed, hash-checked original SQL file to a
temporary migrations directory at a time, preserving Cloudflare's
`d1_migrations` history. It verifies pending history before and after each
`wrangler@4.136.3 d1 migrations apply DB --remote`.

| Migration | Source of truth | Required exact readback |
|---|---|---|
| 0204 | `workers/control-plane/migrations/0204_d1_read_hotspot_optimization.sql` | `materialized_cache` plus 3 named composite indexes, SQLite index-usage `EXPLAIN` and per-table `PRAGMA integrity_check` |
| 0211 | `workers/control-plane/migrations/0211_p0b_daily_committed_count.sql` | `p0b_committed_day_totals`, 3 associated triggers, exact seeded total against the original `ingestion_spool_queue`, per-table integrity |
| 0212 | `workers/control-plane/staged-migrations/0212_d1_keyset_hourly_pending_census.sql` | hourly pending table, 5 triggers, 2 indexes, `SUM(pending_count)` equals canonical pending raw count, index plans and integrity |
| 0213 | `workers/control-plane/staged-migrations/0213_phase2h_raw_ref_only_v1.sql` | private pointer table and 3 indexes, no raw JSON; actual rooted Worker HMAC+R2 exact-record proof if any pointers populated |

Before any index build or seed, **each affected existing source table
must have at most 3,000 rows**, proved by indexed/bounded
`EXISTS(SELECT 1 ... LIMIT 1 OFFSET 3000)` probes. This is intentionally
conservative against the owner's 140k-row internal cap. If a source
table exceeds 3,000, do not bypass the bound: replace the one-shot seed
with reviewed bounded incremental backfill and re-prove the cost.

Before and after migration, the runner computes a SHA-256 digest of the
same first 25 sorted immutable `(record_id,raw_sha256)` legacy originals;
it also verifies the provider's `rows_written===0` on all SQL readbacks.
Legitimate concurrent retention changes can cause the sample to differ:
that causes HOLD, **not** ingestion suspension or forced rollback.

Newly populated pointer rows are checked through the existing
authenticated internal exact-ID readback route. It verifies HMAC before
R2 fetch, exact SHA-256 content and legacy fallback boundaries. In the
**zero-pointer** case the schema may be correct but no live HMAC proof exists;
the overall result remains **HOLD**. Never invent a `PASS` for untested
cryptographic references.

## Backup, preservation and rollback

Immediately before the first migration, verify the production D1 backend
and retrieve:

```bash
npx -y wrangler@4.136.3 d1 info geomacro-control-plane --json
npx -y wrangler@4.136.3 d1 time-travel info geomacro-control-plane --json
```

Time Travel creates bookmarks automatically; the executor retains the
actual bookmark in a **local private mode-0600 file** and stores only
`backup_bookmark_sha256` in the public sanitized execution log. Keep the
private bookmark in durable owner-controlled storage. Cloudflare's
bookmark/timestamp remains available for its retention window. **No
automatic destructive Time Travel restore is ever invoked**; a restore
requires a separately authorized maintenance/recovery plan and may
cancel in-flight queries. <https://developers.cloudflare.com/d1/reference/time-travel/>

## Verifiable output / release discipline

- Provider shadow receipt:
  `artifacts/release/d1-publisher-shadow-billable-rows.json`
- Active UTC headroom preflight:
  `artifacts/release/d1-migration-headroom-current-utc.json`
- Sequential migration execution log:
  `artifacts/release/d1-step3-migration-execution.json`
- Local-only bookmark:
  `<private temporary directory>/pre-step3-bookmark.private.json`
- Offline-only CI plan via `d1-step3-protected-migration-contract.yml`.

**Acceptance must be explicit**
`post_migration_readback_explicit_PASS=true` AND `status=PASS`;
otherwise keep both PRs in draft, keep the release HOLD, leave original
source ingestion/B2 archival/signers/paid endpoints untouched.

No real Cloudflare account/shadow API is connected to this chat session:
the above live provider outputs and bookmark are **not yet generated**.
Do not claim application, shadow savings or a 60k/day production outcome
from offline CI.
