# GeoMacro 24/7 Hot50 commercial derived Risk Gate — gated deployment

**Scope:** Hot50 × GEOPOLITICS / MACRO_FX / CRITICAL_MINERALS, 10-event
Cloudflare Queue micro-batches, independent same-event corroboration,
first-party Ed25519-derived licensing, append-only private D1/R2 history,
entitlement-verified client webhooks.

## Runtime connections

1. Existing persistent `workers/risk-gate-live` RabbitMQ process consumes
   authorized Telegram/private OSINT, first-party RSS and gazettes. A newly
   added OPTIONAL scoped bridge forwards only {source, source_record_id,
   country_iso3, category, event_type, original publication timestamp,
   original URL} to the protected Cloudflare Control Plane endpoint
   `POST /v1/internal/risk-stream/index-leads`. No publisher article body,
   proprietary transcript, commercial-rights flag or root-admin token passes
   through this bridge.
2. `risk-stream-index-listener.mjs` authenticates an independent scoped
   bearer, restricts to Hot50 countries and 72h publisher clocks, rejects
   unsupported source types, registers D1 index sources as
   **disabled / commercial_rights_approved=0**, and publishes into the
   existing `geomacro-risk-stream` Queue (max_batch_size=10,
   max_batch_timeout=2). Originality cannot be inferred from Queue ACK.
3. Existing `risk-stream-pipeline.mjs` stores canonical metadata in
   atomic micro-batches and independently signs verified GROs. GDELT/RSS
   `INDEX_ONLY` leads cannot sign, corroborate as originals or advance paid
   Standard. `risk-stream-open-search.mjs` and the 20-minute gap cron issue
   bounded targeted second-domain searches, never licensing index copies.
4. `risk-stream-commercial-license.mjs` issues
   `GEOMACRO_COMMERCIAL_REDISTRIBUTION_v1` **only** for a previously
   Ed25519-verified, customer-delivery-authorized, dual-machine-original
   GRO with separately attested source rights and a signed release decision.
   It signs a canonical derived-only risk envelope with scope
   `GEOMACRO_COMMERCIAL_DERIVED_INTELLIGENCE`, plus source GRO canonical
   payload, signature, hash and pinned public-key verification.
   The license is **GeoMacro's grant over GeoMacro's own derived intelligence
   only**; it cannot grant third-party content/data/API rights, source
   ownership, or certified GRI status.
5. Additive migration 0216 creates customer subscriptions,
   deduplicated commercial deliveries, ACK receipts and a chronological
   signed risk chain. `risk-stream-commercial-outbox.mjs` leases max 10
   jobs per existing one-minute cron, enforces an explicit customer host
   allowlist, verified entitlements and 2-key cryptographic provenance.
   Only a matching HTTP 200 JSON ACK atomically records delivery; ambiguous
   network state retries with an idempotency key. No blind '2xx=PASS'.
6. `risk-stream-seven-day-chain.mjs` optionally appends per-event
   signed derived-score entries into private R2 (exact readback) and
   immutable D1 (idempotent readback); each references its predecessor.
   Complex needs seven real consecutive UTC days of this history, verified
   by signature, D1 hash chain and all private R2 objects. Missing days,
   readback, chronology or key integrity => HOLD.

## Production flags / secrets: NONE are enabled by this PR

- Source intake: `RISK_STREAM_ACTIVE=1`,
  `STREAM_INGESTION_ENABLED=true`,
  `RISK_STREAM_INDEX_LEAD_BEARER` (48+ characters, **not root admin**).
  Persistent listener:
  `GEOMACRO_STREAM_INDEX_LEAD_URL=https://api.geomacro.live/v1/internal/risk-stream/index-leads`
  and same scoped bearer. Only use after protected Stage2/Worker deploy.
- GeoMacro derived license: protected
  `GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64` (never stored in repo),
  `GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64`, and independently
  pinned GRO and release-review Ed25519 verification keys.
- Commercial release: `GEOMACRO_COMMERCIAL_STREAM_RELEASE=1`,
  `RISK_STREAM_CANARY_HOLD_CLEARED=1`,
  `RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256` plus **genuine signed**
  release-review/provenance/rights proof and specific customer subscriptions.
  `GEOMACRO_LICENSED_WEBHOOK_DOMAINS` is an explicit comma-separated
  inventory of reviewed customer destination hosts, not user-supplied URLs.
- Private seven-day R2: `RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED=1`
  only after quota and private R2 readback acceptance.
- Existing release gate, source rights, signed GRO and partner paid go-live
  must pass independently. Neither an environment flag nor a license field
  alone grants authorization. `config/d1-hotspot-v2-canary.hold` is
  unchanged by this PR.

## Genuinely outstanding before 24/7 commercial launch

- Owner must validate actual original-publication provenance, independent
  publishers and category source-role equivalence, legal source/data API terms
  and commercialized derived-facts quality; open access alone is not enough.
- Stage the separately signed release reviewer approval, enable properly
  pinned licence issuer in the protected Worker, and bind verified customer
  entitlements. Current GRO signer sets
  `customer_delivery_authorized:false`; this change **does not** flip it.
  An independently reviewed authority must issue a new eligible GRO version
  once source rights and protected canary are genuinely cleared.
- Apply migration 0216 via protected Stage2 only; deploy new Worker at zero
  traffic and re-run protected canary with exact main SHA, D1/R2 account
  quotas and genuine 10/10 independent signed-original shadow readback.
- Configure and test actual customer webhooks/ACK idempotency and the
  end-to-end signer. Existing publisher-origin/rights shadow scorecard
  cannot be made PASS from offline synthetic tests.
- Seven-day Complex takes seven genuine days with immutable signed evidence;
  backdating or generating a fake historical series is prohibited.

## Offline verification

CI runs a combined suite with >150 events, 10-per-batch Queue D1 original
consumer, open-derived 4/3/3 synthetic pairs, a scoped metadata publisher,
commercial Ed25519 source-and-license integrity, a validated protected release,
webhook ACK/lease/idempotency and seven-day hash-chain. All fixtures are
synthetic **offline code-contract tests**. They do not establish live
commercial operation, zero provider 503 for future workloads, actual 7-day
producer history, or SHADOW_AUDIT_PASS.
