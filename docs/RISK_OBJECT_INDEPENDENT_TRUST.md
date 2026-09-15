# Geomacro Risk Object independent trust

Status: implemented and independently verified on Base Sepolia. The canonical Base Sepolia RiskKeyRegistry was deployed and the current Ed25519 Risk Object verification-key hash was published and activated on 2026-09-15. Arc Testnet remains an optional second anchor.

## Why this exists

A signature is useful only if the consumer can discover the issuer verification key independently of the API response that delivered the signed object. Freshness metadata must also be inside the signed payload so an intermediary cannot relabel an old object as a new observation.

Geomacro therefore separates payment settlement from intelligence authenticity:

- Coinbase/CDP x402, GOAT x402 or another payment rail proves settlement for the resource request.
- The Geomacro Risk Object signature proves the delivered risk artifact was signed by the Geomacro issuer key and was not modified afterward.
- `observed_at`, `generated_at` and `expires_at` travel with the signed artifact. Newly published country and corridor Risk Objects bind `observed_at` before Ed25519 signing.

## Independent discovery

Canonical public trust surfaces:

- `GET https://geomacro.live/.well-known/jwks.json`
- `GET https://geomacro.live/.well-known/geomacro-risk-keys.json`
- `GET https://geomacro.live/api/risk-object-keys`
- `POST https://geomacro.live/api/risk-object-keys` to verify a complete signed Risk Object against the server-controlled trusted key registry.

The JWKS endpoint converts the governed Ed25519 SPKI verification registry into standard OKP/Ed25519 JWK entries. Private signing material is never returned.

The paid agentic response includes both the complete signed `risk_object` and `risk_object_trust` discovery metadata. The complete object must be preserved because projecting only selected fields invalidates the canonical payload hash and signature.

## Signed observation timestamp

For newly published artifacts, the publisher adds `observed_at` before signing. The publisher enforces:

```text
observed_at <= generated_at <= expires_at
```

Changing `observed_at` after signing changes the canonical payload and causes payload-hash/signature verification to fail. This prevents an unsigned HTTP header or wrapper from making a stale signed observation appear fresh.

Historical `gro-1.1` artifacts that predate this hardening may not contain `observed_at`; they remain historical artifacts. New publication paths bind the field before signing.

## Onchain key registry

`contracts/RiskKeyRegistry.sol` is a chain-neutral EVM trust anchor. It stores only public verification metadata:

- `keyId` hash
- `keccak256(bytes(public_key_spki_b64))`
- canonical JWKS URI
- validity window
- revocation state
- active key identifier hash

The contract never receives or stores the Ed25519 private signing key. A published `keyId` binding cannot be overwritten. Key compromise is handled by revocation; ordinary rotation publishes a new unique key ID and changes the active key.

Canonical Coinbase/x402 anchor:

```text
Base Sepolia
chain id: 84532
CAIP-2: eip155:84532
RiskKeyRegistry: 0xb1881d2f0026395d5016b90031a8acc651a2e316
```

Arc Testnet can use the same contract and the same Geomacro trust document as a second anchor:

```text
Arc Testnet
chain id: 5042002
CAIP-2: eip155:5042002
```

The verified Base Sepolia address is source-controlled in `src/lib/risk-object-trust-discovery.server.ts`, so the public trust-discovery endpoint cannot silently change that trust anchor through mutable hosting configuration. Arc Testnet remains configuration-driven until an independently verified deployment is pinned in the same way.

## Verified Base Sepolia deployment

The deployment and key publication completed through the bounded GitHub Actions deployment workflow after all five `RiskKeyRegistry` contract tests passed.

```text
Registry: 0xb1881d2f0026395d5016b90031a8acc651a2e316
Owner: 0x0C8fb1055C22dF132659f3C453dd7B2093f7AD58
Deploy tx: 0xc048a319148e37b4dd12fd035d72bd6375b54151414a6c99fb32f6e8b6e0a04f
Key ID: geomacro-risk-2026-02
Public-key hash: 0xcd1f77d2d9f72408d45deb71f46b19195cc82902c05a8a0946c77e66e1dcc258
Public-key fingerprint (SHA-256): 526a7956d2a9ccd10b94d05fd4bc19e4464f1e431734bc60ab5b0d9c9b1ad6ec
```

Key publication/activation transactions:

```text
0xd5539f5c37f836b1e55863859b656e2f3b02f9a541369272e81c7069f68abffb
0x939b6e80ce05524f37c319b99b2e9876ac3e6c3d2676c271deabd171f208e4be
```

The workflow independently verified deployed bytecode, owner, active key ID and current key usability after broadcast. It persisted no deployment private key and did not authorize Risk Gate execution.

Permanent sanitized evidence is committed at:

```text
docs/evidence/base-sepolia-risk-key-registry-2026-09-15.json
```

The originating GitHub Actions run was `34996472294`; the uploaded artifact digest was `sha256:ef5929294b75fe6b900404534c96b98dfad588613c1cd5534be8fe699270bbfb`.

## Reproducing deployment and publication

Use an authorized deployment wallet through a local environment or CI secret. Never paste a private key into source control, an issue, a log, or chat.

```bash
forge test --match-contract RiskKeyRegistryTest

forge script script/DeployRiskKeyRegistry.s.sol:DeployRiskKeyRegistry \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast
```

For a newly authorized registry deployment, publish and activate the current public Risk Object signing key with:

```bash
export RISK_KEY_REGISTRY_ADDRESS="<verified-registry-address>"
export RISK_OBJECT_JWKS_URI="https://geomacro.live/.well-known/jwks.json"

forge script script/PublishRiskKey.s.sol:PublishRiskKey \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast
```

`PublishRiskKey.s.sol` hashes the configured public SPKI value locally and sends only that public hash and lifecycle metadata to the registry.

## Runtime configuration

Existing issuer signing configuration remains authoritative:

```text
RISK_OBJECT_SIGNING_KEY_ID
RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64
RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64
RISK_OBJECT_VERIFY_KEYS_JSON
```

The canonical Base Sepolia registry is now pinned in source and does not require a hosting environment variable for discovery. `RISK_OBJECT_KEY_REGISTRY_BASE_SEPOLIA`, where still present in deployment templates, is a public compatibility/configuration value and must equal the canonical address above if used.

Arc Testnet remains optional and configuration-driven:

```text
RISK_OBJECT_KEY_REGISTRY_ARC_TESTNET
```

Registry addresses are public addresses, not secrets.

## Rotation policy

1. Generate a new Ed25519 key pair outside source control.
2. Add the new public key to the governed verification registry with a new unique `key_id`.
3. Publish the public-key hash under the same `key_id` in each configured onchain registry.
4. Switch issuer signing to the new key.
5. Keep the previous key as `retired` while historical signatures need verification.
6. Use `revoked` only when a key should no longer validate, for example after compromise.

Consumers should resolve the `signing_key_id` through the fixed JWKS path and, when policy requires stronger anchoring, compare the public SPKI hash with the configured onchain registry before trusting a current artifact.
