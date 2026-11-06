# GeoMacro Master Audit #3634 — protected Phase 1 (Parts 01 and 02)

**Status: IMPLEMENTATION PACKAGE, NOT A PRODUCTION PASS.** The source readback and
unit tests were inspected offline. No Cloudflare D1 migration, version upload,
canary, billing receipt, production quota readback or GitHub PR has been executed
by producing this package. `config/d1-hotspot-v2-canary.hold` remains mandatory.

Target repository: `https://github.com/blocknine0/geomacro`, exact inspected
baseline 2026-11-06 SHA `9e196a4535ac73b9fcac87745e6494be4c7f9b99`.
Existing public CQRS code, 0033 and migration 0204 were already on `main`.
Existing `deploy-d1-control-plane.yml` must retain its independent hold gate.
The 0204 file here is an exact copy, not a new migration.

## Files / purpose

| Path | Purpose |
|---|---|
| `scripts/ops/d1-paid-envelope.mjs` | Strict Paid provider proof and GeoMacro 18M-read/180k-write UTC policy, bounded 50-original admission planning; not a provider daily Paid quota. |
| `scripts/ops/apply-phase1-patch.mjs` | Idempotent, exact-anchor edit of existing 37k planner and the protected CQRS-refresh and `/health` readback routes. Refuses code drift. |
| `workers/control-plane/migrations/0204_d1_read_hotspot_optimization.sql` | Existing schema: single-row CQRS and covering/keyset/ordered indexes. |
| `workers/control-plane/migrations/0205_d1_internal_soft_budget.sql` | New additive per-UTC-day atomic write-reservation table. |
| `workers/control-plane/src/d1-soft-budget.mjs` | Shared atomic D1 reservation helper, bounded transactional batches, strict 2-minute provider-metric freshness. |
| `config/phase1-writer-integration.json` | Initially HELD: every D1 write family must be audited and integrated before rollout. |
| `scripts/ops/phase1-writer-integration-gate.mjs` | Mandatory fail-closed, exact-hash integration verifier for every inventoried producer. |
| `scripts/ops/phase1-config.mjs` | Generates final reviewed Worker Wrangler config from existing template. Exact config SHA required for deployment. |
| `scripts/ops/phase1-provider-check.mjs` | Read-only Cloudflare Paid billing/spend policies + account-wide D1 GraphQL budget gate. |
| `scripts/ops/phase1-canary.sh` | Stages A–G, Time Travel point, 0204/0205 readback, 0%-traffic smoke, CQRS warm, 1/5/25/50/100 ramp, rollback to base. |
| `scripts/ops/phase1-verify.mjs` | Version-override API smoke: exact commit, auth denial, signing readiness/key, locked payment runtime, public CQRS. |
| `scripts/ops/phase1-workers-telemetry.mjs` | Per-version real traffic and error-rate gate (holds if telemetry unavailable). |
| `.github/workflows/geomacro-phase1-protected-canary.yml` | Manual release requires owner input, `production` environment approval, latest `main`, exact SHA; never starts automatically. |
| `.github/workflows/geomacro-phase1-d1-budget-watch.yml` | Read-only 15-minute D1 budget monitoring; errors raise workflow failure, not automatic billing stops. |
| `scripts/tests/phase1-paid-canary.test.mjs` | Offline Paid-vs-Free, 192823 hold, provider evidence expiry, reservation tests. |

## IMPORTANT: Do not treat the provided inventory manifest as an approval

The repository's current independent D1 writers have **not** been proven to
share one atomic governor. 0205 only provides an atomic counter for writers
using the same D1 database; it is NOT a universal cross-database or cross-account
transaction. All producers (ingestion, retry, PREDGE, cache, user events,
archive ACK, backfills, scheduled jobs, other Workers/databases, and maintenance)
must be inventoried, integrated, proven under concurrency, and reviewed.
The package intentionally ships `account_wide_governor_verified=false`, so CI
stops **before cloud mutations**. No documentation-only toggle is acceptable.

Example integration inside a D1 producer (the provider usage snapshot must be
freshly authenticated and must cover *all* databases):

```js
import {admittedBoundedD1Batch} from './d1-soft-budget.mjs';
const result = await admittedBoundedD1Batch(env.DB, statements, {
  dayUtc: new Date().toISOString().slice(0,10),
  providerObserved: verifiedCloudflareAccountSnapshot.observed_rows_written,
  observedAt: freshProviderSampleTakenAt.toISOString(), // observed immediately after authenticated query
  estimatedPhysicalRows: 52, // conservative worst-case rows for these SQL statements
});
```

This is a wiring example, not proof that the existing producers already use the
helper. Do not reuse snapshots across UTC day boundaries; do not use this
helper without authentic account-wide provider telemetry. Prevent ungoverned
writers at the job dispatch layer. If different D1 databases remain, use a
single Worker coordination service/strongly consistent governor and have
all writes synchronously obtain permits, or keep the release held. Since billing
telemetry is delayed, maintain a reserve and allow for external writes; **no
software-only universal hard 180k/day guarantee** is possible with independent
uncontrolled producers.

For CQRS, reuse existing `hot50-materialized-news.mjs`: on a public GET do one
PK lookup; cron refresh uses 0033 revision fences. A 10-minute refresh that
rewrites identical payloads is an amplification bug to address if required by
measured `.meta.rows_written`; a producer ACK never proves cache parity alone.

## Integrate into the authoritative repository (reviewed branch)

```bash
# Work from a clean, reviewed, up-to-date main checkout of blocknine0/geomacro.
# The package file tree is relative to repo root. Copy these files in;
# the already-existing 0204 file must be byte-for-byte identical.
rsync -a geomacro-phase1-parts01-02/ /path/to/geomacro/
cd /path/to/geomacro
cmp workers/control-plane/migrations/0204_d1_read_hotspot_optimization.sql \
    /path/to/original-0204-copy.sql # when available
node scripts/ops/apply-phase1-patch.mjs
node --test scripts/tests/phase1-paid-canary.test.mjs \
  scripts/tests/d1-read-hotspot-v2.test.mjs
node scripts/ops/phase1-writer-integration-gate.mjs  # EXPECTED HOLD until integration complete
# Audit and integrate all writers, then populate manifest with exact source hashes.
git diff --check
git diff
# Open reviewed PR; do NOT remove config/d1-hotspot-v2-canary.hold.
```

Do not directly execute a new canary workflow from an unreviewed branch. CI
checks the patcher is idempotent (`git diff --exit-code`).

## Preflight reviewed config, secrets and approval

The verified existing file is `workers/control-plane/wrangler.example.jsonc`,
not an imaginary `wrangler.toml`. Inspect its triggers, bindings, routes, public
key pins, optional R2/KV/B2/Queues, and payment flags relative to the actual
live Worker; a template can omit deployed bindings. Do not proceed unless all
are explicitly reconciled. `phase1-config.mjs` builds the candidate config and
requires a reviewer-supplied SHA-256 to match its exact bytes.

```bash
export GITHUB_SHA="$(git rev-parse main)"
export D1_DATABASE_ID='existing-production-d1-uuid'
node scripts/ops/phase1-config.mjs --preview
# Review the full printed config. Save the displayed digest into GitHub's
# GEOMACRO_REVIEWED_CANARY_CONFIG_SHA256 secret (production environment).
# Do NOT place private keys in wrangler vars or the repository.
```

Set required GitHub secrets in protected `production` environment:
`CLOUDFLARE_API_TOKEN` (scoped Worker/D1/analytics permissions),
`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_BILLING_READ_TOKEN`,
`GEOMACRO_CONTROL_PLANE_D1_DATABASE_ID`, `CONTROL_PLANE_TOKEN`,
`GEOMACRO_CUSTOMER_SSR_TOKEN`, and reviewed config digest. Configure mandatory
human reviewers (no self-review) and prevent branch bypass. The chosen Worker
version must be a known, healthy **100%** deployed baseline, read with:

```bash
cd workers/control-plane
npx -y wrangler@4.136.3 deployments list --json --config wrangler.runtime.jsonc
npx -y wrangler@4.136.3 versions list --json --config wrangler.runtime.jsonc
npx -y wrangler@4.136.3 d1 time-travel info geomacro-control-plane --json --config wrangler.runtime.jsonc
```

`wrangler.runtime.jsonc` is generated locally with reviewed `GITHUB_SHA`, `D1_DATABASE_ID`,
and digest. Do not store tokens or secrets in the config file. Input confirmed
base Worker version UUID manually in GitHub Actions dispatch. No auto-release
and **no** payment authorization.

## Stages A–G acceptance

- A: compare base version to actual deployment, capture version JSON hash and
  D1 production Time Travel bookmark, record provider budget.
- B: refuse unrelated pending migrations, apply 0204/0205 remotely, read back
  table/index names (migration is additive; schema rollback requires review).
- C: `wrangler versions upload` without production traffic.
- D: deploy candidate at 0%, authenticate smoke with version override header;
  health must return new source SHA and runtime flags.
- E: protected CQRS producer ACK + single-row physical DB readback.
- F: 1/5/25/50/100 percent gradual deployments with per-step D1 provider
  preflight, signed/auth/payment-lock smoke, real error-rate and traffic counts.
- G: full version hash parity, provider D1 budget recheck and release parity.

Automatic rollback restores Worker **traffic** to the saved 100% version on
failure after Stage D; it does not destructively Time Travel the D1 database.
Time Travel restore overwrites newer data and must require explicit operator
approval and reconciliation. Cloudflare version rollback does not undo D1
migrations or archive writes. The hold stays in Git permanently until a
separately reviewed acceptance PR.

**Manual execute in GitHub:** Actions > GeoMacro Phase 1 Parts 01-02 Protected
Canary > Run workflow on main, fill exact SHA, baseline version UUID and
`APPROVE_PHASE1_PART01_02_NO_FUNDS`; the protected production environment
must also approve. Make sure current UTC provider reads/writes are under internal
limits. With a 192,823-row observation the preflight correctly HOLDs.

## Independent read-only post-release commands

```bash
node scripts/ops/phase1-provider-check.mjs
cd workers/control-plane
npx -y wrangler@4.136.3 deployments list --json --config wrangler.runtime.jsonc
npx -y wrangler@4.136.3 d1 execute geomacro-control-plane --remote --json \
  --config wrangler.runtime.jsonc \
  --command="SELECT name FROM sqlite_master WHERE name IN ('materialized_cache','geomacro_d1_soft_write_budget','idx_private_osint_country_category_clock_v2','idx_private_osint_check_category_status_v2','idx_website_derived_hot_order_v2');"
npx -y wrangler@4.136.3 d1 execute geomacro-control-plane --remote --json \
  --config wrangler.runtime.jsonc \
  --command="EXPLAIN QUERY PLAN SELECT payload,updated_at FROM materialized_cache WHERE key='public_derived_news_hot50' LIMIT 1;"
npx -y wrangler@4.136.3 d1 insights --time-period=1d --sort-by=reads --sort-type=sum --limit=100 --json
# Runtime Worker meta.rows_read / meta.rows_written (not EXPLAIN alone),
# full GitHub run link, rollback proof, B2 and D1 parity, must also be reviewed.
```

## Financial and product controls

Workers Paid D1 currently includes 25 billion reads/mo and 50 million writes/mo.
180k rows written/day is an internal operational budget; not a Cloudflare hard
quota or guaranteed $5 invoice maximum. The 1-cent Workers/DO spend block
does not block D1, KV, Queues, R2, or Backblaze B2. 0205 and 15-minute observer
are defense-in-depth only. Existing production funds are not authorized;
no checkout, paid credit issuance, PayPal or crypto settlement activated.

Reference docs:
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/reference/time-travel/
- https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/
- https://developers.cloudflare.com/workers/wrangler/commands/workers/