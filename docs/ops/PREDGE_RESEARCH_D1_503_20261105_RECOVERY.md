# Predge authenticated research 503 — 5 November 2026: permanent guard and acceptance

## Provider-grounded incident

At 2026-11-05T17:22:02Z, the protected GeoMacro D1 Launch Observatory's real Cloudflare D1 account-wide GraphQL receipt reported **2,636,334 rows read** and **114,874 rows written**. Workers Free allows 5 million rows read and 100,000 rows written **per UTC day**. Rows-written headroom was **0**, and the signed Predge research refresh failed with HTTP 503 `PREDGE_RESEARCH_RATE_GOVERNOR_UNAVAILABLE` (e.g. signed-refresh workflow run 42055619570 and subsequent runs). See GitHub Actions run 42073889920.

This is **not** a Predge 500/day 429, token mismatch/401 or positive signed news-context proof. Cloudflare enforces account-wide D1 Free limits; once exceeded, D1 requests fail until 00:00 UTC reset or an owner-authorized Workers Paid upgrade. Exact operator/provider error detail must not be exposed to the partner.

Cloudflare source:
https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/

## Correction in this PR

The research route has **one existing purpose-scoped, fixed bearer** and fixed 500-per-UTC-day ceiling. The original global/client double-counter D1 transaction consumed two physical row writes per authenticated GET, despite `global===perClient===500`.

The dedicated route now uses exactly **one atomic D1 UPSERT RETURNING** on the **same canonical `central_security_budget` global row** as existing security enforcement. The shared 500/day ceiling remains exact and conservative; a different caller using the existing owner-only central-security budget endpoint cannot create a second allotment. Denied attempts saturate at 501. Late clocks cannot roll back an already-advanced global UTC day. The access decision remains fail-closed on D1, schema, SQL or readback failure.

The external partner contract is unchanged: research-only 72h attributed projection, distinct token, 500/day, 401/429/503, `distributed_rate_governor=ATOMIC_CLOUDFLARE_D1_FAIL_CLOSED`, no resale, no signed-GRO/payment authority. The separate `/v1/pilot/check` 100/day check ledger and 3-hour signature TTL are unchanged.

**Cost result:** One physical D1 counter row write per research GET instead of two. This saves up to 500 base-table row writes/day in the full 500-GET pilot, not the other 114,874 account writes. The previously merged source Queue V3 message-bundling controls Queue operations; only verified P1 source D1 lease batching reduces D1 dispatcher writes. These are separate budgets.

## Mandatory actual production recovery

1. Offline exact-head checks: isolated Node/SQLite 500/day/upsert/fail-closed regression, Predge continuity lock, TypeScript tests, Product CI, CodeQL. No owner secret in logs.
2. Merge under normal policy and use the protected canonical control-plane deployment, **never a synthetic signed response**. After source deployment, check `/health` for exact source SHA; a PR green D1 job may be offline only.
3. Read Cloudflare **provider** account-wide D1 quota (not internal predicted/snapshot counts). If Workers Free remains at 100k rows written for today's UTC day, the genuine protected GET and D1 publication remain **503**; the only immediate official options are UTC reset or an owner-authorized Workers Paid upgrade. No code path should bypass quota enforcement.
4. On next UTC-day reset, verify actual authenticated research GET `200`, anonymous/retired token `401`, invalid query `400`, daily cap `429` under synthetic isolated tests (do not intentionally use all 500 live requests). Verify private feed original IDs and source attribution vs the public journal without logging payloads.
5. Run the existing protected signed refresh with its prior opt-in, genuine Ed25519 active key, and D1 owner-only PUT+GET readback. Require `expires_at = generated_at + 3 hours`, a valid signed `news_context`, `chargeable=false`, and `execution_authorized=false`. A green workflow with signing step **skipped** is not acceptance.
6. Observe a full UTC day's provider D1 writes and the at-least-hourly protected Predge refresh. If source/other D1 producers still exceed 100k writes/day, **no Free-tier-only permanent uninterrupted guarantee exists**. Prefer budgeted producer write reductions; when capacity is intrinsically insufficient, inform the owner before any Workers Paid purchase. The separate $5 guard is not a guaranteed $5 invoice maximum.

## Never do

- Never remove the Predge governor, skip D1 on failure or return a fabricated successful risk check.
- Never raise the agreed 500/day research quota or the independent 100/day pilot quota.
- Never send provider errors, secrets or unsigned research blobs to Predge as a valid signed reply.
- Never charge, activate PayPal/USDC, enable commercial rights or re-use private research items as verified GRO.

**Status until live authenticated acceptance after UTC reset:** Code correction staged; D1 provider quota presently exhausted; signed pilot delivery **not verified**.
