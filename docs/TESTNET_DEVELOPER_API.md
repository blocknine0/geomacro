# Geomacro Testnet Developer API

This document applies only to Geomacro Testnet access. It does not define mainnet or production pricing.

## Testnet usage model

- Maximum usage: 500 credits per 30 days
- Testnet price: 0.5 Testnet USDC per consumed credit
- Payment model: pay per API call
- Upfront activation payment: none
- Identity: one verified EVM wallet
- Settlement classification: Testnet only, non-revenue

The 500-credit number is a usage cap, not a prepaid balance. A developer pays only when making a metered API call.

| Capability | Credits | Testnet USDC per call |
| --- | ---: | ---: |
| `intelligence_query` | 1 | 0.5 |
| `gri_read` | 1 | 0.5 |
| `structural_country_digest` | 3 | 1.5 |
| `structural_corridor_digest` | 5 | 2.5 |
| `structural_country_profile` | 8 | 4.0 |
| `structural_corridor_profile` | 12 | 6.0 |
| `signed_risk_object` | 10 | 5.0 |
| `risk_gate_bundle` | 15 | 7.5 |

All eight capabilities are served through the same canonical Testnet intelligence service. The browser tester console and developer credential API do not maintain separate risk data stores.

## What Testnet users receive

The Testnet API reads from the same Geomacro intelligence pipeline used by the product:

`real-world evidence → normalized/classified provenance-preserving state → structured intelligence → governed API output`

Depending on capability, responses can include:

- grounded geopolitical and macro intelligence summaries;
- the current verified Global Risk Index, previous score, change points and change attribution;
- GRI coverage, weighted confidence, methodology/proof versions and integrity hashes;
- governed country and directional-corridor structural observations and coverage metadata;
- live severity context from the structured-event layer;
- signed Geomacro Risk Objects with risk score, confidence, attribution, safe evidence references, methodology, provenance versions, verification state and integrity/signature fields;
- Risk Gate decision context with the referenced signed Risk Object, structural context and canonical GRI context.

Raw private-warehouse access and upstream news-source URLs/identities are not part of Testnet machine delivery. Risk Gate remains context-only and always returns `execution_authorized=false`.

## Developer credentials

After wallet verification, Testnet developer access is provisioned without an upfront payment. Create credentials from the Testnet Access page.

Geomacro returns two values once:

- `API Key`, prefixed with `gmk_test_`
- `API Secret`, prefixed with `gms_test_`

Store both securely. The API Secret is not shown again. Geomacro stores the public API Key identifier and a SHA-256 hash of the API Secret, not the plaintext secret.

A tester can keep up to three active Testnet developer credentials and can revoke them from the Testnet Access page.

## Authentication

Send both credentials. The Testnet developer endpoint accepts either:

```text
Authorization: GeomacroTest <API_KEY>.<API_SECRET>
Content-Type: application/json
```

or:

```text
X-Geomacro-Api-Key: <API_KEY>
X-Geomacro-Api-Secret: <API_SECRET>
Content-Type: application/json
```

A Testnet API Key without its matching API Secret is rejected.

## Developer endpoint

```text
POST /api/testnet/intelligence
```

The browser tester console uses the same delivery service through its authenticated tester-session route. Developer integrations use the API Key + API Secret endpoint above.

## Pay-per-call flow

### 1. Request a quote

Example: country digest.

```bash
curl -X POST "https://geomacro.live/api/testnet/intelligence" \
  -H "X-Geomacro-Api-Key: gmk_test_EXAMPLE" \
  -H "X-Geomacro-Api-Secret: gms_test_EXAMPLE" \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "tester-request-0001",
    "capability": "structural_country_digest",
    "subject": {
      "type": "country",
      "country_iso3": "IND"
    }
  }'
```

The endpoint returns HTTP `402` with the exact quote. For this capability the amount is 3 credits × 0.5 Testnet USDC = 1.5 Testnet USDC.

The quote includes the dedicated receiver, supported Testnet chains, required atomic amount, credit cost and pricing version.

### 2. Pay only that call

Send the quoted Testnet USDC amount from the same verified tester wallet on one supported chain:

- Arc Testnet
- Base Sepolia
- Polygon Amoy

### 3. Retry the same request ID with payment proof

```bash
curl -X POST "https://geomacro.live/api/testnet/intelligence" \
  -H "X-Geomacro-Api-Key: gmk_test_EXAMPLE" \
  -H "X-Geomacro-Api-Secret: gms_test_EXAMPLE" \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "tester-request-0001",
    "capability": "structural_country_digest",
    "subject": {
      "type": "country",
      "country_iso3": "IND"
    },
    "payment": {
      "chain_key": "baseSepolia",
      "tx_hash": "0xYOUR_CONFIRMED_TESTNET_TX_HASH",
      "payer_address": "0xYOUR_VERIFIED_TESTER_WALLET"
    }
  }'
```

Geomacro verifies the chain identity, Testnet USDC contract, payer wallet, dedicated receiver, confirmed receipt and required amount. The same transaction cannot pay for another request, and the same `request_id` cannot be rebound to a different capability or payment proof.

## Request shapes

### Intelligence query

```json
{
  "request_id": "query-request-0001",
  "capability": "intelligence_query",
  "question": "What geopolitical or macro risk changed recently?"
}
```

### Global Risk Index

```json
{
  "request_id": "gri-request-00001",
  "capability": "gri_read",
  "subject": { "type": "global" }
}
```

### Signed Risk Object

```json
{
  "request_id": "gro-request-00001",
  "capability": "signed_risk_object",
  "subject": { "type": "country", "country_iso3": "USA" }
}
```

Country and corridor subjects are supported for signed Risk Objects when a compatible current object exists.

### Risk Gate bundle

```json
{
  "request_id": "gate-request-0001",
  "capability": "risk_gate_bundle",
  "subject": { "type": "country", "country_iso3": "USA" },
  "policy_preset": "balanced",
  "action_type": "agent_payment",
  "amount_usdc": 5000
}
```

Risk Gate policy presets are `balanced`, `cautious` and `strict`. The result provides decision context only. Geomacro does not authorize or submit the downstream action.

## Safety boundaries

- Testnet only; Testnet settlements are non-revenue.
- No upfront 250 Testnet USDC payment.
- 500 credits is a 30-day maximum usage cap.
- No raw private-warehouse customer access.
- No upstream news-source URL/identity delivery in machine responses.
- No execution authorization.
- Mainnet and commercial production pricing are separate and unchanged by this Testnet contract.
