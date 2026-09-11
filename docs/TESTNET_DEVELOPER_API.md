# Geomacro Testnet Developer API

This document applies only to Geomacro Testnet access. It does not define mainnet or production pricing.

## Testnet quota

- Fixed quota: 500 credits
- Testnet price per credit: 0.5 Testnet USDC
- Fixed activation total: 250 Testnet USDC
- Duration: 30 days
- Identity: one verified EVM wallet
- Settlement classification: Testnet only, non-revenue

## Developer credentials

After the tester quota is active, create developer credentials from the Testnet Access page.

Geomacro returns two values once:

- `API Key`, prefixed with `gmk_test_`
- `API Secret`, prefixed with `gms_test_`

Store both securely. The API Secret is not shown again. Geomacro stores the public API Key identifier and a SHA-256 hash of the API Secret, not the plaintext secret.

A tester can keep up to three active Testnet developer credentials and can revoke them from the Testnet Access page.

## Authentication

For the current external structured-intelligence endpoint, send the pair in the Authorization header using the Testnet scheme:

```text
Authorization: GeomacroTest <API_KEY>.<API_SECRET>
Content-Type: application/json
```

A Testnet API Key without its matching API Secret is rejected.

## Structured intelligence request

Endpoint:

```text
POST /api/commercial/structural
```

Example country request:

```bash
curl -X POST "https://geomacro.live/api/commercial/structural" \
  -H "Authorization: GeomacroTest gmk_test_EXAMPLE.gms_test_EXAMPLE" \
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

Supported structured capabilities on the current external route:

- `structural_country_digest`
- `structural_corridor_digest`
- `structural_country_profile`
- `structural_corridor_profile`

The wider Testnet entitlement registry also contains intelligence, GRI, signed Risk Object, Risk Gate and agent scopes. Those capabilities should only be advertised as external developer endpoints after their dedicated routes pass the same end-to-end acceptance gate.

## Safety boundaries

Testnet API responses do not provide raw private-warehouse access and do not authorize execution. Testnet settlement is never classified as commercial revenue.
