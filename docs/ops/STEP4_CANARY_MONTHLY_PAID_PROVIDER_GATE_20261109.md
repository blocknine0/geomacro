# Step4 Protected Canary — permanent Workers Paid monthly quota admission, 2026-11-09

## Physically observed mismatch

The production Step 3 migration rehearsal and canonical canary promoter use `checkD1PaidMonthlyHeadroom`, real Cloudflare Workers Paid account subscriptions plus current billing-cycle, **all-account-D1** GraphQL rows, owner 30% reserve, and exact 5th→5th month pacing. Prior [real provider observation](https://github.com/blocknine0/geomacro/actions/runs/42593820262) PASS.

But `scripts/ops/verify-protected-worker-promotion.mjs` and `scripts/ops/prepare-optimized-worker-candidate.mjs` independently still called the legacy `checkD1BundledWork` planner, which relies on Free-plan-shaped daily snapshots and old daily policies. It could HOLD a correct Paid production canary despite a correctly verified Paid monthly subscription and available headroom. Changing just the canary promoter did not repair its earlier preflight.

## Permanent correction

- The **same** `scripts/lib/d1-workers-paid-monthly-governor.mjs` physically checks all D1 databases, paid subscription, current billing month, observed today, 30% owner reserve, migration emergency reserve and paced headroom. Both candidate upload preflight and protected canary promotion preflight receive `lane:'canary'`.
- Reject missing/mismatched provider schema, HOLD, wrong lane, stale 120-second receipt, missing subscription proof, any request to activate payment, wrong billing cycle, wrong operational monthly/daily/hourly policy, more usage than monthly/paced ceilings, or unreconciled read/write headroom.
- Candidate upload is **not attempted** unless provider Paid monthly admission PASS. It writes a non-secret HOLD/PASS receipt even when a candidate cannot upload.
- The protected 0%→100% workflow runs the same provider test **before** Time Travel and schema preflight, preserving its receipt even when later gate HOLDs. Provider metrics are observational and delayed; this is NOT a guaranteed invoice hard cap.
- All existing immutable main SHA, signed Stage 1/Stage 2, production B2/R2/HMAC parity, version/provider binding parity, Stage0/1/5/25/50/100 SLO observations, rollback, Hot50 and canary HOLD remain mandatory.
- Existing optional Workers/DO spend policy is **not** fabricated; if its enforcement is explicitly enabled, independent provider `VERIFIED` remains required. No billing subscription, Worker traffic, canary file or payment action is changed here.

## Physical release dependencies still outstanding

1. Stage1 complete signed Shadow migration proof and non-empty index key parity, not merely 0204 DDL APPLIED.
2. Protected Stage2 0204→0213 production recovery checkpoint, migrations, schema/ledger/byte/HMAC/B2 proofs, signed exact-main receipt.
3. Exact-main immutable candidate Worker upload and full immutable runtime/binding parity.
4. Protected approved 0→1→5→25→50→100 observations, rollback proof and source continuity.
5. Closed UTC-day account-wide D1, B2 physical parity, and Hot50 signed evidence. Only then may a separately reviewed PR remove `config/d1-hotspot-v2-canary.hold`.

**No release gate is disabled or converted to a simulated PASS.**
