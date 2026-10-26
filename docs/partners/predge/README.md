# Predge x Geomacro — ready-to-build driver handoff (19 October 2026)

**Compatibility:** GRO `gro-1.1` and advisory Risk Gate `risk-gate-1.0`.
**Scope:** private 90-day free pilot integration and real, unscored *public
research* observations. No new key, wallet, payment, source rights or production
authorization is granted by this pack.

## 20 October 2026 partner clarification

Predge's 20 October email reports first public-feed real-input HTTP 200 with
4 geopolitical, 0 macro and 0 rare-earth items and three independently
signed Predge **market** records, including a UMA-vote case. This does NOT
establish a verified Geomacro production GRO or paid Risk Gate launch.

**Read [the versioned October 20 contract](PREDGE_20261020_INTEGRATION_CONTRACT.md)
first:** `context_sha256` is NOT a documented alias for `content_hash` or
Geomacro GRO `integrity.payload_hash`; `risk-gate-1.0` names the advisory
**response** format, while the external request parser uses `subject.country_iso3`
or corridor ISO3 endpoints. The separate signed
[`gro-signed-test-vector.json`](gro-signed-test-vector.json) can be verified
cryptographically with its explicitly TEST-ONLY Ed25519 public key, but is
**expired, incomplete, commercially unverified, and not production trusted**.
The bearer shown in the 19 October email needs issuer-side revocation and
new secure handoff before continued authenticated use.

## Live public research input to connect immediately

```bash
curl --fail-with-body --retry 2 --retry-delay 5 \
  'https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/derived-structural-72h'
```

The `items[]` are derived from the **same 72-hour D1 journal as the Geomacro
Intelligence page**, retaining stable `id`, `category`, original
`original_published_at` and source-native `date_precision`.
Use `?domain=geopolitics`, `?domain=macro` or `?domain=rare_earth`;
`availability_by_category` reports all three regardless. Poll every 15–30
minutes and deduplicate on **item.id**, NOT solely on publication time.
Treat 200 + empty `items` as no observed qualified release and 503 as an
actual outage. Never add inferred score, direction, subject ISO3 or legal
eligibility to unclassified candidates. Records explicitly mark
`commercial_derived_rights_verified:false`, `signed_product_verified:false`,
`payable:false`, and no source-neutral redistribution rights.

## Two independent onboarding scopes — do not confuse their gates

**FREE RESEARCH (available now):** Public `GET /v1/public/derived-structural-72h`
needs no partner token, individual item approvals, reviewer receipts or signed
GRI. The optional authenticated Predge research route requires **one
dedicated 64-hex Bearer**, not repeat per-item approvals. The Geomacro Worker had authenticated 401/200 checks in an earlier pilot,
but the exposed old credential was subsequently revoked. No **new** Bearer
has yet been independently accepted in production.
**Predge's receipt of that token and its own successful call are not yet
independently confirmed.** A 200 with no eligible items is a valid empty
observation, not invented macro or minerals coverage.

Both free routes are **non-commercial, source-neutral research-only**. They
retain native clocks, original content-credit exclusions, no added publication
delay, 72-hour retention and existing 500/UTC-day authenticated hard cap.
They cannot authorize resale, source-rights elevation, scoring, payment or
trade execution.

**SIGNED MARKET / GRO / RISK GATE (separate, not yet accepted):** Requires
Predge's independently verifiable market signing key, signed numeric
`market_id` plus `condition_id`, exact clocks/condition/dispute state,
their own authorization and quota acceptance, and a genuinely current
verified `gro-1.1` if making a Risk Gate decision. Free public news
records are advisory candidate observations, not signed market state.

## Driver fields (actual implementation contracts)

A live external Risk Gate v1 request needs `request_id`,
`subject:{type:"country",country_iso3:"USA"}` (or legacy top-level
`country_iso3:"USA"`), **or**
`subject:{type:"corridor",origin_country_iso3:"IND",destination_country_iso3:"ARE"}`,
and `policy`: `policy_id`, `policy_version`, `continue_max_score`,
`reduce_limit_max_score`, `require_approval_max_score`,
`minimum_confidence_for_auto_continue`,
`require_commercial_verification_for_continue`. Optional
`max_positive_delta_for_auto_continue`, `hard_stop_driver_contributions`,
`action_context:{action_type,amount,currency,destination,metadata}`.

Response fields: `schema_version:risk-gate-1.0`, `request_id`,
`decision:CONTINUE|REDUCE_LIMIT|REQUIRE_APPROVAL|PAUSE`,
`recommended_action:ALLOW|REDUCE_EXPOSURE|REQUIRE_HUMAN_APPROVAL|BLOCK`,
`reason_codes[]`, `counterfactual`, `subject`, `risk`,
`top_drivers[]`, `policy`, and **`execution_authorized:false`**.
Even `CONTINUE` is *advisory*, never payment or trade permission.
For a Predge settlement-risk record require exact signed `market_id`
**numeric** and `condition_id` bindings, verify Ed25519 canonical UTF-8
signature and content hash from Predge's published key, enforce freshness,
and use signed `dispute_count`/`sent_to_uma_vote` where a `disputes[]`
array omits records. An unsigned slug is insufficient. Predge clean
cannot override a more restrictive Geomacro decision; absent actual verified
current GRO => fail closed `PAUSE` / human review.

## Included examples

* `gro-country-example.json` — old canonical country test-vector,
  **unsigned as a GRO**. NOT a verified current source observation.
* `gro-corridor-example.json` — synthetic corridor shape only,
  **unsigned** and INCOMPLETE.
* `gro-signed-test-vector.json` — Ed25519 **signed test-vector** country GRO,
  reconstructable from the public canonical test vector. Expired, incomplete,
  non-commercial, signed by a test key that is **not** a production trust root.
  This meets the need for an offline signed-format verification sample only.
* `risk-gate-corridor-request.json` — supported external corridor request form.
* `risk-gate-request.json` — corrected **external** country request shape;
  example IDs and monetary context are synthetic. The old `subject.id` shape
  is NOT accepted by the external `POST /api/risk-gate` parser.
* `risk-gate-response.json` — illustrative fail-closed advisory.
* `manifest.json` — machine-readable field and scope contract.
For real GRO delivery request an independently signed and unexpired
`gro-1.1` object with its `integrity`, `verification`, evidence and
rights flags unchanged. **Never relabel these fixtures as production signatures.**

## Before separately signed-market Risk Gate driver acceptance

Predge must confirm its **own** server-enforced market-feed quota, signing
key and credential header: suggested target 100 checks/day, HARD maximum
500/day. Those **Predge-market** credentials and counters are NOT
prerequisites for Geomacro's already deployed public free-research GET.
The authenticated Geomacro research feed instead requires only its own
dedicated Bearer, which the owner must share through a secure channel.
For the signed-market driver Predge must provide settlement-risk endpoint
specification, a current signing key, independent live PUBLIC_SANDBOX signed
sample and signed/countersigned LOI v2 where applicable to the separate
driver agreement. Geomacro verifies signature, clock, numeric ID, origin,
actual server counters and fail-closed responses. No fees, prepaid costs
or minimum commitments. A public research news feed alone is **not** an
agreement to redistribute structured intelligence commercially.
The original 2 November 2026 first-feedback target was overtaken by
Predge's 20 October 2026 self-reported real-input public-feed test. That
report is **not** evidence that a signed GRO or paid-market Risk Gate
integration has passed independent production acceptance. Legacy Supabase
Risk Gate is not a deployed replacement; never claim paid production GO
before the independent signed-market and product proof gates pass.

Relevant canonical sources:
`schemas/gro-1.1.schema.json`, `src/lib/risk-gate-contract.ts`,
`src/lib/risk-gate-api.server.ts`,
`docs/ops/PREDGE_SHARED_72H_DERIVED_NEWS_FEED_20261019.md`.

## Current private research Bearer handoff (20 October security amendment)

**This section supersedes any earlier HMAC-fallback instructions.** The
19 October emailed Bearer was treated as exposed. Production old-token access
was revoked and verified in
[Actions #39446430795](https://github.com/blocknine0/geomacro/actions/runs/39446430795).
The former deterministic fallback has been **disabled**, not retained.
Without a new protected token, private research access remains closed.

The free public, non-commercial, derived 72-hour feed is already available at:
`GET https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/derived-structural-72h`.

To restore Predge's optional research-only authenticated feed:

1. Generate a **new** random 64-lowercase-hex token locally on the owner's
   trusted machine, never in email or repository files.
2. Set GitHub protected **production**
   `PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE` to that token. Do **not** reuse the
   old emailed/HMAC-derived token, the root/admin token or the separately
   required Risk Gate token.
3. Redeploy `.github/workflows/deploy-d1-control-plane.yml` from main.
   Verify anonymous=401, previously exposed Bearer=401, **new** Bearer=200
   and source D1-ID parity. Failing protected acceptance means do not hand
   over or claim active access.
4. Use `.github/workflows/predge-token-only-sealed-handoff.yml`, which
   now **requires the explicit fresh override** and produces an RSA-OAEP
   encrypted artifact only after live auth verification. Decrypt on the
   owner's local machine; send only the purpose-scoped token to Amir through
   a mutually confirmed encrypted channel, not plaintext email, an ordinary
   Telegram cloud chat or public GitHub artifact.
5. Ask Amir to confirm an authenticated live GET with the new token.
   This authorization grants only the agreed private noncommercial pilot.

This is not a commercial GRO or Risk Gate token. Paid Risk Gate requires its
**own distinct** protected `PREDGE_RISK_GATE_TOKEN`, genuine fresh signed
commercial GRO, rights and independent live acceptance. Missing inputs must
fail closed with `execution_authorized:false`.

See [Amir's latest technical + commercial handoff](AMIR_20261020_TECHNICAL_COMMERCIAL_NEXT_STEPS.md)
for hash mapping, request examples, public Ed25519 key/spec, signed
test-only fixture and the **30 October** / **18 November** milestones.
