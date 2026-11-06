# Step 3 — commercial risk endpoint and cryptographic receipt

## Contract

`POST https://geomacro-commercial-api.daspallab202391.workers.dev/v1/risk-gate` accepts a JSON body containing
`subject` and `tier` (`basic`, `standard`, `complex`). `request_id` or the
`Idempotency-Key` header can supply a stable UUID; if absent, the server returns
a newly generated ID. Retain the ID across retries. A different subject/tier under
an existing ID is rejected. Prices, scores, factors, available tiers and billing
amounts cannot be provided by the client.

Country subjects use the existing owner-selected Hot 50 ISO3 registry. Recognized
corridor codes are parsed, but availability is determined by the existing
protected resolver; a current country-only upstream scope can leave corridors
unavailable. The new service does not silently enable 195-country coverage.

Prepaid call:

```bash
curl -X POST 'https://geomacro-commercial-api.daspallab202391.workers.dev/v1/risk-gate' \
  -H "Authorization: Bearer $GEOMACRO_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 41cb8481-44c9-4611-9355-ed0affcf1368' \
  -d '{"subject":"USA","tier":"complex"}'
```

Without a prepaid key, the route uses the configured Base USDC x402 rail. A
request containing both a prepaid Authorization header and PAYMENT-SIGNATURE
is rejected before charging. Credit and accountless payments serialize each request ID in PostgreSQL before either rail can claim it. A prepaid identity cannot replay another payer's accountless receipt, and a request ID already claimed by credits cannot be settled on-chain.

An unconfigured rail returns a truthful 503; it does
not invent a payment address or a price authorization. x402 is accountless.

Successful responses include `decision`, `risk_score`, `factors`, `billed_tier`,
`credits_deducted`, `execution_authorized:false`, and
`audit_receipt:{signature,public_key_id,timestamp,hash}`. The signature covers all
response fields except `audit_receipt`, including actual billing, subject,
request ID, issuer key ID, timestamp and evidence metadata. Cash responses bind
payer, payee, nonce and amount as well; their settlement hash is in the x402
PAYMENT-RESPONSE header and independently verified against USDC chain logs.

`metadata.advisory_only` is true and `metadata.certified_risk_index` is false.
A Basic observation-activity proxy is explicitly labeled
`INDICATIVE_UNVERIFIED_ACTIVITY_PROXY`. It always returns review rather than
turning a count of news observations into an executable approval. Standard and
Complex preserve their actual upstream evidence basis. None of these receipts
substitutes for the separate public Risk Indices' authentic reviewer certificates.
A signature proves the issuer and byte integrity, not source truth or legal immunity.

## Existing evidence connection

`qualified-risk.mjs` calls the existing protected
`/v1/risk-gate/unified/evaluate` endpoint with its distinct tiered credential,
never a browser-supplied or root/admin token. It checks product schema, subject,
price, evaluation time, evidence state and audit receipt hash. Standard requires
three corroborated category factsheets. Complex additionally requires the
upstream verified Ed25519 GRO, unexpired timestamps, exact archive proof and all
seven verified history days. Raw article text and source identities are not
returned as public factors.

The resolver evaluates at most three tiers in descending order and stops after
the first deliverable result. A complex request with only Standard available is
signed and billed as Standard: $0.15 for x402 or 15 credits under the initial
explicit Step 1 rate card. Credit tariffs remain configurable in the database;
this does not change existing D1 customer credit balances or product pricing.

Admitted, redacted evidence is cached for up to 30 seconds inside the edge runtime, capped at the underlying GRO expiry. The original `evidence_valid_until` is included in signed metadata; an expired GRO is never returned from a cache hit. Its original `data_as_of` is retained in the signed metadata. A successful
financial response is never shared across callers. Replays return the originally
stored receipt without resolving evidence or deducting again. The response's
Server-Timing header exposes total processing time. A 99.9% uptime or <100 ms SLA
has not been established by deployment or fixture tests; no unmeasured SLA is claimed.

## Database upgrade

On an existing integrated Step 1–2 database, run as owner:

```bash
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/replay-ownership.sql
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/risk-api.sql
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/rpc-gateway.sql
```

The new table contains disposable per-key minute counters, not financial history.
The default rate is read from each API key's `rate_limit_per_minute`. Concurrent
requests serialize that counter in PostgreSQL; excess calls return 429 without a
debit. The existing minute scheduler prunes only rate windows older than two days.
No ledger, receipt, user or seven-day intelligence record is removed by that cleanup.

The service-only RPC gateway remains inaccessible to anonymous/authenticated
Data API roles. Every balance mutation occurs entirely in the server-side SQL
transaction. The HTTP adapter explicitly rejects SQL transaction commands and
never pretends separate HTTP requests share a BEGIN/COMMIT transaction. The
settlement function rechecks locked balance, key state, price and idempotency
before its atomic receipt/usage/debit commit.

## Keys and public verification

- `GET /v1/commercial/keys`: public JWKS with Ed25519 key IDs.
- `GET /v1/commercial/openapi.json`: the implemented OpenAPI contract.
- `GET /v1/commercial/health`: deployed commit and configuration blockers.
- `GET /v1/commercial/readiness`: actual private PostgreSQL RPC readback.
- `GET /v1/api-keys`: masked keys for a verified Supabase Auth user.
- `POST /v1/api-keys`: `{ "label": "my integration" }` creates an account once,
  grants the original 10 free credits once, and reveals the newly generated key
  once. The database stores only its digest and display prefix.
- `POST /v1/api-keys/{id}/revoke`: revoke an owned key.

Key management requires the verified user's Supabase bearer JWT; a caller-supplied
user UUID is never authentication. API calls use the generated `gm_live_...` key,
not the user's login JWT. The browser onboarding/sandbox/store UI is Step 4.
Existing D1 keys/balances are not automatically migrated into this separate
PostgreSQL namespace.

### High-entropy API tokens versus passwords (CodeQL #137)

The `gm_live_` API credentials are **not human-selected passwords**. They
contain exactly 32 bytes from Node's cryptographically secure `randomBytes`,
encoded as 43 URL-safe characters. The database stores their deterministic
SHA-256 digest solely as an exact lookup key; the same SHA-256 helper also
commits to canonical receipt bytes. It must **never** be repurposed to hash
low-entropy customer passwords. Human account authentication remains with
Supabase Auth, which does not use this helper for password storage.

Changing this digest to a password KDF without a migration would invalidate
existing issued API keys and historical signed receipts. The narrowly scoped
CodeQL annotation documents why the password-hashing rule is inapplicable to
this 256-bit CSPRNG-token lookup. The CI regression test enforces the token
size, wire format, uniqueness, and existing stored digest contract. This is
an explicit false-positive disposition, **not** a claim that a password KDF
was introduced or a scanner finding was fixed without reanalysis.

To verify a response, remove `audit_receipt`, canonicalize the remaining JSON with
`src/metering.mjs`'s `canonicalize`, check SHA-256 against `hash`, then verify
Ed25519 using the matching JWKS `kid`. `verifyReceipt` implements this process.
The canonical format is explicitly this protocol's deterministic JSON, not an
unsupported assertion of RFC 8785 conformance.

`COMMERCIAL_VERIFY_KEYS_JSON` optionally retains historical public SPKI keys by
ID. The protected deploy reads the non-secret repository variable
`GEOMACRO_COMMERCIAL_VERIFY_KEYS_JSON`. Keep prior keys before rotating the root
or receipt issuer; do not delete public keys needed for historical replays.

## Production routing and acceptance

The API currently uses the verified Workers origin. Optional custom-domain routes are installed only when `GEOMACRO_COMMERCIAL_API_ROUTE_ZONE_ID` supplies an actually accessible zone ID. The initial account/token could not resolve the geomacro.live zone, so no successful custom-hostname attachment is claimed. When configured, routes are restricted to the exact `/v1/risk-gate` route and its new commercial, key-management and payment namespaces. It does not intercept the existing nested
Risk Gate evaluation endpoints, public index routes or website presentation.
Cloudflare's explicit public-fetch compatibility flag permits calling the
existing protected resolver across Workers on the same zone.

Main deployment builds the Worker, runs isolated tests and real concurrent
PostgreSQL tests, then verifies the exact deployed SHA, private ledger and issuer
key. A domain-separated protected acceptance token permits one fixed USA Basic
no-funds evidence/signature probe on the Workers origin. That diagnostic does not
create customers, deduct credits, request a wallet signature or settle money.
Its proof is explicitly a no-funds advisory, not a paid-delivery or certification
receipt. Missing evidence is retained as an explicit blocked acceptance result.

Payment credentials, receiving address, facilitator and merchant receiving
acknowledgements must be genuinely configured before real-funds activation.
The existing global emergency freeze and provider quarantine stay effective;
key revocation remains available during a freeze.

## Delivery and refund boundary

Invalid/inconclusive evidence, bad keys, revoked keys, rate limits, signature
verification failure, and observed cancellation before settlement do not debit.
If the database commit acknowledgement is lost, the route reports
`SETTLEMENT_OUTCOME_UNKNOWN_RETRY_SAME_ID`; it does not falsely claim that a
possibly committed debit was rolled back. Retry the same request ID to recover
the stored signed result. The original idempotent credit refund function remains
available to the trusted backend for compensation.

Base settlement and database persistence also cannot be one transaction. Stored
intents and the independent chain-log recovery path prevent a retry from paying
a second time. Automatic USDC refunds, payment disputes/refund clawbacks and an
unconditional zero-charge guarantee for every post-broadcast/network-delivery
failure still require the funded compensation policy. They are not fabricated
by this endpoint or signed receipt.
