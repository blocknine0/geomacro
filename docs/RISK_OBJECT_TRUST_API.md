# Geomacro Risk Object Trust API

Status: public verification contract for `gro-1.1` artifacts.

## Purpose

Geomacro Risk Objects are signed, machine-readable risk artifacts. External software must be able to verify that an artifact was issued by Geomacro, has not been modified, uses the current supported contract/methodology, and is still fresh enough for current use.

This trust surface does not authorize execution and does not expose private signing material.

## Endpoint

`GET /api/risk-object-keys`

Returns the public Ed25519 verification-key registry, key lifecycle metadata, canonicalization scheme, and signature scheme. Public keys may be cached briefly; revocation/rotation changes are configured to propagate quickly.

`POST /api/risk-object-keys`

Request:

```json
{
  "risk_object": {
    "schema_version": "gro-1.1"
  }
}
```

The request object above is abbreviated. Clients should submit the complete signed Geomacro Risk Object exactly as received.

The endpoint accepts JSON only and applies a bounded request-body limit. Verification always uses the server-controlled trusted key registry. A caller cannot inject an alternative public key or trust root.

## Verification result

A successful verification operation returns HTTP 200 even when the artifact itself is invalid. This separates transport/service success from the verification outcome.

Core fields:

- `verification.valid`: true only when contract, issuer, methodology, payload integrity, signature/key lifecycle, timestamps, and current freshness all pass.
- `verification.status`: `VERIFIED`, `EXPIRED`, or `INVALID`.
- `verification.cryptographic_valid`: payload hash and Ed25519 signature/key-lifecycle checks passed.
- `verification.contract_valid`: current Geomacro contract/issuer/subject/methodology/integrity metadata checks passed.
- `verification.fresh`: the artifact has not expired at verification time.
- `verification.reason_codes`: deterministic machine-readable reasons for any failed check.
- `verification.checks`: per-check booleans suitable for agent policy and audit logs.
- `verification.artifact`: non-secret artifact identifiers and signed integrity references.

An expired artifact may remain `cryptographic_valid=true` for historical audit while `valid=false` for current use.

## Integrity boundary

The public trust endpoint recalculates the signed payload hash and verifies the Ed25519 signature against the trusted key registry. It also checks that `input_hash`, `data_hash`, and `calculation_hash` are present in the signed artifact.

It does not independently recalculate `input_hash`, `data_hash`, or `calculation_hash` because that requires the governed source-evidence set and the exact methodology execution. Those hashes are the bridge to Geomacro's separate reproducibility/change-attribution proof layer.

## Failure semantics

Malformed JSON, missing `risk_object`, unsupported content type, and oversized request bodies return 4xx responses.

A broken server-side verification-key registry returns 503 and does not silently accept the object.

A well-formed but tampered, unknown-key, revoked-key, unsupported-methodology, malformed, or expired Risk Object returns a deterministic verification report and never becomes trusted by fallback.

## Security and execution boundary

- private signing keys are never returned;
- caller-supplied verification keys are not accepted;
- the verification operation is read-only;
- verification responses are not cached;
- the endpoint does not submit transactions, sign customer actions, or authorize execution;
- Geomacro Risk Gate retains `execution_authorized=false`.

## Canonicalization and independent verification

The public canonicalization specification is `docs/GRO_CANONICAL_JSON_V1.md`.

The deterministic test vector is `docs/examples/gro-1.1-canonical-v1-test-vector.json`, with a repository test at `src/__tests__/canonical-json-v1-test-vector.test.ts`. These define and lock the exact canonical byte framing, SHA-256 payload hash, and Ed25519 verification procedure for independent consumers.

Consumers should reproduce the canonical UTF-8 bytes and payload hash, then verify the Ed25519 signature using the trusted public key returned by `/api/risk-object-keys`.

## Federico strict evidence profile

Federico handoff artifacts may use the signed `FEDERICO_STRICT` delivery profile. This profile is intentionally narrower than the general canonical publisher path: it uses recent `live_flash_event_families` that are actively verified, requires direct country linkage, records source URLs and source-family identities, applies a six-hour evidence-age ceiling, and applies a three-hour ceiling plus two-source (or explicitly allowlisted major-source) corroboration for high-impact conflict/military evidence.

The strict profile also signs a reproducibility manifest containing the exact calculation input, score components, evidence-selection policy and data-hash projection. A receiver can recompute the input hash, data hash, score, aggregate confidence and calculation hash without receiving raw provider payloads.

The artifact binds the active public Ed25519 key, the public trust-registry URL and the canonicalization specification URL inside the signed `integrity` object. Receivers should still resolve `signing_key_id` through the trusted registry and verify the signature rather than treating the embedded key as a trust root.
## Seven-day rolling refresh

The production country Risk Object validity window is intentionally short-lived: each signed artifact carries a bounded `expires_at` based on the active Risk Object TTL. The Federico handoff uses a rolling refresh rather than extending one signed artifact across seven days.

The current refresh workflow runs every two hours during the handoff window, publishes a fresh production-signed Risk Object, re-verifies the persisted payload, proves one-field tamper rejection, and stores a historical handoff artifact for that refresh alongside the fixed latest alias. The current production TTL remains three hours, leaving a one-hour freshness buffer between scheduled refreshes.

Never edit or extend `expires_at` on an already-signed artifact. A new observation requires a newly generated and newly signed artifact so the canonical payload hash, signature, timestamps, and provenance remain bound together.
## Canonical gro-1.1 JSON Schema

Repository source: `schemas/gro-1.1.schema.json`.

The JSON Schema mirrors the canonical TypeScript contract in `src/lib/risk-object-contract.ts`. Complete signed Risk Objects must still be transported unchanged for payload-hash and Ed25519 verification.
