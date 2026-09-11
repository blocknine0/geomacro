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

Current credit costs and Testnet call prices:

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

Only capabilities with accepted external routes should be treated as currently callable. The table also records the Testnet pricing contract for capabilities that are still being wired to dedicated developer endpoints.

## Developer credentials

After wallet verification, Testnet developer access is provisioned without an upfront payment. Create credentials from the Testnet Access page.

Geomacro returns two values once:

- `API Key`, prefixed with `gmk_test_`
- `API Secret`, prefixed with `gms_test_`

Store both securely. The API Secret is not shown again. Geomacro stores the public API Key identifier and a SHA-256 hash of the API Secret, not the plaintext secret.

A tester can keep up to three active Testnet developer credentials and can revoke them from the Testnet Access page.

## Authentication

Send both credentials. The current route accepts either the Testnet Authorization scheme:

```text
Authorization: GeomacroTest <API_KEY>.<API_SECRET>
Content-Type: application/json
```

or the explicit pair headers:

```text
X-Geomacro-Api-Key: <API_KEY>
X-Geomacro-Api-Secret: <API_SECRET>
Content-Type: application/json
```

A Testnet API Key without its matching API Secret is rejected.

## Pay-per-call flow

Endpoint:

```text
POST /api/commercial/structural
```

### 1. Request a quote

Send the request with the API credential pair and no payment proof:

```bash
curl -X POST "https://geomacro.live/api/commercial/structural" \
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

For a Testnet credential, the endpoint returns HTTP `402` with the exact payment quote. For `structural_country_digest`, that quote is 3 credits × 0.5 Testnet USDC = 1.5 Testnet USDC.

The quote includes the dedicated receiver, supported Testnet chains, required atomic amount, credit cost and pricing version.

### 2. Pay only that call

Send the quoted Testnet USDC amount from the same verified tester wallet on one supported chain:

- Arc Testnet
- Base Sepolia
- Polygon Amoy

### 3. Retry the same request ID with payment proof

```bash
curl -X POST "https://geomacro.live/api/commercial/structural" \
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

Geomacro verifies the chain identity, official Testnet USDC contract, payer wallet, dedicated receiver, confirmed receipt and minimum amount. The same transaction cannot pay for another request, and the same `request_id` cannot be rebound to a different capability or payment proof.

Supported structured capabilities on the current external route:

- `structural_country_digest`
- `structural_corridor_digest`
- `structural_country_profile`
- `structural_corridor_profile`

The wider Testnet entitlement registry also contains intelligence, GRI, signed Risk Object, Risk Gate and agent scopes. Those capabilities should only be advertised as external developer endpoints after their dedicated routes pass the same end-to-end acceptance gate.

## Safety boundaries

Testnet API responses do not provide raw private-warehouse access and do not authorize execution. Testnet settlement is never classified as commercial revenue. Mainnet and commercial production pricing are separate and are not changed by this Testnet contract.
