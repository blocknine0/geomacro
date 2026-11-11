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

## 2026-11-12 permanent Web discovery transport failover

The external Worker POST can return 503 when the canary-held 100% deployed
Control Plane version lacks the discovery producer. Rather than declaring the
entire cycle a success without D1 proof, the protected 20-minute workflow
now has a **direct Cloudflare Queues REST fallback** for Website Intelligence:

1. After the original Worker POST's bounded 2/5/10-second transient retry
   returns HTTP 503, the runner uses its protected production Cloudflare
   account/API token and canonical D1 database UUID. No credential is logged.
2. Before pushing, read the exact indexed D1 `derived_discovery_ack_receipts`
   row for the immutable payload SHA-256 digest. A confirmed previous commit
   is idempotently accepted, with no new Queue message.
3. Verify exactly one `geomacro-derived-discovery` queue and a provider-
   listed trusted consumer pointing at `geomacro-derived-discovery-dlq`.
   Any missing consumer or DLQ is HOLD, not a fake D1 commit.
4. Publish the unchanged protected, rights-held envelope to Cloudflare's
   `POST /accounts/{account_id}/queues/{queue_id}/messages` API with
   `{content_type:"json",body:...}`. A successful Queue API response is
   *transport acceptance only*.
5. Poll the exact D1 receipt for at most 30 seconds, using `digest`
   parameter binding and read-only SQL. Confirm matching lane, page hash,
   and admitted count, plus original consumer's atomic cursor/readback gate.
   If absent, leave the lane incomplete with a bounded HOLD. Never advance
   an unacknowledged cursor, invent an index, or silently turn 503 into PASS.
6. The separate no-public-route `geomacro-derived-discovery-consumer`
   script may be deployed under the protected production workflow. It uses
   the reviewed `websiteRiskRawAck` 3-statement atomic D1 batch and the
   existing 3-retry/DLQ policy. Do **not** register two consumers for the
   same queue. The main Worker keeps its discovery producer; the sidecar
   owns its sole discovery consumer. The standard deploy workflow must not
   erase discovery producer bindings when P0-B is OFF.

### Protected cutover commands (owner GitHub authentication)

    gh pr checks <recovery-pr> -R blocknine0/geomacro
    gh pr merge <recovery-pr> -R blocknine0/geomacro --merge
    gh workflow run deploy-derived-discovery-consumer.yml \
      -R blocknine0/geomacro --ref main \
      -f approval=DEPLOY_ISOLATED_DERIVED_DISCOVERY_NO_FUNDS
    gh workflow run derived-risk-gate-discovery-20m.yml \
      -R blocknine0/geomacro --ref main

The isolated-consumer run MUST prove exact current main, protected environment,
monthly D1 headroom, the physical 0215 schema, queue/DLQ identity, absence of
competing queue consumers and post-deploy provider consumer binding. It does
not promote the held Control Plane Worker, enable commercial deliveries,
modify D1 migrations, or remove the canary HOLD. A separately protected
canonical Worker canary still must be completed before claiming its own
`DERIVED_DISCOVERY_QUEUE` producer binding is live.

### Event-driven Risk Gate and GRI boundary

The existing stream supports 10-event Queue micro-batches and independent
facts/rights Ed25519 attestations. It is not capped at 150 events/day in code;
production is still gated by RISK_STREAM_ACTIVE and
STREAM_INGESTION_ENABLED, source registry, independent originals, physical
shadow proof, provider quotas, and the protected promotion workflow. Do not
flip the flags from this discovery recovery.

The existing GRI v1.2 signed parent -> verified D1 indices -> B2/Edge publisher
is the ONLY path to certified numerical 7D/30D three-domain indices. These
RIGHTS-UNVERIFIED discovery rows are research material and cannot be directly
signed into a current certified GRI, regardless of an Ed25519 key's presence.
The Website's /api/risk-indices endpoint is not the Control Plane's root
/api/risk-indices path. Verify the signed parent first, then probe the
Website route and the independent risk-indices edge; report HTTP status
and measured warm latency, never synthetic 200 or cached expired scores.

### Offline commands

    node --check scripts/lib/derived-discovery-cloudflare-direct.mjs
    node --test scripts/tests/derived-discovery-cloudflare-direct.test.mjs
    node --test scripts/tests/isolated-derived-discovery-consumer.test.mjs
    node --test scripts/tests/owner-gateway-canary-stages.test.mjs
