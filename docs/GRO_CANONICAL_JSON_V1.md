# Geomacro Canonical JSON v1

Status: public verification specification for signed `gro-1.1` Risk Objects.

Canonicalization identifier: `geomacro-canonical-json-v1`

Signature scheme: `Ed25519`

Normative conformance appendix: `test-vectors/gro-canonical-json-v1-edge-vectors.json`

## 1. Canonical byte pipeline

A Risk Object is canonicalized from its already-parsed JSON data model.

1. Only JSON values are accepted: `null`, boolean, finite number, string, array, and plain object.
2. Object keys are sorted recursively using JavaScript default UTF-16 code-unit ordering, equivalent to `Object.keys(value).sort()` in the reference implementation.
3. Array order is preserved. Array elements are canonicalized recursively.
4. No insignificant JSON whitespace is emitted. There is no trailing newline.
5. Object member names and string values use the JSON escaping semantics of `JSON.stringify`.
6. Booleans serialize as `true` or `false`; null serializes as `null`.
7. Non-finite numbers are rejected.
8. Finite numbers use the ECMAScript `Number::toString` numeric rendering used by `JSON.stringify`. Non-JavaScript consumers MUST reproduce this exact decimal/exponential formatting rather than their language's native float representation.
9. Negative zero is serialized as `0`.
10. Values outside the JSON data model, including `undefined`, functions, symbols, and BigInt, are rejected.
11. The canonical JSON string is encoded as UTF-8 to obtain the exact cryptographic message bytes.

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

The signed `verification.status` field is a statement carried by the artifact and is not authoritative for the current verification state. Consumers MUST evaluate `expires_at` and other current freshness/lifecycle rules at verification time and use the verifier's current status. An expired object may therefore retain a signed `verification.status: VERIFIED` while the current verifier status is `EXPIRED`.

## 5. Encoding and key material

- JSON transport is UTF-8.
- `public_key_spki_b64` is an Ed25519 SubjectPublicKeyInfo DER structure encoded with Base64.
- The production private signing key is PKCS#8 DER encoded with Base64 and is never published.
- The Ed25519 signature is calculated over the canonical UTF-8 bytes, not over the hexadecimal payload hash.
- Consumers should parse the received JSON into the JSON data model, reconstruct the signable object, and then apply this specification.

## 6. Integrity hash boundary

`input_hash`, `data_hash`, and `calculation_hash` are governed provenance/calculation references. The public trust endpoint verifies that these fields are present and are themselves covered by the signed payload. It does not claim to recompute them from source evidence at the trust endpoint because that requires the governed source-evidence set and exact methodology execution.

`payload_hash` is directly reproducible from this specification and the received Risk Object.

## 7. Normative conformance appendix

The repository file `test-vectors/gro-canonical-json-v1-edge-vectors.json` is incorporated by reference into this specification and is the normative cross-language conformance appendix for `geomacro-canonical-json-v1`.

An implementation claiming conformance MUST:

1. parse `input_json_text` as JSON without filtering, rewriting, merging, or dropping object member names;
2. canonicalize the resulting JSON data model according to Section 1;
3. produce UTF-8 bytes whose decoded text is byte-for-byte identical to `canonical_json`;
4. compute SHA-256 over those exact UTF-8 bytes and obtain `canonical_sha256`;
5. preserve an own `__proto__` member as an ordinary JSON object member in the canonical bytes. It MUST NOT be interpreted as a prototype mutation, silently removed, or excluded from the signed representation.

A mismatch in either the canonical bytes or the digest is a conformance failure.

The normative vector covers recursive key ordering, UTF-16 code-unit ordering, ECMAScript number rendering, exponent thresholds, subnormal numbers, negative zero, string escaping, nested objects and arrays, and an own `__proto__` member. The production signing canonicalizer, the general-purpose TypeScript canonicalizer, and the independent Python implementation are all required by CI to reproduce the same normative bytes and digest.

For the `geomacro-canonical-json-v1` identifier, the published `canonical_json` and `canonical_sha256` values in this normative appendix are immutable. A specification change that would alter those expected bytes or their digest requires a new canonicalization identifier/version rather than silently changing v1. Additional conformance vectors may be added only when they are consistent with the existing v1 rules and all maintained reference implementations reproduce them.

Third-party implementations can run the repository's independent verifier against the normative appendix with:

```
python3 verifiers/python/verify_gro.py --vectors test-vectors/gro-canonical-json-v1-edge-vectors.json
```

Implementations do not need to use that verifier to conform; reproducing the normative `canonical_json` bytes and `canonical_sha256` digest independently is the interoperability requirement.

The signed Ed25519 reference artifact remains at `docs/examples/gro-1.1-canonical-v1-test-vector.json`. The smaller `docs/examples/gro-1.1-canonical-v1-edge-vectors.json` file is retained only as an illustrative example and is not the normative conformance appendix.

## 8. Public trust endpoint

Use:

`GET /api/risk-object-keys`

The endpoint publishes the trusted verification-key registry, key lifecycle metadata, signature scheme and canonicalization identifier. The complete signed artifact should then be verified against the published key.

## 9. Standalone independent verifier

`scripts/verify-gro-independent.mjs` is a standalone consumer-side reference verifier. It deliberately imports no Geomacro application signing, canonicalization, or verification code. It reconstructs the canonical signable payload from this specification, resolves the signing key from the public registry instead of trusting the object's embedded public key, recomputes `payload_hash`, verifies Ed25519, and derives present-time `VERIFIED` or `EXPIRED` status from `expires_at`.

Run the deterministic interoperability vectors with:

```
node scripts/verify-gro-independent.mjs --self-test
```

Run the normative cross-language conformance appendix with:

```
python3 verifiers/python/verify_gro.py --vectors test-vectors/gro-canonical-json-v1-edge-vectors.json
```

Verify a Risk Object against the live trust registry with:

```
node scripts/verify-gro-independent.mjs path/to/risk-object.json
```

A different registry endpoint may be supplied as the second argument for offline or partner-controlled test environments.
