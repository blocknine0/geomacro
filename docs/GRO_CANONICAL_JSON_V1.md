# Geomacro Canonical JSON v1

Status: public verification specification for signed gro-1.1 Risk Objects.
Canonicalization identifier: geomacro-canonical-json-v1
Signature scheme: Ed25519

## Canonical byte pipeline

1. Only JSON values are accepted: null, boolean, finite number, string, array, and plain object.
2. Object keys are sorted recursively using JavaScript default UTF-16 code-unit ordering (Object.keys(value).sort()).
3. Array order is preserved and elements are canonicalized recursively.
4. No insignificant JSON whitespace is emitted. There is no trailing newline.
5. Object member names and strings use JSON.stringify escaping semantics.
6. Non-finite numbers are rejected and negative zero is serialized as 0.
7. Values outside the JSON data model, including undefined, functions, symbols, and BigInt, are rejected.
8. The canonical JSON string is encoded as UTF-8.

The normative production implementation is src/lib/risk-object-signing.server.ts, function canonicalRiskObjectJson. src/lib/canonical-json.ts implements the same JSON data-model rules for general application use.

## Signed framing

For signing and payload hashing, start with the complete Risk Object and change exactly two fields: integrity.payload_hash = null and integrity.signature = null. All other fields remain unchanged, including input_hash, data_hash, calculation_hash, canonicalization, signature_scheme, and signing_key_id.

The resulting canonical UTF-8 bytes are the cryptographic message.

## Payload hash

payload_hash = SHA-256(canonical_signable_json_utf8), encoded as lowercase hexadecimal.

## Ed25519 signature

signature = Ed25519_Sign(private_key, canonical_signable_json_utf8), encoded as standard Base64.

Verification resolves signing_key_id through the trusted Geomacro public-key registry, reconstructs the signable representation, canonicalizes it, recomputes payload_hash, then verifies the Ed25519 signature over the exact same canonical UTF-8 bytes. Key lifecycle, contract, methodology and freshness checks are separate. A payload hash match alone is not sufficient for VERIFIED.

## Encoding

- JSON transport is UTF-8.
- public_key_spki_b64 is DER-encoded Ed25519 SubjectPublicKeyInfo, then Base64.
- The production private signing key is PKCS#8 DER, then Base64, and is never published.
- The signature is over canonical bytes, not over the hexadecimal payload hash.
- Consumers should parse the received JSON into the JSON data model, reconstruct the signable object, and then apply this specification rather than pretty-printing or reserializing arbitrary source text.

## Integrity hashes

input_hash, data_hash, and calculation_hash are governed provenance/calculation references. The public trust endpoint checks that these fields exist and are part of the signed payload; it does not claim to recompute them from source evidence. payload_hash is directly reproducible from this specification.

## Independent verification

A consumer can independently reproduce the exact canonical JSON bytes, SHA-256 payload hash, and Ed25519 verification using the public key from /api/risk-object-keys.

See docs/examples/gro-1.1-canonical-v1-test-vector.json for a deterministic test vector.

## Reference implementation

- src/lib/risk-object-signing.server.ts
- src/lib/risk-object-contract.ts
- GET /api/risk-object-keys
