# Geomacro Pay-Per-Call Production Activation

Status: READY FOR OWNER-CONTROLLED ACTIVATION. Real-USDC settlement remains disabled until the existing commercial launch gates are explicitly authorized.

## Canonical paid endpoint

`POST https://geomacro.live/api/x402/intelligence`

Product:

`geomacro_adaptive_risk_intelligence_v1`

The endpoint is designed for machine-native pay-per-call intelligence:

1. Client submits a valid deliverable query without payment.
2. Geomacro performs a no-charge deliverability check.
3. The endpoint returns HTTP 402 with x402 v2 payment requirements.
4. The payment payload is bound to the exact query plan.
5. Coinbase CDP verifies the payment authorization.
6. Geomacro settles the payment.
7. The exact prepared intelligence response is delivered.
8. Payment, request and delivery are linked by the delivery ledger.
9. Replaying the same payment proof for the same request returns the cached delivery.
10. Reusing the same payment proof for changed business terms is rejected.

The response must keep `execution_authorized=false`.

## Initial production commercial offer

- Network: Base mainnet
- Asset: canonical USDC on Base
- Price: 0.05 USDC per successful paid intelligence delivery
- Initial cohort: first 10,000 successful deliveries
- Later reference price: 0.10 USDC, only after adoption evidence and explicit pricing review

Testnet payments are not commercial revenue.

## Production activation inputs

These are server-side environment values only:

```text
COINBASE_X402_ENVIRONMENT=production
COINBASE_X402_PAY_TO=<dedicated Base mainnet revenue address>
COINBASE_X402_PRICE_USDC=0.05
CDP_API_KEY_ID=<production CDP key id>
CDP_API_KEY_SECRET=<production CDP secret>
COINBASE_X402_MAINNET_ACK=I_ACCEPT_REAL_USDC
GEOMACRO_COMMERCIAL_LAUNCH_ACK=I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH
```

Do not commit any real value.

The two acknowledgement variables are deliberately independent:

- `GEOMACRO_COMMERCIAL_LAUNCH_ACK` authorizes the coordinated Geomacro commercial launch.
- `COINBASE_X402_MAINNET_ACK` authorizes Coinbase Base mainnet settlement.

Both are required before production settlement can occur.

## Pre-activation checks

Before setting either acknowledgement:

- exact release commit is deployed to `geomacro.live`;
- Product CI, security/CodeQL, schema safety and commercial source-rights checks are green;
- production Supabase migration for the Coinbase delivery ledger is applied;
- dedicated Base mainnet receiver ownership/recovery is verified;
- production CDP credentials are server-only;
- paid data/source rights are confirmed;
- monitoring and reconciliation ownership are assigned;
- testnet paid E2E evidence is preserved;
- replay produces no second settlement;
- changed-query reuse is rejected;
- invalid network/token/amount/recipient/payment proofs fail closed;
- unpaid requests never return premium intelligence;
- ambiguous settlement outcomes enter reconciliation/manual-review state;
- marketplace/Bazaar metadata is valid for the canonical endpoint.

## Activation order

1. Deploy the exact reviewed release candidate.
2. Configure production CDP credentials and the dedicated Base receiver.
3. Configure `COINBASE_X402_ENVIRONMENT=production` and `COINBASE_X402_PRICE_USDC=0.05`.
4. Verify the production endpoint still fails closed while the launch acknowledgements are absent.
5. Set `GEOMACRO_COMMERCIAL_LAUNCH_ACK=I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH`.
6. Set `COINBASE_X402_MAINNET_ACK=I_ACCEPT_REAL_USDC`.
7. Send one controlled real-USDC paid request.
8. Verify HTTP 402 -> payment -> settlement -> exact intelligence delivery.
9. Verify the onchain amount, asset, network and receiver against the delivery ledger.
10. Replay the same signed proof and confirm no second charge.
11. Attempt the same proof against changed query terms and confirm rejection with no debit.
12. Preserve the sanitized production evidence.
13. Only then announce pay-per-call as live.

## Emergency disable

To stop new real-money settlement, remove or invalidate the production launch acknowledgement(s) at the deployment environment. Do not change payment price, receiver or chain while a paid request is in flight unless the incident procedure explicitly requires it.

## Important boundary

The existing Arc Testnet/Circle x402 implementation remains technical proof. This Coinbase Base mainnet route is the initial production pay-per-call rail. Provider-specific metadata never defines Geomacro's intelligence entitlement or output contract.
