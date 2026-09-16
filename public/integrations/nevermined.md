# Geomacro × Nevermined

Status: **PRE-LAUNCH ACCEPTANCE. SANDBOX ONLY. PRODUCTION DISABLED.**

Geomacro exposes the same source-governed adaptive geopolitical and macro risk intelligence through a Nevermined x402 adapter without forking the underlying intelligence methodology or delivery semantics.

## Machine endpoint

```text
POST https://geomacro.live/api/x402/nevermined/intelligence
```

The request body uses the canonical Geomacro adaptive-intelligence query contract. The exact requested intelligence is checked for deliverability, freshness and commercial-source eligibility before any payment challenge is issued.

## Pre-launch payment flow

1. Submit the adaptive intelligence request without a payment proof.
2. If the request is fully deliverable and commercially eligible, Geomacro returns HTTP `402` with Nevermined payment requirements.
3. The client obtains a valid Nevermined x402 payment proof and retries with the `payment-signature` header.
4. Geomacro verifies the proof through the configured Nevermined **sandbox** facilitator.
5. Geomacro re-checks deliverability and source eligibility.
6. The exact response is assembled, hashed and durably prepared in the provider-neutral delivery ledger before settlement.
7. Nevermined settlement is attempted once.
8. Geomacro releases the prepared response only when settlement evidence is unambiguous and the delivery ledger is durably finalized.

Ambiguous settlement is locked for reconciliation. Geomacro does not automatically resubmit a payment proof after an uncertain settlement outcome.

## Supported settlement semantics

The adapter follows the installed Nevermined Payments SDK contract rather than inferring charge success from `success=true` alone:

- pay-as-you-go settlement requires a non-empty provider settlement reference (`orderTx` or `transaction`);
- credit-based settlement requires a positive redeemed-credit amount;
- missing billing-model metadata is treated as legacy credit semantics rather than pay-as-you-go.

## Privacy and safety boundaries

Geomacro does not persist the raw `payment-signature`, wallet private material, Nevermined API keys, authorization headers or facilitator credentials in the delivery ledger or commercial analytics.

Payer and recipient references are hashed before persistence where they are needed for reconciliation or attribution.

Every delivered intelligence response preserves:

```text
execution_authorized=false
```

Geomacro supplies risk intelligence and decision context. It does not authorize or execute the caller's financial action.

## Production boundary

Nevermined `live` configuration is hard-blocked by the same global coordinated-launch gate used for Geomacro's other production payment rails. Sandbox readiness does not authorize production funds, count as commercial revenue or permit a partial marketplace launch.

Production activation will occur only as part of the single owner-authorized Geomacro official launch after the frozen release candidate passes the required security, source-rights, database, resilience, reconciliation and cross-provider acceptance gates.
