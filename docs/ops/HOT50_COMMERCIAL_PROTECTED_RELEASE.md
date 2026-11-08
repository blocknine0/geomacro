# GeoMacro Hot50 Commercial Monetization — Protected Release Contract

**Status: CODE_STAGED / NOT_YET_VERIFIED. Never interpret synthetic local fixture PASS as production delivery.**

## What is implemented in this branch

- Reuses canonical D1 `users`, `customer_payment_receipts`,
  `customer_entitlement_grants`, `credit_ledger`,
  `customer_usage_receipts`, `api_keys`. Additive SQL views named
  `tenants_v1`, `customer_transactions_v1` and `credit_ledger_v1`
  eliminate split-brain billing. Provider receipt uniqueness is enforced
  by `UNIQUE(provider,environment,provider_event_id)`.
- New-format `gm_live_<32 lower-hex chars>` key: 128-bit CSPRNG secret
  revealed once; legacy peppered HMAC stored in canonical `api_keys`
  and only unsalted SHA-256 in `tenant_api_keys_v1` reference table.
  No plaintext is stored in D1.
- Refunded/expired/unverified purchases cannot grant access.
- Pro Analyst ($29) is allocated **5,000 credits**, and a Hot50 signed
  view costs **15 credits per qualified delivery**, consistent with the
  canonical `risk_gate_bundle` tariff. Starter, Pro, Business and pack
  permissions are explicitly controlled; no special free pass for new buyers.
- `GET /v1/risk/hot50`, `/country/:iso2`, `/category/:category_id`
  with Ed25519 pinned-public-JWK verification, 50-country scope,
  3-category completeness, signed payload SHA, qualified evidence pointers,
  deterministic rating interval bounds and expiry checks.
- D1 transaction batches customer usage/ledger debit and the immutable
  delivered snapshot reference. Replay of the same idempotency key does not
  debit twice. No unauthenticated access. Credit failures return 402 with
  a normal Store top-up link. All tenant-specific responses are `no-store`.
- Cloudflare Cache API caches only an immutable, shared signed view for
  at most 300 seconds, **not API auth or billing**. Each distinct billable
  delivery still incurs D1 authorization and ledger writes.
- PayPal live order create/capture retains its existing independently
  provider-verified GET + HMAC-attested canonical D1 atomic funding,
  and now has return/cancel URLs and a first-funding one-time key handoff.
  Already-settled capture retries never attempt a second capture.
- Checkout can enable only when independent merchant readiness reports
  verified, not because a price listing exists. Existing Base/Polygon
  rails remain locked until separate verified settlement acceptance.
  `/account` reuses `/dashboard`, adding last-25 usage and key tools.
- `hot50-commercial-scoring.mjs` is a *pure deterministic* scoring
  utility. It refuses missing categories or evidence. It cannot turn
  unchecked input assertions into qualified facts; publisher-side source,
  rights, original time, Ed25519 and B2 byte-readback verification is
  mandatory prior to signing and publication.

## Migration ID conflict resolved in this branch

PR #3732 reserves Step3 0212 (hourly counters) and 0213 (phase2h R2 ref-only). Commercial D1 migrations here now use 0215 and 0216 to avoid colliding migration ledgers and Wrangler history. The 0214 pointer bridge is separately staged in PR #3726. Apply the protected Step3 migrations first; commercial migrations must run separately using their own frozen checksums after a genuine encrypted checkpoint.

## Non-negotiable release blockers — do not flip flags yet

1. Close existing protected 0204/0211 D1 migration gating and prove
   backup checkpoint, rollback, quota telemetry and legacy/new Worker
   expand-contract compatibility.
2. Independently verify actual merchant KYC, international receivability,
   PayPal live credentials, signed capture, refund/reconciliation and
   funding readback. There is no authenticated Stripe/LemonSqueezy/Paddle
   merchant connection in this change; no new payment provider is silently
   activated. Owner previously selected PayPal + native USDC.
3. Produce physically B2-GET-retrieved, SHA-matched, Ed25519-signed
   source-rights certified data for **50 x 3 = 150** exact cells.
   Third domain is explicitly `trade_sanctions`; the older
   `rare_earth` lane MUST NOT be silently relabeled or mapped to Trade.
   Country deep dives must have >=2 genuine signed history points.
   All snapshot rows must have the publisher's independent verifier receipt.
4. Confirm the signed snapshot publishing job and all country/category
   views; run a controlled canary that verifies signature, B2 hash,
   content, trends, API auth, 402, credits and **no-double-debit** against
   the REAL production D1. An arbitrary value in `verifier_state`
   is NOT physical B2 proof.
5. Validate account-wide provider `rows_read`, `rows_written` and B2
   transaction headroom under the user's internal 140,000-per-day each
   ceiling. D1 batching reduces round trips, **not** the counted rows.
6. Confirm route mapping from public API domain, JWT/session trust and
   cross-origin attack controls, and run an owner-approved first live sale
   followed by charge/reconciliation/readback. Emergency freeze remains
   available independently of Risk Gate ingestion.

**Only after independent live evidence**:
- `GEOMACRO_HOT50_COMMERCIAL_ACCEPTANCE=ACCEPTED_SIGNED_B2_VERIFIED_150_CELLS`
- Pin public Ed25519 `GEOMACRO_HOT50_PUBLIC_KEY_ID` and
  `GEOMACRO_HOT50_PUBLIC_JWK_JSON` to the verified release signer.
- Existing customer paid-runtime/SSR, real-funds and live merchant
  acceptance flags must be maintained; never bypass them.
- Promote protected canary in stages while observing account quota,
  paywall auth, signing, P0B backlog and ingestion health.

## Test matrix

`node --test scripts/tests/hot50-commercial-read.test.mjs`
tests 50x3 scope, unsigned/tampered/expired/missing source rejection,
denied unauthenticated access. Fixture: not a production certificate.

`node --test scripts/tests/hot50-payment-to-delivery-isolated.test.mjs`
executes a **LOCAL_SIMULATION_ONLY** HMAC payment proof against a fresh
SQLite `:memory:` D1-compatible schema: $29 Pro 5,000 credits,
gm_live key hash, Ed25519 signed 150-cell *fixture*, one 15-credit debit,
idempotent request replay and 402 when only 5 credits remain.

`node --test scripts/tests/customer-paid-ledger.test.mjs` exercises
existing canonical ledger behavior. GitHub Actions only validates local
code; no live payment, provider B2 readback or production D1 write is
performed by CI.

## Payment & route examples

```bash
curl --fail-with-body \
  -H 'Authorization: Bearer YOUR_GM_LIVE_KEY' \
  -H "Idempotency-Key: $(uuidgen)" \
  https://geomacro-control-plane.daspallab202391.workers.dev/v1/risk/hot50
```

Do not call this a real public API until verified canary
routing/certified data/merchant settlement gates all pass.
