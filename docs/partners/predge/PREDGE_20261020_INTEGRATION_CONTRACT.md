# Predge x Geomacro — 20 October 2026 integration clarifications

**Authority:** verified against the current Cloudflare D1 `workers/control-plane/src/predge-risk-gate-d1.mjs`, deployed website proxy `src/routes/api.risk-gate.ts`, cryptographic source `src/lib/risk-object-signing.server.ts`, and the public GRO v1 specification. Read the 20 October [Amir follow-up](AMIR_20261020_TECHNICAL_COMMERCIAL_NEXT_STEPS.md) for current status. This handoff is for interoperability testing, **not** a declaration of paid Risk Gate availability or commercial redistribution rights.

## 1. Which field is `content_hash`?

**Do not map Predge's `context_sha256` directly to Geomacro's `integrity.payload_hash` or a generic `content_hash`.** A 64-character SHA-256 digest format alone says nothing about what bytes were hashed.

| Field | Producer and precise bytes | Verification |
| --- | --- | --- |
| Predge `context_sha256` | Predge-controlled signed market/context payload. **Byte framing and field inclusion must be confirmed by Predge**; the payload and signature must bind market identity, condition identity, time, and dispute state. | Verify against Predge's independently trusted signing key and its published canonicalization contract, then recompute on the *same* bytes. Do not assume SHA256(JSON.stringify(...)). |
| Geomacro GRO `integrity.payload_hash` | SHA-256 of `geomacro-canonical-json-v1` UTF-8 bytes of the **whole received GRO**, changing exactly `integrity.payload_hash=null` and `integrity.signature=null`. | Recompute and verify Ed25519 signature over those same canonical bytes, using the Geomacro trusted key registry and key lifecycle. |
| Geomacro GRO `evidence[].content_hashes[]` | Optional original evidence-level source hashes. | Not a GRO signature, not a Predge signed-context digest, not a substitute for `integrity.payload_hash`. |
| `content_hash` in unrelated Geomacro pipelines | Source-specific hashing, e.g. raw observations or commercial delivery. | No global `content_hash` alias exists across products. |

**Acceptance rule:** A Predge-to-Geomacro mapping can be established only after Predge supplies the exact signed envelope, its canonical byte specification, `key_id` and key registry, and a genuine non-secret signed example. Verify and bind all critical fields **before** using the record. Reject absent/mismatched digest, unknown/revoked key, unsigned market ID/condition ID or stale/UMA/dispute state. Do not re-label a digest or invent a hash to pass verification.

## 2. Which Risk Gate request is actually accepted?

- `risk-gate-1.0` is the **response schema version**, not the HTTP request's `schema_version` field.
- The actual external endpoint is `POST https://geomacro.live/api/risk-gate`, with `Content-Type: application/json` and its **own** authorized Risk Gate Bearer (not a free research-feed token).
- The implementation accepts `request_id`, optional `evaluated_at` (within 5 minutes of server time), optional `action_context`, mandatory `policy`, and either:
  - `subject: {"type":"country","country_iso3":"USA"}`, or legacy top-level `country_iso3:"USA"`; **or**
  - `subject: {"type":"corridor","origin_country_iso3":"USA","destination_country_iso3":"CHN"}`.
- Country requests use **`subject.country_iso3`** rather than `subject.id`. It **does not accept** `subject: {"type":"country","id":"USA"}`. That was a documentation/fixture error corrected in the accompanying example.
- **Neither `content_hash` nor `context_sha256` is a top-level field accepted by `POST /api/risk-gate`.** This endpoint parses Risk Gate policy/action context, not Predge's market signature envelope. If a market digest is included as a string in `action_context.metadata`, that does not make it trusted or signature-verified. Validate the signed Predge context separately before correlating it with any risk result.
- `docs/partners/predge/risk-gate-request.json` and `risk-gate-corridor-request.json` are canonical **syntactic** examples for the external handler. Policy fields and increasing score thresholds are validated by the runtime parser. See `workers/control-plane/src/predge-risk-gate-d1.mjs::parseRequest` (current D1 ingress), historical `src/lib/risk-gate-api.server.ts::parseExternalRiskGateBody`, and `docs/openapi/geomacro-v1.yaml`.
- `request-public-sandbox.json` is **not** a repository-defined production Risk Gate request contract. PUBLIC_SANDBOX is associated with other demo routes. Do not submit a sandbox demo envelope to `POST /api/risk-gate` or claim it is the accepted paid contract.
- The active external Risk Gate request path is now Supabase-free: the website proxy forwards to Cloudflare D1 Worker, with a separate partner token, atomic D1 quota and pinned GRO verification. **No dedicated paid Risk Gate credential or genuine current signed GRO has been confirmed for partner acceptance**, so the endpoint remains fail closed. A syntactically valid request **does not prove paid-launch readiness**. No execution is authorized: `risk_gate.execution_authorized=false` even if the advisory decision says CONTINUE.

Example country (test values; **not** authorization):
```json
{
  "request_id": "predge-pilot-integration-fixture-001",
  "subject": {"type":"country","country_iso3":"USA"},
  "policy": {
    "policy_id": "predge-free-pilot-review-only",
    "policy_version": "1",
    "continue_max_score": 20,
    "reduce_limit_max_score": 45,
    "require_approval_max_score": 70,
    "minimum_confidence_for_auto_continue": 0.9,
    "require_commercial_verification_for_continue": true
  }
}
```

The JSON response is wrapped as `{ok:true,risk_gate:{schema_version:"risk-gate-1.0",...},context:{...}}` when successfully evaluated. `docs/partners/predge/risk-gate-response.json` represents the **inner advisory response**, not the full HTTP wrapper.

## 3. GRO verification key, canonicalization and signed sample

**Public specification:** https://github.com/blocknine0/geomacro/blob/main/docs/GRO_CANONICAL_JSON_V1.md

**Public trusted key registry:** `GET https://geomacro.live/api/risk-object-keys`. Inspect actual live availability and key status; the presence of this route in the source code does **not** imply it returns HTTP 200 today.

**Independent verifier:** `scripts/verify-gro-independent.mjs`, `verifiers/python/verify_gro.py`.

**Cryptographically signed TEST-ONLY sample:** `docs/partners/predge/gro-signed-test-vector.json`. It is reconstructed from the repository's published `docs/examples/gro-1.1-canonical-v1-test-vector.json` **without re-signing**. Verify its `integrity.payload_hash` and `integrity.signature` against the fixture's `public_key_spki_b64` (test key). This proves exact format/hash/signature interoperability, **not** Geomacro production trust: the test key is not a trusted production key; the sample is expired, incomplete and commercially unverified.

Run `node scripts/verify-gro-independent.mjs --self-test` for the canonical crypto reference. For a **real**, current signed GRO instead, independently fetch the trusted *production* key by `signing_key_id` and run `node scripts/verify-gro-independent.mjs path/to/actual-gro.json` when the live registry is healthy. Confirm valid key, fresh `expires_at`, verified product, provenance and rights before Risk Gate consideration. **Do not substitute the test vector for a live verified GRO.**

## 4. 20 October pilot observations and go/no-go

Predge reported: public 72-hour feed HTTP 200; four geopolitical records; zero macro and zero critical-minerals records; Predge independently verified signed **market** records for three live markets including one UMA-vote case. This is partner-reported evidence, not independently verified production GRO acceptance. It must remain advisory with `execution_authorized:false`. A response with zero eligible items must not be reinterpreted as complete coverage.

Separate gates:

1. Public derived 72-hour research feed: unscored and non-commercial, no signed market/GRO guarantee.
2. Predge signed-market provenance: confirm the authentic context hash definition, signed numeric `market_id`, `condition_id`, dispute/UMA state and key lifecycle against Predge's verified key.
3. Geomacro current GRO: independently trusted active signing key, matching canonical bytes, intact signature, nonexpired object, verified provenance/commercial rights.
4. Paid Risk Gate: valid dedicated client auth, working backend/quotas, policy, independently accepted signed inputs, contractual commercial permission and separate final launch approval.

**Fail closed:** if (2) or (3) is missing, output PAUSE/human review; never transform the unscored public news into a numerical GRO and never set `execution_authorized:true`.

## 5. Plaintext Bearer exposure: mandatory credential rotation

Predge reports a Bearer credential visible in an email sent on 19 October. Treat that exact credential as exposed even if they say they did not use it. **First identify its issuing service and scope**. If it was Geomacro's dedicated research Bearer, perform the steps below; if it belongs to Predge's API, Predge must rotate it on their issuer side. If a Geomacro root/admin token was exposed, perform an incident-wide root/admin secret rotation instead of only changing the pilot Bearer.

For Geomacro's purpose-scoped research Bearer:

1. Privately generate a NEW random 32-byte token, rendered as 64 lowercase hex characters on the owner's secure machine (for example, Node `randomBytes(32).toString("hex")`). **Never paste it into email, chat, GitHub workflow input, issue or log.**
2. In GitHub's protected **production** secrets set `PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE` to the new 64-hex token. Keep the override present: the current deployed code **deliberately DISABLES the old deterministic HMAC fallback** when no fresh secret is configured. Clearing the override keeps private access closed, not usable.
3. Deploy `.github/workflows/deploy-d1-control-plane.yml` from protected `main`. Wait for real production 401 anonymous / 200 new-token and D1 parity acceptance. If deployment fails, independently recheck the current worker before assuming revocation or restored new-token access; do **not** claim successful rotation.
4. Test the **previous** Bearer on the private route in a secret-safe client and require HTTP 401. Test the new Bearer requires HTTP 200. Never log token bytes, signed headers or customer data. Rotate any unrelated exposed tokens at their own issuers.
5. Use `.github/workflows/predge-token-only-sealed-handoff.yml` with an owner's locally held RSA 3072+ public key to receive the **same active** research credential as encrypted artifact. Decrypt locally with the private key, and transmit via an agreed end-to-end secure partner channel. Predge must acknowledge a successful fresh authenticated GET using that new token.
6. Record the incident, revocation receipt, deployment SHA/time, old=401/new=200 proof and Predge acknowledgment in a **private** operations log. This repository cannot read protected secrets or independently certify rotation merely from code.

The research Bearer is NOT a Risk Gate commercial-client credential. Do not use it on `/api/risk-gate`.

## 6. Commercial discussions

Monthly subscription is an option **only after** Predge states the requested products (geopolitics/macro/critical minerals, GRO/Risk Gate/other feeds), geographic scope, requests or records per month, refresh rate, history, SLA, rights and support. Geomacro's existing fixed x402 per-capability pricing remains unchanged unless a separate written subscription or revenue-share agreement is negotiated. Amir has since confirmed **Friday 30 October 2026** for a concrete proposed monthly scope (feeds, calls, refresh, history) and **18 November 2026** for the target pricing/revenue-share discussion. The 18 November date is a negotiation target, **not** a paid-launch approval.
