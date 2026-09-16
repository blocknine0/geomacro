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
4. Geomacro verifies the proof against the pinned Nevermined sandbox x402 backend contract.
5. Geomacro re-checks deliverability and source eligibility.
6. The exact response is assembled, hashed and durably prepared in the provider-neutral delivery ledger before settlement.
7. Nevermined settlement is attempted once.
8. Geomacro releases the prepared response only when settlement evidence is unambiguous and the delivery ledger is durably finalized.

Ambiguous settlement is locked for reconciliation. Geomacro does not automatically resubmit a payment proof after an uncertain settlement outcome.

## Transport contract and dependency policy

The adapter is pinned to the Nevermined backend API contract targeted by Payments SDK `1.13.0`:

- sandbox backend: `https://api.sandbox.nevermined.app/`
- live backend: `https://api.live.nevermined.app/`
- verify: `POST /api/v1/x402/verify`
- settle: `POST /api/v1/x402/settle`
- backend version header: `Nevermined-Version: 1.1`
- crypto network mapping: Base Sepolia in sandbox and Base mainnet in live

Geomacro does **not** currently install `@nevermined-io/payments` in the production dependency graph. During pre-launch hardening, the SDK introduced transitive high/moderate dependency advisories that violated Geomacro's security gate. Rather than weakening that gate, Geomacro uses a small server-only HTTP adapter matching the pinned official wire contract. Reintroducing the SDK requires the dependency graph to satisfy the same advisory policy.

The adapter fails closed on redirects, oversized/non-JSON backend responses, environment/API-key mismatch, malformed result fields and unsupported card networks. Verify and settle calls are bounded by timeouts, and settlement is never automatically retried after an ambiguous network outcome.

## Supported settlement semantics

Geomacro does not infer charge success from `success=true` alone:

- pay-as-you-go settlement requires a non-empty provider settlement reference (`orderTx` or `transaction`);
- credit-based settlement requires a positive redeemed-credit amount;
- missing billing-model metadata is treated as legacy credit semantics rather than pay-as-you-go.

## Privacy and safety boundaries

Geomacro does not persist the raw `payment-signature`, wallet private material, Nevermined API keys, authorization headers or provider credentials in the delivery ledger or commercial analytics.

Payer and recipient references are hashed before persistence where they are needed for reconciliation or attribution.

Every delivered intelligence response preserves:

```text
execution_authorized=false
```

Geomacro supplies risk intelligence and decision context. It does not authorize or execute the caller's financial action.

## Production boundary

Nevermined `live` configuration is hard-blocked by the same global coordinated-launch gate used for Geomacro's other production payment rails. Sandbox readiness does not authorize production funds, count as commercial revenue or permit a partial marketplace launch.

Production activation will occur only as part of the single owner-authorized Geomacro official launch after the frozen release candidate passes the required security, source-rights, database, resilience, reconciliation and cross-provider acceptance gates.
