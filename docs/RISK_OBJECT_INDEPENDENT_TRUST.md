# Geomacro Risk Object independent trust

Status: implemented trust-hardening contract for newly published signed Risk Objects. Onchain registry deployment is an operational step and is not implied by source code alone.

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

Initial Coinbase/x402 anchor target:

```text
Base Sepolia
chain id: 84532
CAIP-2: eip155:84532
```

Arc Testnet can use the same contract and the same Geomacro trust document as a second anchor:

```text
Arc Testnet
chain id: 5042002
CAIP-2: eip155:5042002
```

The runtime advertises a registry address only when one is explicitly configured. An unconfigured address is reported as `not_configured`; the API must never invent or imply a deployment.

## Base Sepolia deployment

Use an authorized deployment wallet through a local environment or CI secret. Never paste a private key into source control, an issue, a log, or chat.

```bash
forge test --match-contract RiskKeyRegistryTest

forge script script/DeployRiskKeyRegistry.s.sol:DeployRiskKeyRegistry \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast
```

After deployment, keep the returned address as:

```text
RISK_OBJECT_KEY_REGISTRY_BASE_SEPOLIA=0x...
```

Publish and activate the current public Risk Object signing key:

```bash
export RISK_KEY_REGISTRY_ADDRESS="$RISK_OBJECT_KEY_REGISTRY_BASE_SEPOLIA"
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

Optional public onchain anchors:

```text
RISK_OBJECT_KEY_REGISTRY_BASE_SEPOLIA
RISK_OBJECT_KEY_REGISTRY_ARC_TESTNET
```

The two registry-address variables are public addresses, not secrets.

## Rotation policy

1. Generate a new Ed25519 key pair outside source control.
2. Add the new public key to the governed verification registry with a new unique `key_id`.
3. Publish the public-key hash under the same `key_id` in each configured onchain registry.
4. Switch issuer signing to the new key.
5. Keep the previous key as `retired` while historical signatures need verification.
6. Use `revoked` only when a key should no longer validate, for example after compromise.

Consumers should resolve the `signing_key_id` through the fixed JWKS path and, when policy requires stronger anchoring, compare the public SPKI hash with the configured onchain registry before trusting a current artifact.
