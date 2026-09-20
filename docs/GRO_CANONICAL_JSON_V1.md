# Geomacro Canonical JSON v1

Status: public verification specification for signed `gro-1.1` Risk Objects.

Canonicalization identifier: `geomacro-canonical-json-v1`

Signature scheme: `Ed25519`

## 1. Canonical byte pipeline

A Risk Object is canonicalized from its already-parsed JSON data model.

1. Only JSON values are accepted: `null`, boolean, finite number, string, array, and plain object.
2. Object keys are sorted recursively using JavaScript default UTF-16 code-unit ordering, equivalent to `Object.keys(value).sort()` in the reference implementation.
3. Array order is preserved. Array elements are canonicalized recursively.
4. No insignificant JSON whitespace is emitted. There is no trailing newline.
5. Object member names and string values use the JSON escaping semantics of `JSON.stringify`.
6. Booleans serialize as `true` or `false`; null serializes as `null`.
7. Non-finite numbers are rejected.
8. Negative zero is serialized as `0`.
9. Values outside the JSON data model, including `undefined`, functions, symbols, and BigInt, are rejected.
10. The canonical JSON string is encoded as UTF-8 to obtain the exact cryptographic message bytes.

The normative production signing implementation is `src/lib/risk-object-signing.server.ts::canonicalRiskObjectJson`. The general-purpose helper `src/lib/canonical-json.ts` implements the same JSON data-model serialization rules.

## 2. Signable Risk Object framing

Start with the complete received Risk Object and change exactly these two fields:

```
integrity.payload_hash = null
integrity.signature = null
```

All other fields and values remain unchanged, including:

```
integrity.input_hash
integrity.data_hash
integrity.calculation_hash
integrity.canonicalization
integrity.signature_scheme
integrity.signing_key_id
```

The recursively canonicalized representation of that object, encoded as UTF-8, is the cryptographic message.

## 3. Payload hash

```
payload_hash = SHA-256(canonical_signable_json_utf8)
```

The digest is encoded as lowercase hexadecimal.

## 4. Ed25519 signature

```
signature = Ed25519_Sign(private_key, canonical_signable_json_utf8)
```

The signature is encoded as standard Base64.

Verification independently:

1. resolves `integrity.signing_key_id` through the trusted Geomacro public-key registry;
2. reconstructs the signable object by setting `integrity.payload_hash` and `integrity.signature` to `null`;
3. canonicalizes it using this specification;
4. recomputes the SHA-256 payload hash and compares it with `integrity.payload_hash`;
5. verifies the Base64-decoded Ed25519 signature over the exact same canonical UTF-8 bytes;
6. separately applies key lifecycle, schema, issuer, methodology, timestamps and freshness checks.

A payload-hash match alone is not sufficient for `VERIFIED`.

## 5. Encoding and key material

- JSON transport is UTF-8.
- `public_key_spki_b64` is an Ed25519 SubjectPublicKeyInfo DER structure encoded with Base64.
- The production private signing key is PKCS#8 DER encoded with Base64 and is never published.
- The Ed25519 signature is calculated over the canonical UTF-8 bytes, not over the hexadecimal payload hash.
- Consumers should parse the received JSON into the JSON data model, reconstruct the signable object, and then apply this specification.

## 6. Integrity hash boundary

`input_hash`, `data_hash`, and `calculation_hash` are governed provenance/calculation references. The public trust endpoint verifies that these fields are present and are themselves covered by the signed payload. It does not claim to recompute them from source evidence at the trust endpoint because that requires the governed source-evidence set and exact methodology execution.

`payload_hash` is directly reproducible from this specification and the received Risk Object.

## 7. Independent verification test vector

The repository includes a deterministic test vector at:

`docs/examples/gro-1.1-canonical-v1-test-vector.json`

It provides canonical signable JSON, payload hash, test-only Ed25519 public key, signature and expected verification outcome. The repository test `src/__tests__/canonical-json-v1-test-vector.test.ts` locks this vector so future implementation changes cannot silently change the published cryptographic contract.

## 8. Public trust endpoint

Use:

`GET /api/risk-object-keys`

The endpoint publishes the trusted verification-key registry, key lifecycle metadata, signature scheme and canonicalization identifier. The complete signed artifact should then be verified against the published key.
