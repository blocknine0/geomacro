# GeoMacro — Step 2 selective D1 workload isolation and 60k/day headroom

## Release status

**STAGED / DRAFT / DO NOT PROMOTE until production provider proof.**
This is a stacked PR on Phase2H PR #3725. The existing D1 migration
0204–0211 protected checksum runner, deployed Workers, primary ingest cron
schedules, B2 archival, cryptographic signing, public endpoints and payments
are not modified by this PR. No scheduled source feed is disabled.

The owner target is **both account-wide Cloudflare D1 rows_read AND
rows_written <60,000 per complete UTC day**. This is an owner cost envelope,
not a documented Cloudflare provider plan quota. At least one complete UTC
day of genuine Cloudflare GraphQL usage and relevant D1 query fingerprints,
with source coverage and public-serving continuity proof, is required
before reporting PASS. 72h rolling observation is preferred. No success
claim follows solely from SQLite VM instruction counts or fewer SQL calls.

## Implemented selective actions

1. The daily Website archive -> canonical D1 reconcile
   (`website-finds-canonical-d1-reconcile.yml`, 01:40 UTC)
   uses **zero-D1 GitHub run/job-step metadata** to verify a recent
   actual successful catch-up step of the hourly primary publisher
   (`website-derived-news-continuity.yml`). If verified within
   150 minutes, only the optional daily repeat restore is skipped.
   Unknown/failed GitHub API, an old green workflow without the exact
   step, manual dispatch or an older publisher => run catch-up as before.
   Primary publisher, original-source jobs and any B2 archive remain ON.

2. GRO historical B2 ACK replay running every odd minute on the
   existing one-minute control-plane trigger is replaced by a
   **one-time full pass** after staged `0214` is safely applied.
   Completion lives in `gro_evidence_backfill_state.scan_complete`.
   Every new real B2 ACK still creates a `gro_evidence_jobs` row via
   unchanged `trg_phase2h_b2_archive_gro_enqueue`. The normal pending
   evidence tick continues every even minute, and the B2 archive reader,
   ACK, and GRO authenticity remain intact. Opt-in
   `GEOMACRO_GRO_BACKFILL_ONCE_V1=1` only after exact schema and
   independent source->job parity proofs.

3. Existing hourly account-wide D1 provider telemetry is reused:
   `d1-launch-hourly-observer.mjs` -> `step2-d1-headroom-telemetry.mjs`.
   No additional D1 query, no new cron, no invocation of a product API.
   The new receipt is appended to existing observatory artifacts.

4. `scripts/ops/step2-inventory-recurring-jobs.mjs` enumerates
   **every** `.github/workflows/*.yml` schedule plus all Worker
   Wrangler config crons and major control-plane subtasks.
   Run:
   `node scripts/ops/step2-inventory-recurring-jobs.mjs`.
   Machine-readable **complete** audit saved to
   `artifacts/release/step2-recurring-job-inventory.json`, companion
   human table to `artifacts/release/step2-recurring-job-inventory.md`.
   GitHub PR offline-contract uploads both as run artifacts.

## Audited primary cadence / action / expected D1 savings

| Task | Previously scheduled cadence | Step2 action | D1 rows expected to avoid **per day** |
|---|---|---|---|
| Cloudflare `geomacro-control-plane` | Every minute | KEEP Worker trigger and main source dispatch | 0 directly |
| P1 fanout / P0-A source polling | Every minute (within Worker) | KEEP ingestion | 0 |
| GRO archive evidence pending queue | Every 2 minutes (even) | KEEP B2 ACKed GRO processing | 0 |
| GRO historical backfill | Every 2 minutes (odd), restarting at the beginning | **0214 opt-in** persistent once-only history scan | Up to 720 repeated **31-row bounded probes** per day avoided after completion; provider rows not measured; one-row checkpoint check remains |
| 20m risk gap enrichment | Every 20m Worker subtask | KEEP | 0 |
| B2 P0B archive/recovery drains | Every 10m when enabled | KEEP | 0 |
| Hot50 materialized snapshot refresh | Every 10m when enabled | KEEP existing revision-change gate | 0 new |
| Primary original-source 5m | `2-57/5 * * * *` | KEEP | 0 |
| Global private OSINT | `*/15 * * * *` | KEEP | 0 |
| Direct Hot50 originals | `6,26,46 * * * *` | KEEP | 0 |
| Registered reusable sources | `4,19,34,49 * * * *` | KEEP | 0 |
| Primary Website publisher / archive | `7 * * * *` | KEEP | 0 |
| Website backstop | `22,52 * * * *` | KEEP verified existing publisher freshness gate | 0 new |
| Website canonical *daily duplicate* | `40 1 * * *` | **GitHub success step verified -> skip only duplicate** | Up to one full 72h 600-row **journal return** avoided on skipped day, plus associated metadata/refresh work; native D1 billable rows unknown |
| Historical Website gap backfill | `23 4 * * 0` weekly | KEEP source truth | 0 |
| Original-source 30m pulse | `12,42 * * *` | KEEP | 0 |
| Source root full rotation | `48 23 * * *` daily | KEEP | 0 |
| Phase2H private B2 scheduled archive | `29 0,6,12,18 * * *` | KEEP archival + SHA readback | 0 |
| Phase2H historical B2 recovery | `*/10 * * * *` | KEEP archive backlog | 0 |
| Private daily evidence digest | `0 0 * * *` | KEEP archive proof | 0 |
| Read-only D1 observatory | `27 * * * *` and `17 1 * * *` | KEEP; append 60k receipt | 0 new |
| B2 gateway lifecycle | `10 0 * * *` Worker | KEEP B2 retention | 0 |

All unspecified schedules, including historical, review, governance, partner
health and signed-risk jobs, remain unchanged until actual Query Insights
prove they are redundant. Source or payment-critical tasks must not be
disabled to meet a quota target.

## Exact isolated Cloudflare D1 shadow billing test

Before any provider call, separately provision a dedicated D1 **shadow**
database. It must be **named** `geomacro-d1-publisher-shadow` (optional
suffix) and its UUID must differ from production. The script checks both
name and UUID against Cloudflare's API. The 50 synthetic publisher items
are inserted into the shadow database only. This is not free of provider
row usage; authorize with account-wide headroom first.

```bash
# Run from GeoMacro checkout; first install Cloudflare's current pinned CLI:
npx -y wrangler@4.136.3 d1 create geomacro-d1-publisher-shadow
npx -y wrangler@4.136.3 d1 list --json

# Set only in your secure local shell; NEVER commit real credentials.
export CLOUDFLARE_ACCOUNT_ID='<your 32-char account id>'
export CLOUDFLARE_API_TOKEN='<restricted D1 shadow API token>'
export D1_DATABASE_ID='<canonical production D1 uuid>'
export GEOMACRO_D1_SHADOW_DATABASE_ID='<new, distinct shadow D1 uuid>'
export GEOMACRO_D1_SHADOW_TARGET_APPROVED='YES'

node scripts/ops/verify-d1-publisher-billable-shadow.mjs --dry-run
node scripts/ops/verify-d1-publisher-billable-shadow.mjs --run-shadow

# Verifies native Cloudflare REST result[0].meta rows_read/rows_written:
cat artifacts/release/d1-publisher-shadow-billable-rows.json
```

The script requires **the first insert actually writes**, a repeated
identical batch has **rows_written === 0**, and a single changed card
produces a positive rows_written, with exact final 50-item readback.
The 50 single-item baseline is measured separately. If the provider
meta does not expose rows_read/rows_written, all results are HOLD; never
substitute SQLite VM steps. Shadow records are synthetic, no actual news
or paid products. A passed shadow test does not certify deployed
production SQL or account-wide under-target consumption.

## Full-day release acceptance / monitoring checklist

- [ ] Finish protected 0204–0211 first; confirm 0212, 0213, 0214 staged
      migrations against real provider, backup/time-travel bookmark,
      original-row parity, index EXPLAIN, readback and rollback.
- [ ] Confirm dedicated private R2 binding, HMAC secret and all protected
      readers before 0213 writer activation. Never treat private staged
      R2 reference as verified B2 archival/certified GRO or customer rights.
- [ ] Record actual Cloudflare account-wide `d1AnalyticsAdaptiveGroups`
      complete UTC day (all databases), not just production database or
      shadow. Sum rowsRead and rowsWritten separately.
- [ ] Run the above separate shadow script within authorized headroom;
      preserve receipt and exactly matched deployed writer SHA.
- [ ] Run `node scripts/ops/d1-launch-hourly-observer.mjs` using the existing
      scoped token and `node scripts/ops/step2-d1-headroom-telemetry.mjs`.
      Artifacts appear at
      `artifacts/d1-launch-hourly/{receipt,step2-headroom}.json`.
- [ ] Compare pre/post per-query `result.meta.rows_read/rows_written` and
      Cloudflare Query Insights for Website journal, OSINT, census,
      GRO backfill, daily reconcile, and archive queues.
- [ ] Verify unchanged first-party original ingestion at 5m/15m/20m and
      Hot50 × 3 source freshness; check retained 72h backlog and B2
      physical object SHA readback. Fail if noncommercial observations disappear.
- [ ] Verify authenticated internal endpoints and public customer routes
      HTTP 200 with unchanged contract and signed GRO provenance.
- [ ] Verify no unknown/missing source/counter or duplicate publisher
      after dedup; if unavailable, allow the old recovery to run.
- [ ] For **one complete UTC day**, validate **both** total rowsRead and
      rowsWritten **<60,000**, plus preceding/following-day comparisons
      and stable source SLA. Prefer continuous 72h proof before promotion.
- [ ] Reject rollout if any mandatory API, signing, B2 archival, evidence
      or Worker deployment parity fails. Do not bypass spend governance.

No actual Cloudflare shadow billable rows or complete-day 60k acceptance
result has been produced by this PR. User-facing and paid API changes: none.
