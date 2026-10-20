# Predge market 5710779: independent, no-funds verification acceptance

**Verified:** 2026-10-20 21:48:56 UTC on the Geomacro GitHub Actions public, no-secret runner.  
**Upstream:** Amir's `https://api.predge.io/v1/settlement-risk/5710779` and `https://api.predge.io/.well-known/predge-keys.json`.  
**Own implementation:** `scripts/ops/verify-predge-signed-market.mjs`, not a call to Predge's `/verify` result or executing `verify_record.py`.  
**CI:** [PR #2581](https://github.com/blocknine0/geomacro/pull/2581), `inspect-public-contract` job. Runtime script reads public GET endpoints only; no API credentials or paid `/estimate` requests.

## Exact verified cryptographic contract

- Canonicalization: recursively sort object keys by JS UTF-16 code-unit order, serialize strings using ECMAScript `JSON.stringify`, preserve array order and UTF-8 encoding; no outer whitespace, no BOM.
- Signed record `attestation.canonical` matches `C(attestation.payload)` byte for byte.
- `attestation.content_hash` equals SHA-256 of canonical payload bytes.
- Detached payload Ed25519 signature checks against **code-pinned** Predge attestation public key (raw hex), not an arbitrary self-provided key.
- Current independent registry confirms same key with `kid=13fa3d18a369e6c7`, `role=attestation`, `active=true`, `status=active`. The pinned key is `13fa3d18a369e6c71bf941563ba47822b30182273d5106a0e8fb61c5016352d9`. Retired, revoked, unknown, unpinned or role-mismatched keys fail closed.
- Whole-envelope Ed25519 signature checks over `C(attestation without envelope_signature)` so added annotations cannot be swapped.
- Signed `attestation.payload.context_sha256` equals SHA-256 of `C(response.context)`. `content_hash` is a distinct digest; neither is a synonym for Geomacro GRO `integrity.payload_hash`.
- Version 3's signed market, condition id, UMA/dispute state, block and response values are cross-checked against the public response.
- The **raw unmodified HTTP response-body** digest matches `x-predge-body-sha256` and Ed25519 signature matches `x-predge-body-signature` using the domain-separated bytes `UTF8("predge-body-v1\\n") || body`. Both headers are mandatory for this settlement-risk endpoint.

## Successful real-market proof (all SHA256 lowercase hex)

```json
{
  "schema": "geomacro.predge-market-independent-verification.v1",
  "issuer": "predge.io",
  "attestation_kid": "13fa3d18a369e6c7",
  "market_id": "5710779",
  "payload_version": "3",
  "sha256_canonical_payload": "0a596e0dcac4200ce570232dabb3276f4db0b58e7b28916f3571f1d89bb3ab19",
  "context_sha256": "344ab544a95d5a74981aedba9caeb81b67c29a94381843c12c1efef7e033b387",
  "sha256_exact_body": "898e80523a10895fe77644f9e0f25551245a670727995b26d02d04030c3e0561",
  "verified_canonical_signature": true,
  "verified_envelope_signature": true,
  "verified_detached_body_signature": true,
  "active_pinned_public_key": true,
  "uma_vote_recorded": true,
  "research_only": true,
  "commercial_redistribution_authorized": false,
  "gro_produced": false,
  "risk_gate_execution_authorized": false,
  "payments": 0,
  "supabase_writes": 0
}
```

This is a **point-in-time cryptographic integrity and source-key trust receipt**, not independent confirmation that every factual claim on the blockchain is true, that commercial derived-use licenses exist, or that the market remains in the same state forever.

## Negative tests required

`node --test scripts/ops/verify-predge-signed-market.test.mjs`
covers: retired/revoked/unpinned signer refusal, canonical text and Unicode, tampered original market/context, corrupted signed payload, tampered whole-envelope, mutated raw HTTP body, wrong detached body signature, role-confused oracle key and fail-closed no paid actions.

## Deliberately still pending

1. **Genuine current Geomacro signed GRO:** the Predge verified market record is not a Geomacro GRO; cannot be converted to a certified numerical score by renaming hashes or IDs. Require actual Geomacro facts/rights authorization, production Ed25519 signing authority, B2 exact readback and D1 hot acceptance.
2. **Paid Risk Gate:** separate protected `PREDGE_RISK_GATE_TOKEN`, genuine current eligible signed country/corridor GRO and partner acceptance. `execution_authorized=false` remains mandatory; no trading execution.
3. **Commercial arrangement:** Predge promised monthly category/call volume/refresh/history scope **30 October 2026**, negotiation target **18 November 2026**. No monthly price, resale rights or revenue share signed.
4. **Supabase exit:** 779 private official-source directory rows migrated, but outstanding legacy immutable commerce/customer ledger, original archive bytes, other application tables, and old Edge Functions prevent declaring full removal.

Research JSON and existing signed test GRO verification remain independently accepted, but these are not paid-product GO certificates.
