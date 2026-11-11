# GeoMacro Event-Driven Risk Gate — Protected Stream Lane (R1)

## Dataflow

Authenticated GDELT/RSS/website_intelligence producers
→ independently signed machine original-page and rights attestations
→ Cloudflare Queues, 10 events or 2 seconds, 8 retries and a DLQ
→ one encrypted private R2 ten-original bundle, independent PUT/GET and AES-GCM decrypt
→ one atomic D1 transaction with at most 6 rows / 96 SQL binds per statement (10 Queue events as 6+4), bounded 503 backoff and readback
→ indexed same-event country/category corroboration and distinct-issuer quorum
→ Worker-memory Ed25519 signed stream GRO, immutable D1 transaction and delivery outbox
→ separate internal delivery Queue, verified signature, no-funds D1 ACK.

D1 retry delays are approximately 100/200/400 ms plus jitter (four total attempts).
Unrecovered writes retry in the durable Queue and ultimately go to its DLQ.
The stream acknowledgement means queued, NOT customer delivered. A second independent
original triggers GRO signing during the Queue consumer invocation. This is near real
time with queue latency, not guaranteed instantaneous or zero provider errors.

## Activation requirements

1. Review migration workers/control-plane/migrations/0214_risk_stream_event_driven.sql.
   Shadow D1 migration plus provider Time Travel recovery proof is mandatory first.
2. Create private R2 bucket geomacro-risk-stream-private. Never reuse the public
   website R2 bucket. Provision RISK_STREAM_AES256_KEY_B64 (32 random bytes in base64).
3. Provision distinct protected machine-verifier public keys
   RISK_STREAM_MACHINE_FACTS_SPKI_B64 and RISK_STREAM_MACHINE_RIGHTS_SPKI_B64.
   Machine attestations come from separate original-source and rights services,
   not from the untrusted feed adapter. The original-page SHA256 must match
   archived bytes. A source registry entry must be enabled and have independently
   reviewed original-source ownership and commercial-rights approval.
4. Provision RISK_STREAM_GRO_SIGN_PKCS8_B64 and its matching pinned
   RISK_STREAM_GRO_VERIFY_SPKI_B64 via protected Worker secrets, never in code.
5. Provision geomacro-risk-stream, geomacro-risk-stream-dlq,
   geomacro-risk-stream-delivery and geomacro-risk-stream-delivery-dlq.
   Use workers/control-plane/wrangler.example.jsonc binding names and settings.
6. Populate vetted risk_stream_sources with source roles and owner media parents.
   Rows are disabled and noncommercial by default. Activated category policy
   is required; seed categories are GEOPOLITICS, MACRO_FX, CRITICAL_MINERALS.
   Additional categories require reviewed role policies; any ISO3 country is
   eligible for private discovery without changing Hot50 commercial scope.
7. Connect real GDELT, RSS and website ingestion producers by piping already
   machine-attested original source events through
   scripts/ops/push-risk-stream-jsonl.mjs with existing authorized bearer.
   GDELT_INDEX stays INDEX_ONLY and is never original corroborating evidence.
8. Verify offline tests and protected shadow provider receipts. Then complete
   zero-traffic migration/canary and authorized release review BEFORE switching
   RISK_STREAM_ACTIVE from 0 to 1. The branch itself does not deploy or enable.
9. Inspect internal GRO queue receipts, source provenance and all five risk
   gate/reviewer certificates before considering any commercially chargeable
   delivery. The new stream GRO remains charged=false,
   execution_authorized=false, customer_delivery_authorized=false and
   certified_risk_index=false.

## Source corroboration and signed payload integrity

Same event fingerprint and entities, country, category, original publication
clocks within 48h, two distinct verified publisher root domains and two distinct
parent-media entities, and the category's required original-source roles all
must pass. Index-only observations and unverified duplicated syndicated copies
cannot satisfy the threshold. Both independent machine signature chains cover
the canonical original claims including source URL and its byte SHA256.
Original claims, signatures and raw source bytes are archived in private
AES-GCM encrypted R2; D1 holds derivative metadata and private pointers only.
The stream GRO is an independently verifiable DERIVED evidence object, not
a certified GRI or a substitute for the existing production commercial GRO.

## B2 adaptive policy

workers/control-plane/src/risk-stream-b2-governor.mjs provides a durable
per-operation token bucket: 40-op maximum burst, replenishment paced by
the reviewed live D1 shared-account governor limits, 10% protected reserve,
and the same existing atomic global B2 account reservation for every actual
network attempt. Missing, stale, enlarged or malformed provider quota
telemetry is a hard HOLD / defer-to-private-R2. The stream uses microbundled
private R2 originals, avoiding one B2 write per story.

This intentionally does NOT automatically raise the total 4,080/day or any
other owner-approved/provider-backed account spending ceiling just because
sales or event volume increased. Approved provider entitlements and a
separately reviewed policy rollout are required to raise financial limits.
HOT50_B2_LIVE_GOVERNOR_POLICY_DRIFT is a policy deployment discrepancy
that must be reconciled with live provider counters, never bypassed.

## Verification

Run: node --test scripts/tests/risk-stream-pipeline.test.mjs
Run: node --test scripts/tests/risk-stream-b2-governor.test.mjs
Run: node --test scripts/tests/risk-stream-delivery.test.mjs

The 220-event integration simulation tests 110 signed stream GROs, synthetic
recoverable D1 HTTP 503, two multi-row INSERT statements inside one D1 atomic batch for 10 items,
Ed25519 verification, R2 readback/decrypt, no-funds delivery, retry replay,
dynamic ISO3/category routing, rights denial and non-independent publishers.
Synthetic zero unhandled 503 is NOT a promise of zero live provider errors.

Production still needs actual trusted source attesters, migration and queue
provisioning, provider-backed B2 policy reconciliation, a live latency canary,
per-category commercial evidence, existing reviewer certs, and explicitly
authorized customer delivery. Keep config/d1-hotspot-v2-canary.hold intact.

Cloudflare D1 caps bound parameters at 100 per individual SQL statement (as of 2026-10-30). Do not collapse ten events × 16 fields into one 160-parameter INSERT. The actual live Queue accepts ten events; `DB.batch()` atomically applies two parameterized multi-row INSERTs with 6+4 events while keeping the same idempotency/readback/retry policy.
