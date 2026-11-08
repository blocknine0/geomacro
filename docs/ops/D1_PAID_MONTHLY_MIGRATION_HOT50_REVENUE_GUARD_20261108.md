# GeoMacro Workers Paid D1 monthly quota — safe migration and Hot50 continuity

**Production gate state:** NOT_YET_VERIFIED. This is a reviewed
migration admission architecture, **not** a provider-executed D1
migration, activated merchant, or proof of paid GRO deliverability.

## Owner authorization (8 Nov 2026)

The former independent owner target of **140,000 account-wide
rows-read/day and 140,000 rows-written/day is retired** for
**new Workers Paid** migration, source admission, canary, and normal
release eligibility. It must NOT be treated as a Cloudflare Paid
physical limit.

Actual account screenshot for **5 November–5 December 2026**:
- 18.14 million read / 25 billion included.
- 1.35 million written / 50 million included.
- D1 stored 145.57 MB / 5GB included; four databases.
- D1 read/write usage is METRICS not the number of SQL statements.

Current owner-controlled *elective workload* envelope:
- 22.5B reads and 45M writes per **5th-to-5th billing month**,
  10% unused included capacity reserve.
- 20M read rows and 1M written rows reserved for migration/telemetry
  uncertainty, plus bounded reviewed migration estimates.
- An 8% opening allocation plus linear bill-cycle pacing; avoid
  exhausting usage during the first day.
- Hot50 production ingestion, signed GRO publication and existing
  customer APIs must NOT be interrupted for elective migration quota.
  Prefer skip **optional backfills and indexes** and keep durable
  encrypted source holding.
- This is not an account-wide atomic provider cap or **$5 invoice cap**.
  R2/B2/Queues/KV/DO/Workers/taxes/billing overage have separate meters;
  provide account billing alerts and a non-autonomous upgrade policy.

## Required real provider proof

Cloudflare GraphQL:
```graphql
query D1PaidCycle($accountTag: string!, $start: Date!, $end: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      d1AnalyticsAdaptiveGroups(
        limit: 1000
        filter: { date_geq: $start, date_leq: $end }
      ) {
        sum { rowsRead rowsWritten }
        dimensions { databaseId date }
      }
    }
  }
}
```

Collect all D1 rows across *every* account database and every UTC date
from billing-cycle **start** through the most recent UTC date inclusive,
then separately prove real Workers Paid subscription via account Billing
Read API. Missing today's group, duplicate database/day, truncated
1000-row page, stale subscription, wrong period, missing permission or
changed plan => optional migration **HOLD**. Do not infer zero from the
start of a new UTC day.

Command in the owner-approved protected runner:
```bash
node scripts/ops/check-d1-paid-monthly-headroom.mjs --check
```
Output: `artifacts/release/d1-paid-monthly-headroom.json`;
it includes sanitized observed billed read/write rows, month boundaries,
budget, verification state and non-atomic caveat—no account token.

## Expand/contract safe migration sequence

1. Use PR #3732 reviewed exact SHA and private R2 32-byte AES secret.
   Existing legacy Worker and new Worker must both read/write the
   expanded schema; raw_json legacy fallback retained.
2. Use a separately approved **shadow-only** GitHub manual workflow
   with the `--rehearse-shadow` operation; UUID must differ from
   primary D1 and an isolated shadow R2/Worker binding must exist.
   20M/1M reserve is checked before every changed schema stage.
3. Capture the authentic Time Travel bookmark, encrypt AES-256-GCM
   in memory, PUT encrypted payload + signed manifest to PRIVATE R2,
   GET both back and verify complete byte lengths, hashes and signature.
   No raw bookmark in public logs/artifacts. HMAC pointer object SHA
   and actual B2 physical readback are separate independent gates.
4. Run only allowlisted, SHA-pinned
   0204 → 0211 → 0212 → 0213; each native D1 migration has an
   idempotent migration ledger and schema/index/integrity/counter
   parity. Never blindly retry an ambiguous partial apply.
5. Physically test old Worker read/write on migrated shadow, new
   Worker authenticated pointer hydration, failed deployment rollback
   to old Worker 100%, B2-R2 independence and 150 Hot50 cell integrity.
   **No live provider proof => NOT_YET_VERIFIED**, regardless of CI.
6. Only with authorized production launch, repeat current monthly
   provider headroom, persist the private recovery point, execute the
   controlled **production** migration, preserve HOLD until all
   post-migration physical readbacks pass. Do not use the original
   November 9 one-shot workflow pinned to an old runner SHA.
7. Then PR #3725 and #3726 separate expand/contract review, noting
   #3726's 0214 is not approved in the Step3 allowlist. New protected
   0%, 1% (30m), 5%, 25%, 50%, 100% Worker versions canary with
   real monthly D1 provider pace, API response latency, signed-GRO,
   source freshness, B2/R2 SHA/HMAC parity and >0.5% error breaker.
   Roll back the Worker version, **not** D1 schemas automatically.

## Unmerged legacy 140k compatibility paths

Historically deployed Worker versions and unrelated D1 repairs may
still contain the old hardcoded 140k. To maintain **zero downtime**:
- Do not mutate the deployed legacy Durable Object reservation protocol
  in-place while old Worker versions still depend on it. Introduce a
  distinct month-keyed DO and migrate callers after live parity proof.
- Do not just replace `BUDGET=140000` in `scripts/release-common.ts`
  without changing the actual canary provider receipt and its tests.
  The draft Step4 PR #3730 implements the new monthly circuit breaker.
- Historical files in
  `config/geomacro-cloudflare-five-usd-budget.json`,
  `scripts/lib/d1-owner-daily-envelope.mjs`,
  `src/middleware/quotaCircuitBreaker.ts`,
  `src/middleware/quotaWorker.ts`,
  `scripts/ops/one-time-d1-repair-20261107.mjs`,
  `scripts/ops/run-protected-d1-repair.mjs`, and older frozen
  tests remain for **legacy compatibility**, NOT authority for
  newly admitted Paid work; decommission through a separate proven
  contract-release once the old Worker can be retired.
- Current automated Nov9 reset workflow SHA is the old runner; PR
  #3731 deliberately makes it HOLD. The protected shadow-only
  workflow should be updated to exact V2 SHA and monthly provider gate
  only after a reviewed PR.

## Real earning / Hot 50 signoff

Before accepting money verify all **50 country × 3 category**
evidence cells are monitored, with explicit
`INSUFFICIENT_EVIDENCE` for any unfounded event, rather than fabricated
scores. Actual B2-backed Ed25519 signed qualified GRO, replay-safe
delivered verdict ID/price tier, exact credit ledger and refund
compensation, merchant live sandbox-to-real acceptance, and Predge
fees must be proven separately. Basic provisional activity proxies
are NOT automatically saleable as verified events.

No automatic merchant activation is approved by this D1 quota PR.
