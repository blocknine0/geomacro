# Private OSINT → Website Risk Gate and Risk Indices recovery

Reviewed baseline: 39bf93c5a48a187f0653cae9558a99ba71c58792.
Recovery branch is based on the newer main; do not reset main.

## Verified failures

- Run #43023610227: canonical 1333, private_osint 0, reusable_news 29,
  gdelt_cameo 40; website_intelligence protected POST 503.
- Private source lane returned zero but did not throw 503. The actual upstream
  collector/source failures and native-clock filtering still require a live
  production diagnostic; zero is not evidence of credential or parser failure.
- Run #43035563999: no genuine reviewed, signed GRI parent; the verified
  indices publisher correctly held. Never certify Basic/private news as GRI.

## Protected cutover

1. Record fresh main SHA, verify protected D1 Stage2 shadow migration first.
2. Apply migration 0215_derived_discovery_durable_receipts.sql in shadow and
   verify schema/index; apply to production only under migration approval.
3. Create the following Cloudflare queues in the correct account:

       npx -y wrangler@4.136.3 queues create geomacro-derived-discovery
       npx -y wrangler@4.136.3 queues create geomacro-derived-discovery-dlq

4. Attach producer and consumer bindings in actual Worker config based on
   workers/control-plane/wrangler.example.jsonc. Set
   DERIVED_DISCOVERY_QUEUE_ENABLED=1 only after migration/queue binding
   readback. Canary through zero traffic, then protected promotion gates.
5. Independently verify private collector's native-dated source counts,
   quarantined/denied feeds, D1 writer receipts and exact private readback.
   Research-only mode deliberately never publishes private sources as
   certified public risk.
6. Run derived-risk-gate-discovery-20m.yml. A queued HTTP 202 is NOT a
   D1 acknowledgment. The runner must obtain a real commit/receipt via
   GET view=ack_receipt or leave the cycle HOLD. Retries: 15,30,60s;
   after three retries the message goes to the DLQ. Alert/reconcile DLQ.
7. Obtain genuine independently reviewed signed GRI parent and production
   source/rights attestations. Only then allow the existing verified-parent
   Risk Indices publisher to project actual three-domain 7D/30D series.
8. /api/risk-indices returns HTTP 200 only with a verified source package.
   Its short-lived in-process cache reuses original current dates and expires
   at the 60-minute source-clock limit. Missing parent => 503/unavailable,
   not synthetic/retimestamped numerical indices. Measure warm p95 before
   claiming sub-100ms.

## Offline test commands

    node --check workers/control-plane/src/derived-discovery-queue.mjs
    node --check workers/control-plane/src/derived-risk-gate-discovery-bridge.mjs
    node --check scripts/ops/ingest-derived-risk-gate-discovery.mjs
    node --test scripts/tests/derived-discovery-queue.test.mjs scripts/tests/derived-discovery-collector-integration.test.mjs scripts/tests/derived-risk-gate-discovery-bridge.test.mjs scripts/tests/derived-risk-gate-website-raw.test.mjs scripts/tests/derived-risk-gate-runner-isolation.test.mjs
    node --test scripts/lib/risk-indices-verified-d1-parent.test.mjs

The 12-item parser fixture and mock Queue prove only deterministic offline
functionality. Never describe it as 12 genuine live publisher observations.

## Production acceptance

Require >10 unique native-clock private observations with D1 exact readback,
zero acknowledged data drops and DLQ operational proof, verified signed
reviewed GRI parent with dual-authority lineage, complete 3-category current
indices, and measured warm cache latency. Do not bypass commercial hold.
