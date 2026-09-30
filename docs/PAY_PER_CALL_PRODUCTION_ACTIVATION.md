# Geomacro Pay-Per-Call Production Activation: Coinbase/CDP Rail

Status: READY FOR OWNER-CONTROLLED PROVIDER CANARY. Real-USDC settlement remains disabled until the existing commercial launch gates are explicitly authorized.

The canonical first-20,000-delivery commercial policy is `docs/COMMERCIAL_FREE_QUOTA_20K_PLAN.md`. This document is provider-specific activation guidance for the Coinbase/CDP exact-settlement rail. It must not override the centralized quota, storage, output, source-rights or payment-economics rules.

## Coinbase paid endpoint

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

## Commercial offer boundary

- Network: Base mainnet
- Asset: canonical USDC on Base
- Reference price: 0.05 USDC per successful paid intelligence delivery unless explicitly reviewed
- First commercial capacity target: cumulative 20,000 successful paid deliveries across the approved production rail(s), not 20,000 Coinbase settlements

Testnet payments are not commercial revenue.

Coinbase exact settlement is not automatically the default rail for the zero/near-zero-cost first cohort. It may be used only when its measured operation/network cost fits the centralized reserved budget. There is no silent failover from a lower-cost batch rail to a more expensive exact-settlement path.

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

Both are required before Coinbase production settlement can occur.

## Pre-activation checks

Before setting either acknowledgement:

- exact release commit is deployed to `geomacro.live`;
- production database is at or below the centralized launch ceiling;
- Product CI, security/CodeQL, schema safety and commercial source-rights checks are green;
- production ledger backend is acceptance-tested;
- dedicated Base mainnet receiver ownership/recovery is verified;
- production CDP credentials are server-only;
- paid data/source rights are confirmed;
- free-tier capacity for the canary is reserved before payment is requested;
- monitoring and reconciliation ownership are assigned;
- testnet paid E2E evidence is preserved;
- replay produces no second settlement;
- changed-query reuse is rejected;
- invalid network/token/amount/recipient/payment proofs fail closed;
- unpaid requests never return premium intelligence;
- ambiguous settlement outcomes enter reconciliation/manual-review state;
- marketplace/Bazaar metadata is valid for the canonical endpoint;
- the response respects the permanent source-protected structured-output boundary.

## Activation order

1. Deploy the exact reviewed release candidate.
2. Configure production CDP credentials and the dedicated Base receiver.
3. Configure `COINBASE_X402_ENVIRONMENT=production` and `COINBASE_X402_PRICE_USDC=0.05`.
4. Verify the production endpoint still fails closed while the launch acknowledgements are absent.
5. Set `GEOMACRO_COMMERCIAL_LAUNCH_ACK=I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH`.
6. Set `COINBASE_X402_MAINNET_ACK=I_ACCEPT_REAL_USDC`.
7. Send one controlled real-USDC paid request.
8. Verify HTTP 402 -> payment -> settlement -> exact intelligence delivery.
9. Verify the economic amount, asset, network and receiver against the delivery ledger.
10. Replay the same signed proof and confirm no second charge.
11. Attempt the same proof against changed query terms and confirm rejection with no debit.
12. Record the actual provider/network cost and operation count.
13. Preserve sanitized production evidence.
14. Compare the measured result with the centralized first-cohort quota/cost policy.
15. Only then allow this provider to serve cohort traffic within its reserved budget.

## Emergency disable

To stop new real-money Coinbase settlement, remove or invalidate the production launch acknowledgement(s) at the deployment environment. Do not change payment price, receiver or chain while a paid request is in flight unless the incident procedure explicitly requires it.

## Important boundary

Provider-specific metadata never defines Geomacro's intelligence entitlement or output contract. The user receives approved structured intelligence, not raw source data. Payment cannot widen source rights, scope, methodology or `execution_authorized=false`.
