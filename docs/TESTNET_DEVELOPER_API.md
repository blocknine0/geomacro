# Geomacro Testnet Developer API

This document applies only to Geomacro Testnet access. It does not define mainnet or production pricing.

The browser Testnet surface and developer API use the same canonical Geomacro intelligence pipeline. There is no separate API-only risk database.

## API endpoints

| Method | Endpoint | Authentication | Metered |
| --- | --- | --- | --- |
| `GET` | `/api/testnet/manifest` | none | no |
| `GET` | `/api/testnet/account` | API Key + API Secret | no |
| `POST` | `/api/testnet/intelligence` | API Key + API Secret | yes, pay per call |

`GET /api/testnet/manifest` is the machine-readable source for the current Testnet API version, exact capability list, per-capability Testnet price, supported Testnet USDC chains, request examples, full product map and permanent delivery boundaries.

`GET /api/testnet/account` returns the authenticated tester's active entitlement, current 30-day credit account, credits used/remaining, period end, exact capability prices, supported payment chains and receiver address. It does not consume credits.

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

All eight capabilities are served through the same canonical Testnet intelligence service.

## What Testnet users receive through API

The Testnet API reads from the same Geomacro intelligence pipeline used by the product:

`real-world evidence → normalized/classified provenance-preserving state → structured intelligence → governed API output`

The complete Testnet machine-readable product surface is:

- `intelligence_query`: stored geopolitical and macro intelligence Q&A with summary, what changed, why it matters, Geomacro view, confidence flags, GRI context, bounded evidence references and provenance;
- `gri_read`: canonical global GRI with current/previous display and raw score, exact delta, coverage, weighted confidence, event/source/story counts, methodology/proof versions, proof/evidence/calculation/input/methodology/disposition/change hashes, reconciliation residuals, mathematical change attribution, top driver and freshness age;
- `structural_country_digest` / `structural_country_profile`: country structural intelligence, current Testnet live severity, observations, coverage, provenance IDs, timestamps, normalized hashes, methodology status and quality status;
- `structural_corridor_digest` / `structural_corridor_profile`: directional corridor structural intelligence with the same provenance/coverage fields plus corridor composition context;
- `signed_risk_object`: latest compatible canonical signed Geomacro Risk Object for a country or corridor plus current public cryptographic verification;
- `risk_gate_bundle`: the full machine-decision bundle containing Risk Gate decision/reasons, action context, resolved policy, signed Risk Object + verification, structural country/corridor profile, current severity, provenance/coverage and canonical GRI with change attribution/proof hashes.

For an autonomous system that wants the broadest Geomacro decision context in one response, use `risk_gate_bundle`.

Raw private-warehouse access and upstream news-source URLs/identities are not part of Testnet machine delivery. Risk Gate remains context-only and always returns `execution_authorized=false`.

## Developer credentials

After wallet verification, Testnet developer access is provisioned without an upfront payment. Create credentials from the Testnet Access page.

Geomacro returns two values once:

- `API Key`, prefixed with `gmk_test_`
- `API Secret`, prefixed with `gms_test_`

Store both securely. The API Secret is not shown again. Geomacro stores the public API Key identifier and a hash of the API Secret, not the plaintext secret.

A tester can keep up to three active Testnet developer credentials and can revoke them from the Testnet Access page.

## Authentication

Send both credentials. Preferred form:

```text
Authorization: GeomacroTest <API_KEY>.<API_SECRET>
```

Alternate form:

```text
X-Geomacro-Api-Key: <API_KEY>
X-Geomacro-Api-Secret: <API_SECRET>
```

A Testnet API Key without its matching API Secret is rejected.

## Discover the current API contract

```bash
curl https://geomacro.live/api/testnet/manifest
```

Integrations should read this manifest instead of hardcoding a copied capability list or price table.

## Read account, quota and payment configuration

```bash
curl https://geomacro.live/api/testnet/account \
  -H 'Authorization: GeomacroTest <API_KEY>.<API_SECRET>'
```

This returns the active entitlement, current credit-account status, exact capability prices, supported Testnet USDC chain configuration and dedicated receiver address without consuming credits.

## Pay-per-call intelligence flow

### 1. Send the intelligence request without payment proof

Example: country digest.

```bash
curl -X POST "https://geomacro.live/api/testnet/intelligence" \
  -H 'Authorization: GeomacroTest <API_KEY>.<API_SECRET>' \
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

Geomacro preflights capability/data availability before requesting payment. If the request is eligible, the endpoint returns HTTP `402` with the exact quote. For this capability the amount is 3 credits × 0.5 Testnet USDC = 1.5 Testnet USDC.

The quote includes the dedicated receiver, supported Testnet chains, required atomic amount, credit cost and pricing version.

### 2. Pay only that call

Send the quoted Testnet USDC amount from the same verified tester wallet on one supported chain:

- Arc Testnet
- Base Sepolia
- Polygon Amoy

### 3. Retry the same request ID with payment proof

Keep the original intelligence fields unchanged and add the payment proof:

```json
{
  "payment": {
    "chain_key": "arcTestnet",
    "tx_hash": "0xYOUR_CONFIRMED_TESTNET_TX_HASH",
    "payer_address": "0xYOUR_VERIFIED_TESTER_WALLET"
  }
}
```

Geomacro verifies the supported chain, Testnet USDC contract, payer wallet, dedicated receiver, confirmed receipt and exact required amount. Only then does it consume credits and deliver the canonical response.

The same transaction cannot pay for another request. The same `request_id` cannot be rebound to a different capability. Retrying an already-settled request is idempotent and must not double-charge payment or credits.

## Request examples

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

### Country structural profile

```json
{
  "request_id": "country-profile-0001",
  "capability": "structural_country_profile",
  "subject": { "type": "country", "country_iso3": "IND" }
}
```

### Corridor structural profile

```json
{
  "request_id": "corridor-profile-0001",
  "capability": "structural_corridor_profile",
  "subject": {
    "type": "corridor",
    "origin_country_iso3": "IND",
    "destination_country_iso3": "SGP"
  }
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

### Full Risk Gate bundle

```json
{
  "request_id": "gate-request-0001",
  "capability": "risk_gate_bundle",
  "subject": {
    "type": "corridor",
    "origin_country_iso3": "IND",
    "destination_country_iso3": "SGP"
  },
  "policy_preset": "balanced",
  "action_type": "agent_payment",
  "amount_usdc": 1000
}
```

Risk Gate policy presets are `balanced`, `cautious` and `strict`. The result provides decision context only. Geomacro does not authorize or submit the downstream action.

## Successful response contract

A successful metered response includes:

- original `request_id` and a Geomacro `delivery_id`;
- operations-ledger `usage_event_id` when audit recording succeeds;
- principal key ID and active Testnet entitlement;
- capability credit cost, remaining credits and period end;
- verified Testnet payment details and central `payment_event_id`;
- canonical capability `data`;
- response SHA-256 and generation timestamp;
- machine-delivery boundaries.

Depending on capability, `data` contains GRI proof/change-attribution fields, structural observations/coverage/provenance, signed Risk Object material and verification, or Risk Gate decision context.

## Permanent safety boundaries

- Testnet only; Testnet settlements are non-revenue.
- No upfront 250 Testnet USDC payment.
- 500 credits is a 30-day maximum usage cap.
- No raw private-warehouse customer access.
- No upstream news-source URL/identity delivery in machine responses.
- No execution authorization.
- Mainnet and commercial production pricing are separate and unchanged by this Testnet contract.
