# GeoMacro Evidence Qualification Engine v1 — protected acceptance

**PR #3734 is DRAFT / CODE ONLY.** A successful unit test is not independent source verification, legal redistribution approval, provider byte-readback proof, completed protected D1 migration, or commercial launch authorization.

## One canonical ingestion interface

POST /v1/internal/evidence/ingest accepts five upstream channel identifiers: rss, google_news, telegram, official_state and private_osint. Each supplies channel, category (geopolitics/macro/rare_earth), country_iso3, article_url, title, body, observed_at; optional claimed_published_at and canonical_url.

Normalization derives an immutable source/content SHA-256 item ID and 64-bit SimHash. Inputs are untrusted; aggregator URL, transport HTTP Date or a Telegram forwarding timestamp is never deemed original source metadata. The raw candidate is stored in a restricted private R2 binding. D1 stores only an item hash, a private R2 key, status, retries and deficit codes.

**Existing upstream polling jobs must still explicitly map their own records to this interface.** This PR adds the shared consumer boundary, not a claim that all five legacy producers have been rewired and proven live.

## Qualification and recovery

The canonical claim must be independently reviewed. The Ed25519-signed reviewer proof includes exact item ID, original URL and publisher organization, original content SHA-256, genuine original publication timestamp, same-event claim hash, at least two independent first-party confirmations (distinct originating organizations, hosts and content hashes; one must be the original source), review timestamps, expiry and independently reviewed commercial derived-use rights receipt SHA-256.

All original, timestamp, content, independent quorum and commercial rights gates must pass. A missing reviewer signature or legal proof leaves an item quarantined. A signed review is an assertion by an accountable reviewer, not cryptographic proof of factual truth or an automatically acquired copyright license. The authorized reviewer must have independently checked real source records and rights.

Recovery is narrowly scoped to up to five due pending items per 20-minute accepted cycle, fetching only owner-approved origin hosts, following no redirects and refusing oversized responses. It records native metadata candidates; it never fabricates independent confirmation, timestamps or license PASS. Failed polls remain pending with explicit deficit codes.

## Signing, archival, hot D1 publication

The strict review gate is re-evaluated before Ed25519 issuer signing. RFC 8785 JCS is used for deterministic payload serialization. Reviewer and issuer public keys must be different.

The full signed envelope is written to a private R2 object named evidence/v1/YYYY/MM/{envelope_sha256}.json. It is immediately downloaded; exact length, SHA-256 and Ed25519 signature are checked before D1 publication. D1 stores only immutable item ID, content/envelope hashes, R2 key, signature reference, review SHA-256, key ID, claim fingerprint, timestamps and compact tags, with no raw article data. It reads the pointer back and refuses a mismatch.

The response API independently re-reads and verifies the R2 envelope, the current reviewer proof and issuer signature before serving.

## Customer idempotency and price

POST /v1/evidence/deliver requires a verified existing canonical customer API key and two separate acceptance flags. An idempotency digest binds canonical customer ID, evidence item ID and exact owner-approved delivery window. The additive D1 delivery receipt trigger inserts into existing customer_usage_receipts; its existing trigger creates the immutable credit_ledger debit inside the same SQLite transaction. Same-window replay verifies the same key, content hash, original grant and account authorization, returns identical signed bytes and incurs no new debit.

This is an at-most-one-debit-per-accepted-contract-window guarantee, not an impossible guarantee that the remote HTTP response physically reached a customer. A lost HTTP response is retryable against the frozen receipt.

The product's credit price and delivery window must be approved against the current canonical GeoMacro pricing catalog. The code refuses to guess an evidence price. No new risk-gate sale or payment capture is unlocked by this PR.

## Protected migration and safety controls

Migration: workers/control-plane/migrations/0212_evidence_qualification_hot_pointers.sql

The schema is additive (expand-only), with new eqe_pending, eqe_qualified and eqe_delivery_receipts tables, narrow indexes and atomic triggers. Customer D1 migrations 0090 through 0097 are prerequisites. The pending protected 0204 and 0211 migrations, pre-migration encrypted backup, Time Travel bookmark and provider parity gates must be resolved before applying 0212. The old Worker must remain compatible.

GeoMacro's internal target remains 140,000 D1 rows read/day AND 140,000 rows written/day within the $5 Cloudflare cost envelope. SQL statement count is not the provider row-operations counter. This PR does not independently prove that account-wide spend guard, so protected rollout and EQE feature flags remain disabled.

## Required Cloudflare-only private settings

- DB: existing canonical production D1 binding.
- EVIDENCE_PRIVATE_R2: private restricted bucket binding with real read/write acceptance.
- GEOMACRO_EVIDENCE_ORIGINS_JSON: exact approved host to originating organization IDs.
- GEOMACRO_EVIDENCE_PRODUCER_TOKEN: dedicated token, different from operator and customer tokens.
- GEOMACRO_EVIDENCE_REVIEW_PUBLIC_SPKI_B64: independent reviewer Ed25519 public key.
- GEOMACRO_EVIDENCE_ED25519_PRIVATE_PKCS8_B64: server-only issuer Ed25519 private key. Never publish or log.
- GEOMACRO_EVIDENCE_ED25519_PUBLIC_SPKI_B64 and GEOMACRO_EVIDENCE_ED25519_KEY_ID: issuer trust pin.
- GEOMACRO_EVIDENCE_DELIVERY_CAPABILITY: an owner-reviewed existing product capability (intelligence_query or signed_risk_object).
- GEOMACRO_EVIDENCE_DELIVERY_WINDOW_SECONDS: owner-reviewed contract duration, 60 to 10800 seconds.
- GEOMACRO_EQE_RECOVERY_ACCEPTANCE: ACCEPTED_PROTECTED_EQE_RECOVERY, only after protected quota, binding, source polling and migration verification.
- GEOMACRO_EVIDENCE_PAID_DELIVERY_ACCEPTANCE: ACCEPTED_VERIFIED_EQE_DELIVERY, **last** after actual trusted source, licensing, cost, payment ledger and independent physical readback checks.
- GEOMACRO_CUSTOMER_PAID_RUNTIME_ACCEPTANCE remains independent; do not flip it solely for the evidence engine.

## API and test gates

Private, producer-token-protected:
- POST /v1/internal/evidence/ingest: returns QUARANTINED and item ID.
- POST /v1/internal/evidence/recover: empty object, bounded due candidates only.
- POST /v1/internal/evidence/qualify: item_id plus independently signed attestation, returns deficits or real archive/hot pointer receipt.

Customer-token protected:
- POST /v1/evidence/deliver: item_id only; signed, unexpired current artifact or fail closed.

Node 22 isolated test commands:
- node --test scripts/tests/evidence-qualification-engine.test.mjs
- node --test scripts/tests/customer-paid-ledger.test.mjs

Tests cover JCS, independent source families, original timestamps, licensing refusal, invalid/altered signatures, quarantined ingestion and recovery, R2 exact byte readback, D1 minimal pointer, atomic trigger and idempotent customer replay. Test data is simulated in-memory and does not constitute live provider, copyright, buyer, B2 or production D1 evidence.

**Live acceptance remains NOT_YET_VERIFIED** until exact-main CI/CodeQL and old/new Worker build parity, actual Cloudflare backup+migration+quota telemetry, private R2 binding readback, real independently reviewed rights/claim receipts, real D1 atomic ledger readback, authorized pricing, and protected canary promotion all independently pass.
