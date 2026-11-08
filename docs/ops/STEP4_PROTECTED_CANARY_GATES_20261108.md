# Step 4 — Protected Hot50 D1 Canary: pre-flight review (no deployment)

As of 2026-11-08 10:26 UTC, the exact Step 3 Nov 9, 00:00 UTC
accounting window is in the **future**. No Step 3 migration success, provider
bookmark, source-preserving HMAC/R2 readback, or 140,000/day improvement
may be inferred from a user statement or this code-only PR.

## Current status

- Step 3 `artifacts/release/d1-step3-migration-execution.json` must be obtained
  from the **actual production-protected GitHub Action after 9 November 2026
  00:20 UTC** and corroborated with Cloudflare provider metadata. Its
  `status:PASS`, four exact verified manifests, non-empty real Time Travel
  bookmark fingerprint, `post_migration_readback_explicit_PASS:true`, and
  actual non-empty HMAC/R2 pointer proof are all mandatory.
- The production `config/d1-hotspot-v2-canary.hold` remains protected.
  Draft PRs #3725 and #3726 MUST NOT be merged solely because a Step 3
  job says `success`. PR #3726 contains migration 0214, **not included**
  in the Step 3 0204/0211/0212/0213 allowlist; verify it separately.
- Every stage requires a new Cloudflare account-wide same UTC-day D1
  rows-read/written receipt, billable-row rate vs measured baseline,
  full quota pacing, B2 archive write/readback parity, authenticated R2
  real-object SHA/HMAC readback and first-party source freshness.
  Do not claim parity from an empty pointer table, an unverified fixture,
  an offline test, or a copied signed envelope.
- Worker version traffic percentages must be confirmed from provider
  deployment GET after each POST; do not use `wrangler deploy` at 100%
  for the candidate since that bypasses gradual rollout. Version
  references must be the actual previously deployed baseline and exact-main
  candidate, and bindings/queue routing/secret names must match.

## Planned six-stage sequence

| Stage | Candidate traffic | Minimum observation | Required decision |
|---|---:|---:|---|
| Dark | 0% | 15 minutes | 100% baseline + 0% uploaded candidate as a **two-version deployment**, version-directed `/health` exact SHA, real authenticated R2 reference readback, D1 index plans |
| 1 | 1% | **30 minutes** | Candidate version-specific errors, p95, p99, live D1 rows, signed evidence, B2 archive / ingestion parity PASS |
| 2 | 5% | 15 minutes | Same independent per-stage gates |
| 3 | 25% | 15 minutes | Same independent per-stage gates |
| 4 | 50% | 15 minutes | Same independent per-stage gates |
| 5 | 100% | 15 minutes | Same gates, then separate independent 24-hour envelope observation before a reviewed HOLD-removal PR |

The scoped script changes in this PR set six stages, 1% 30 minutes,
0% two-version deployment with version override, candidate-version
p95 extraction and strict comparison to Stage-0 baseline, and a
single-version, 100%-baseline rollback on errors.

## Strict circuit breakers

- If provider reports candidate Worker invocation error >=0.1%, the
  existing stricter-than-requested guard rolls back (thus also prevents
  the owner's >0.5% error rate ceiling). Host HTTP 5xx >=0.1% is
  similarly held; note HTTP zone aggregate is not candidate-only.
- Missing metrics, low sample volume (<1,000 candidate requests), UTC
  receipt stale, D1 >140,000 account-wide observed rows or provider
  response shape mismatch -> HOLD and rollback. D1 daily counts from
  GraphQL are *not* instantaneous; a separate rate-of-burn admission
  and independent alerting are still necessary for detection of
  spikes before the daily envelope is exhausted.
- Candidate p95 **Worker wall time** must not exceed the observed Stage-0
  baseline p95. Worker wall time is *not equal to HTTP p95 response
  latency*, so the owner-requested response-latency p95 needs its own
  instrumented telemetry before full acceptance.
- A rollback changes **only Worker version traffic** to baseline 100%.
  It does not reverse D1 SQL migrations or roll back R2/B2 storage.
  Old Worker compatibility with new D1 schema and storage is an
  independently mandatory dark-stage check.

## Outstanding blockers (release not yet authorized)

1. Step 3 9 November authenticated production evidence does not yet exist.
2. D1 live daily read/write improvement vs same-workload baseline is not
   provider-demonstrated; no measured stage logs exist.
3. Genuine per-stage R2 HMAC and B2 archive parity *and* per-stage
   ingestion freshness proof are not connected to the canary-promoter
   controller: this patch does NOT assert those checks are satisfied.
4. HTTP response latency p95 and an early D1 write-rate spike detector
   require verified production instrumentation; Cloudflare Worker
   wall-time quantiles alone cannot substitute for HTTP response p95.
5. Core production deployment must pass the existing no-funds
   signed evidence, auth/binding and release policy. Exact current
   `main` SHA must include independently reviewed optimized code and
   a separate migration 0214 gate before deploying any code requiring it.

All omissions are **hard blockers**. Do not mark this PR production
ready, remove HOLD, or promote an unproven candidate.
