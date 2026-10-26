# Predge x Geomacro — Amir's 20 October reply: technical verification and commercial milestones

**Prepared:** 20 October 2026 (UTC)  
**Audience:** Predge/Amir, integration engineers and Geomacro owner  
**Status:** public verification references and test fixtures ready; paid Risk Gate NOT production ready.  
**Never include:** plaintext tokens, source-original articles, privileged source registry URLs, private Ed25519/RSA keys, or customer/payment data.

## Commercial decisions and dates agreed in the email

Predge confirmed **18 November 2026** as the *target* for pricing and the commercial framework, including any paid Risk Gate revenue share. Predge will send the proposed monthly scope **by Friday, 30 October 2026**, specifying:
- Geopolitics, macro/FX and/or critical-minerals feeds; geographic/corridor coverage;
- expected monthly API requests and/or records;
- desired refresh frequency, including any maximum acceptable delivery lag;
- historical retention and depth.

**No price or revenue-share percentage was agreed.** The owner's existing x402 per-capability schedule remains in force; a monthly subscription is negotiable once the actual measured scope is received. Define included requests/records, burst/concurrency, monthly price, overage policy, source-rights scope, support/SLA, termination, and any separate signed-GRO/Risk-Gate usage. Predge does not receive automatic commercial redistribution rights from the free 72-hour feed. There is no invoice, subscription, revenue-share settlement or paid launch authorization in this document.

## 1. Content hash mapping

**There is NO safe 1:1 alias between Predge `context_sha256` and a Geomacro `content_hash`.** The two terms are created by different producers and may cover different bytes.

| Identifier | Meaning | Consumer responsibility |
| --- | --- | --- |
| Predge `context_sha256` | Their signed *market-context* digest; precise canonical bytes are controlled by Predge | Predge must supply algorithm/framing, exact fields, signing key and one public non-secret signed market example; Geomacro verifies before binding market_id, condition_id, event time and UMA/dispute state. |
| Geomacro signed GRO `integrity.payload_hash` | SHA-256 of canonical UTF-8 bytes of the whole signable `gro-1.1` object | Verify with `geomacro-canonical-json-v1`, exact `integrity.payload_hash=null` and `integrity.signature=null` masking, and Ed25519 signature over *those bytes*. |
| Optional GRO evidence `content_hashes` / independent pipeline `content_hash` | Origin/evidence or pipeline-specific hashes | Do NOT use as a GRO payload-hash alias or Predge market signature. |

**Required from Predge before mapping:** their `context_sha256` byte specification, signed context envelope, `key_id`, public key rotation/revocation policy, canonicalization test vector, signed `market_id` and `condition_id`, timestamp, dispute count and `sent_to_uma_vote` (where applicable). A syntactically valid hash string in action context metadata is not trusted.

## 2. Which Risk Gate schema is live?

- **HTTP ingress:** `POST https://geomacro.live/api/risk-gate`, backed in source by the Cloudflare D1 Worker path `POST /v1/partner/predge/risk-gate`.
- **Authentication:** separate protected `PREDGE_RISK_GATE_TOKEN`; it is NOT the free-research Bearer. The missing credential causes fail-closed 503.
- **Request shape:** `docs/partners/predge/risk-gate-request.json` (country) or `risk-gate-corridor-request.json` (corridor), alongside the policy field definitions.
- **Response schema version:** `risk-gate-1.0`. This is the **advisory response format**, not a request body tagged `risk-gate-1.0`.
- **Not a Risk Gate request contract:** `request-public-sandbox.json`. Its sandbox envelope is unrelated to this endpoint.
- Country subject example: `"subject":{"type":"country","country_iso3":"USA"}` (not `"id":"USA"`).
- Corridor example: `"subject":{"type":"corridor","origin_country_iso3":"IND","destination_country_iso3":"ARE"}`.
- **No top-level `context_sha256` or `content_hash` allowed** by the D1 Risk Gate parser. Valid signed-market context must be verified independently, not naively promoted from `action_context.metadata`.
- Operationally the D1 Worker performs dedicated auth, bounded JSON parsing, quota/idempotency, pinned Ed25519 GRO checks and deterministic evaluation. Without a genuinely current commercial signed GRO, it returns an unavailable/PAUSE state, never an invented score.
- `execution_authorized:false` **always**, including a `CONTINUE` advisory decision. No trading, settlement or payment authority.

**Acceptance caveat:** A source-code contract or successful D1 Worker deploy alone is not proof that the external website route was republished with the matching SHA, that a dedicated Risk Gate token was provisioned, or that current signed GROs exist. Those remain independent live acceptance steps.

## 3. Public GRO key, canonicalization and independently signed TEST sample

**Production public trust registry, from reviewed main source:**
- Current key ID: `geomacro-risk-2026-03`
- Public-key algorithm: `Ed25519`
- Base64 DER SPKI: `MCowBQYDK2VwAyEAeMsePxig7TEUR3fykcx9wcBqomj9KBuJ/TXTX2QSN2k=`
- SHA-256 of DER SPKI bytes: `432f35218570c80c09d56a8005390f6d3111a932ba93298f4ffd86d9896c0b90`
- Registry source: `src/lib/risk-object-public-registry.ts`.
- Registry HTTP discovery: `GET https://geomacro.live/api/risk-object-keys` (check actual HTTP 200 + deployed SHA/key before relying on the live host; source alone is not a fresh availability claim).
- Canonicalization specification: `docs/GRO_CANONICAL_JSON_V1.md`.
- Normative cross-language vectors: `test-vectors/gro-canonical-json-v1-edge-vectors.json`.
- Independent verifier: `scripts/verify-gro-independent.mjs`, and `verifiers/python/verify_gro.py`.

**Canonical signing steps:** Parse exact JSON → set only `integrity.payload_hash` and `integrity.signature` to `null` → recursively sort object keys using JavaScript UTF-16 code-unit order, preserve arrays, apply ECMAScript number/JSON string serialization, no extra spaces → UTF-8 encode → SHA256 bytes → verify Ed25519 signature of the **same canonical bytes**. Reject schema/key/time/rights mismatch separately. Do not hash the original transport whitespace or the hex digest for the Ed25519 signature.

**Signed TEST-ONLY vector:** `docs/partners/predge/gro-signed-test-vector.json` pairs with `docs/examples/gro-1.1-canonical-v1-test-vector.json` containing its test SPKI, canonical bytes, expected hash and Ed25519 signature. Execute `node scripts/verify-gro-independent.mjs --self-test` or the existing signed-fixture tests.

This demonstrates cryptographic format only. The vector key `canonical-test-key-1` is **NOT** a production trust key. It is **expired**, `verification.status=INCOMPLETE`, `commercial_eligibility.status=UNVERIFIED`, has no genuine events and **MUST NOT** be presented as a live/current GRO.

**Live production GRO:** none accepted in this handoff. For country/corridor market scoring or paid Risk Gate, supply an actual unexpired verified commercial GRO signed by the pinned production authority, backed by permitted genuine evidence and verified B2/D1 exact readback. Never fabricate, resign a test fixture, change expiry or promote an unscored news item into a scored GRO.

## 4. What Predge can consume TODAY without paying

`GET https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/derived-structural-72h`

- Stable derived `items[].id`, 72-hour original clock, 15-minute-delayed publication, and category filters `domain=geopolitics|macro|rare_earth` from the same D1 derived journal as Website Intelligence.
- **Research-only, non-commercial** and unscored. No raw publisher articles or upstream redistribution rights.
- A 200 response and a zero item count do NOT imply all 195-country/three-domain feed coverage or scores.
- Predge's last known partner-reported test: **4 geopolitics, 0 macro, 0 critical minerals**; figures may change and have not been reasserted as current counts.
- The separate private research endpoint remains *disabled* after proven revocation of the old emailed bearer (protected acceptance run #39446430795). A **new** unique `PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE` has not yet been independently confirmed in production. Do not transmit/reuse the revoked credential.

## 5. Secure Telegram token handoff: future action, not completed today

Amir offered his private Telegram contact. Use `t.me/latcom` to **confirm the intended recipient's identity using the already-established email thread**, before handing over a new token. Agree an encrypted direct message or end-to-end encrypted Secret Chat on supported Telegram mobile clients (ordinary Telegram cloud chats are *not* end-to-end encrypted by default).

1. Owner generates a fresh cryptographically random 32-byte research token locally; enter as protected GitHub production secret `PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE`, never share in email or source.
2. Deploy `deploy-d1-control-plane.yml`; require production old bearer 401 and new bearer 200, plus shared D1 IDs parity. Without fresh secret, the private route remains safely disabled, not magically restored.
3. Use the owner-only RSA-OAEP encrypted artifact workflow `predge-token-only-sealed-handoff.yml` and locally decrypt on the trusted machine; share **only** the newly active, purpose-scoped research bearer with the verified Predge contact. Never share root/control-plane admin credentials.
4. Obtain Predge confirmation that authenticated GET works. No token or authorization header in GitHub logs, README, email, public Telegram post or issue.
5. Risk Gate token is independently generated/stored/provisioned; do not reuse or distribute it until current GRO and commercial authorization gates are met.

## 6. Acceptance for Amir

- **Send now:** this document, supported Risk Gate country/corridor JSON syntax, GRO canonical spec, public pinned verification key, signed **TEST-ONLY** fixture; truthfully identify absent commercial production GRO.
- **Request back:** Predge's market signing contract and exact `context_sha256` framing, one independently verifiable signed example, plus expected feeds/calls/refresh/history **by Friday 30 October**.
- **Agree in principle:** discuss bespoke monthly subscription and separately paid Risk Gate revenue share, depending on actual scope, aiming for **18 November**. No price, percentage, paid credential, executed trade or signed contract is implied.
- **Do NOT claim:** commercial paid GO, live signed GRO sample, all 195-country real-time news, full Supabase shutdown, Telegram token delivered, or public trust endpoint availability without independent HTTP evidence.

## Public handoff URLs

- Spec: https://github.com/blocknine0/geomacro/blob/main/docs/GRO_CANONICAL_JSON_V1.md
- Production pinned registry source: https://github.com/blocknine0/geomacro/blob/main/src/lib/risk-object-public-registry.ts
- Test vector: https://github.com/blocknine0/geomacro/blob/main/docs/partners/predge/gro-signed-test-vector.json
- Test-only key and expected signature: https://github.com/blocknine0/geomacro/blob/main/docs/examples/gro-1.1-canonical-v1-test-vector.json
- Country Risk Gate request: https://github.com/blocknine0/geomacro/blob/main/docs/partners/predge/risk-gate-request.json
- Corridor Risk Gate request: https://github.com/blocknine0/geomacro/blob/main/docs/partners/predge/risk-gate-corridor-request.json
