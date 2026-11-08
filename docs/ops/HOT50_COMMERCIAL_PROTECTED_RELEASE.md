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

## Exact owner-only interventions before provider verification

Do not provide passwords, tokens, API keys or private receipts in ChatGPT.

**1. PayPal Developer (Live, not Sandbox):** in PayPal Developer Dashboard
> Apps & Credentials select/create a LIVE REST app linked to the receiving
business merchant. Copy client ID/secret into your secret manager; add a
webhook whose exact URL is
`https://geomacro.live/api/v1/payments/paypal` and register
`PAYMENT.CAPTURE.COMPLETED`,
`PAYMENT.CAPTURE.REFUNDED`,
`PAYMENT.CAPTURE.REVERSED`. Save the **LIVE** webhook ID. Separately
check that your PayPal business account can receive the intended
international USD commercial payment; OAuth cannot prove KYC or cross-border
receivability. No need to pay anything at this stage.

**2. Application deployment secrets:** supply the existing live
`GEOMACRO_PAYPAL_CLIENT_ID`,
`GEOMACRO_PAYPAL_CLIENT_SECRET`,
`GEOMACRO_PAYPAL_WEBHOOK_ID`, `GEOMACRO_PAYPAL_ENVIRONMENT=live` and
merchant ID in the authenticated SSR deployment (and the existing separate
worker funding attestation secret in both SSR and D1 Worker). Standard
`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
`PAYPAL_WEBHOOK_ID` are now also accepted; if BOTH name families exist,
all values for a field **must match** or the runtime refuses them. Never
copy plaintext secrets into GitHub PR comments, chat, client bundles or
the public Store. Existing customer SSR bridge, allowed origins and OTP
configuration still have to pass protected verification.

**3. GitHub Actions provider verification:** in
`blocknine0/geomacro → Settings → Secrets and variables → Actions`,
set either PayPal secret-name family and:
`CLOUDFLARE_API_TOKEN` (dedicated READ-ONLY D1 token for this probe);
`CLOUDFLARE_ACCOUNT_ID`, `D1_DATABASE_ID`,
`GEOMACRO_D1_SHADOW_DATABASE_ID` (variables are acceptable for public
IDs). The production ID and shadow ID **must be distinct**. Do not grant
this read-only preflight token production D1 Edit or migration privileges.
No credentials are printed in its output.

Once the workflow has been reviewed and safely merged to default main,
use **Actions → Hot50 Commercial Provider Read-only Preflight → Run
workflow**, choose `db_target=shadow`, `schema_phase=base` first.
Review two separate artifacts: PayPal live webhook configuration
(`PASS_WEBHOOK_CONFIG_ONLY` proves OAuth and webhook registration,
NOT KYC or funds), and remote D1 schema readback (`PASS` proves only
canonical D1 + Step3 0213 schema for phase `base`). After the protected
commercial migrations are applied, rerun with `schema_phase=full`
against shadow and then production. Both scripts are read-only and
must return `NOT_YET_VERIFIED` when provider proof is missing.

**Before that workflow is present on main**, from an operator machine
already holding the authorized credentials and using this reviewed
feature branch, the equivalent *read-only* commands are:

```bash
node scripts/ops/check-paypal-live-webhook.mjs
GEOMACRO_COMMERCIAL_READBACK_APPROVED=READ_ONLY_SCHEMA_PROOF \
GEOMACRO_COMMERCIAL_READBACK_TARGET=shadow \
GEOMACRO_COMMERCIAL_READBACK_PHASE=base \
node scripts/ops/readback-commercial-d1-schema.mjs
```

The commands require `PAYPAL_*` or `GEOMACRO_PAYPAL_*` credentials,
`GEOMACRO_PAYPAL_ENVIRONMENT=live`, and Cloudflare API token/account/
D1 IDs **already exported securely** on that machine. Do not paste
their values into terminals that log commands. Reports appear under
`artifacts/release/`. Failures/absent Stage3 schema are release HOLDS,
not evidence of a corrupted database.

**4. Future owner actions—not yet:** protected Step3 shadow/production
migration requires Cloudflare D1 Write and private R2 backup checkpoint
permission with exact-main SHA approval, separately from this read-only
token. Afterwards, provide consent for exactly one minimum real-money
pilot using your own PayPal checkout account; preserve merchant capture
ID (redacted), D1 receipt/credit/grant, verified 15-credit API usage,
signed B2 hash/readback and refund handling. Do not make a live payment
until actual Hot50 qualified 150-cell B2/Ed25519 snapshots and protected
canary are verified. Public Store stays closed beforehand.

### Webhook-first settlement / double-key prevention

The browser callback now handles either ordering: PayPal's signed
`CAPTURE.COMPLETED` webhook may fund first, or the authenticated
buyer-return may fund first. In both cases the buyer's session uses
one immutable `commercial_hot50_checkout_key_handoffs` record
per actual verified PayPal receipt. D1 batch atomically creates
the one-time plaintext `gm_live_` key hash and the unique handoff;
retry/concurrency returns the existing **key ID only**, never mints
a second key or recovers/records the plaintext. If the first response
was lost, the verified dashboard can issue a new rotated key after
proper acceptance, not recover the lost secret.

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
   Third domain is explicitly `trade_minerals_supplychain`; the older
   `rare_earth` lane MUST NOT be silently relabeled or mapped to Trade.
   Country deep dives must have >=2 genuine signed history points.
   All snapshot rows must have the publisher's independent verifier receipt.
4. Confirm the signed snapshot publishing job and all country/category
   views; run a controlled canary that verifies signature, B2 hash,
   content, trends, API auth, 402, credits and **no-double-debit** against
   the REAL production D1. An arbitrary value in `verifier_state`
   is NOT physical B2 proof.
5. Adopt PR #3736 provider-backed monthly Cloudflare Workers Paid quota
   admission using the verified 5th-to-5th UTC billing cycle (25 billion
   included rows-read, 50 million included rows-written, with 10% reserve),
   not an obsolete 140,000-rows-per-day assumption. A GitHub offline
   green test is not real Cloudflare Billing Read or GraphQL telemetry.
   Review B2 transaction headroom separately. D1 batching reduces round
   trips, **not** the counted rows.
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

## Four-PR protected coordination (current order, all still DRAFT)

1. PR #3736: monthly Paid provider GraphQL + Billing Read authentication and
   account-wide included allowance headroom; its offline CI is not provider proof.
   The protected old Stage A CI was still failing on old 140k/day regression
   assumptions. Do not force or bypass its checks.
2. PR #3732: existing AES-256-GCM R2 PUT/GET recovery checkpoint,
   genuine production-vs-shadow D1 IDs, signed manifest, staged
   0204 -> 0211 -> 0212 (hourly census) -> 0213 (Phase2H pointer).
   Verify legacy/new Worker interoperability, archive parity and retention
   BEFORE any production DDL. PR #3726 separately owns staged 0214.
3. PR #3735: protected COMMERCIAL 0215 and 0216 (not Step3's 0212/13)
   only after the above migrations actually pass. Execute remote schema
   readback with `GEOMACRO_COMMERCIAL_READBACK_TARGET=shadow` then
   `production`, `GEOMACRO_COMMERCIAL_READBACK_APPROVED=READ_ONLY_SCHEMA_PROOF`
   and required approved Cloudflare credentials:
   `node scripts/ops/readback-commercial-d1-schema.mjs`.
   This is READ-ONLY and outputs NOT_YET_VERIFIED until real provider
   results prove the exact schema/indexes. A PASS doesn't prove actual money.
4. PR #3730: at 0% dark, then 1/5/25/50/100, only after exact Worker SHA,
   HMAC/R2 and physical B2 parity, Paid quota telemetry and fail-closed
   signing/credit/ingestion baselines. Keep `config/d1-hotspot-v2-canary.hold`
   until release policy explicitly permits promotion and rollback works.

## PayPal verified live settlement bridge

- The original captured-order return handler remains session-authorized.
  New `PAYMENT.CAPTURE.COMPLETED` webhook requires PayPal's **real**
  verification API and independent Orders v2 GET for the exact bound
  merchant/order/intent/amount/capture ID, then the existing HMAC-attested
  `customer_payment_receipts` + immutable grant + funding ledger
  transaction. It does **not** call PayPal's charge/capture endpoint.
- The same webhook endpoint continues handling refunds/reversals even
  while new checkout is frozen. Duplicate capture IDs cannot mint a
  second receipt or credits.
- Public Store remains gated until real PayPal webhook registration
  GET proves the exact endpoint & subscription event set **and** the
  protected D1 worker reads back one actual live PayPal-funded and
  metered Ed25519-valid Hot50 pilot delivery. An owner can run the
  initial authorized live pilot using existing session-protected payment
  endpoint only after independent real-funds prerequisites. Local
  HMAC fixtures never satisfy the public Store release.
- The checkout success screen reveals the full plaintext `gm_live_`
  key only in memory; automatic redirect cannot preserve that secret
  across tabs/pages without exposing or storing it. The customer
  may copy it, then open `/dashboard`. Never put it in a URL or
  browser localStorage.

## Live evidence semantics

The existing `progressive_risk_gate_cell_state` and `gro_evidence`
source tables are now inspected on a paid snapshot MISS. They are
metadata/verified-GRO candidates and do not automatically prove
commercial rights or physical B2 hashes. If any of the 150 required
country/category cells lacks a qualified, fresh (72h) signed object,
`GET /v1/risk/hot50` returns HTTP 503
`INSUFFICIENT_EVIDENCE`, with **0 credits charged**. Category 3
`trade_minerals_supplychain` requires valid independent
`trade`, `critical_minerals` and `supply_chain` subdomain
evidence, never a renamed `rare_earth` row.
No production qualified snapshot publisher has been independently
verified in this PR; real-evidence-to-signed-hot-view deployment
remains a blocker.

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
