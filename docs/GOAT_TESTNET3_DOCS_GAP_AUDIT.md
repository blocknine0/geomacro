# GOAT Testnet3 docs-to-implementation gap audit

Date: 2026-09-12

Scope: `blocknine0/geomacro` GOAT Flow/x402 partner-pilot implementation compared against the current GOAT Flow Merchant Guide, Flow Quick Start, Integration Guide, and Flow Overview.

## Safety boundary

This audit does not authorize a paid Testnet3 transfer. Automated CI and scheduled acceptance remain no-payment unless the dedicated paid E2E harness is explicitly acknowledged with `GEOMACRO_GOAT_TESTNET_E2E_ACK=GOAT_TESTNET3_USDC` and a dedicated funded Testnet3 wallet is configured. The harness refuses the public production host.

## Current integration surface

Geomacro currently uses the authenticated GOAT Flow DIRECT order/status path for the partner pilot. The production target is a merchant-backed paid intelligence request that returns a 402 challenge, validates runtime payment terms, waits for trusted GOAT payment confirmation, and only then delivers a structured Geomacro Risk Object.

The current partner pilot does not depend on a browser-success callback. Webhooks and the GOAT MPP `Payment-Receipt` profile are not required by this DIRECT polling surface and must not be represented as completed evidence unless they are separately implemented and tested.

## Docs cross-check

| GOAT requirement | Geomacro implementation/evidence | State | Remaining action |
|---|---|---|---|
| Separate Testnet3 and Mainnet configuration | Environment-specific chain IDs, official Flow API origins, commercial-revenue flag, and Mainnet commercial kill-switch | PASS | Re-verify live Mainnet values only after merchant approval |
| Merchant secrets backend-only | GOAT API credentials are server env configuration; pilot access token is intentionally separate | PASS | Final secret scan before submission |
| Runtime payment terms authoritative | 402 challenge parser validates chain, destination chain, token contract/symbol, amount, recipient format, expiry, x402 version and payer binding | PASS | Preserve a real provider challenge artifact |
| HTTP 402 required | Create-order rejects a non-402 create response and rejects redirects | PASS | Preserve provider observation evidence |
| No premium fulfillment before payment | Partner-pilot state keeps prepared resource separate from delivered resource; E2E asserts `resource_delivered=false` on 402 | PASS | Re-confirm in real provider challenge run |
| Trusted backend status gates fulfillment | Paid-order verification requires a paid status, tx hash, confirmation time and exact request/payment identity | PASS | Complete one controlled paid Testnet3 E2E before final Mainnet request |
| Failed/cancelled/expired states handled | Paid verification fails closed for non-paid states | PASS | Preserve matrix evidence |
| Retry/idempotency | Request claims are serialized; replay vs conflict is distinguished; settlement, order, tx and request identities are unique | PASS | Preserve concurrency/idempotency evidence in final report |
| Ambiguous post-payment state does not create a second payment | Confirmation timeout explicitly requires reconciliation before creating another payment | PASS | Exercise recovery in a controlled Testnet3 operational test |
| Order reconciliation | Server evidence captures GOAT order/payment identity | PARTIAL | Export/capture Testnet3 Order Reconciliation showing matching order, tx, token, amount, chain and status |
| Real Testnet3 buyer transfer | Dedicated E2E harness validates chain, runtime token/recipient/amount, receipt, delivery and Risk Object signature | READY, NOT EXECUTED BY THIS AUDIT | Requires explicit user approval because it submits a Testnet3 token transaction |
| Monitoring / support ownership / abandoned orders | Errors fail closed and artifacts exist | PARTIAL | Add final operational runbook evidence and document retry/abandonment policy |
| Merchant fee balance | Provider/portal responsibility | MANUAL | Capture sufficient Testnet3 fee balance/top-up readiness before final report |
| Webhook authentication/retry | Current partner pilot uses polling rather than webhook fulfillment | N/A CURRENT SURFACE | If webhooks are enabled later, test signature, timestamp/replay, duplicate delivery and retries |
| MPP `Payment-Receipt` validation | Current partner pilot is authenticated DIRECT order/status, not MPP | N/A CURRENT SURFACE | Only add missing/malformed/expired/cross-merchant/wrong-route/replay receipt tests if MPP becomes the chosen production surface |
| Production config review | Mainnet is disabled until explicit commercial gate | NOT YET | After merchant approval, create reviewed production config from live Mainnet portal/API; never copy Testnet3 values |

## Submission gate

Geomacro should not present the Testnet3 program as Mainnet-ready until all of the following are evidenced:

1. 20 accepted scheduled windows, 250 repeated cases each, for 5,000 total repeated cases.
2. Full negative/security matrix passes on every accepted window.
3. Integrated no-payment provider observation succeeds on scheduled runs and retains provider artifacts.
4. One explicitly approved, controlled Testnet3 paid E2E succeeds from 402 challenge to GOAT-confirmed settlement to Risk Object delivery and public cryptographic verification.
5. The same paid transfer is visible in GOAT Order Reconciliation with matching order/transaction, chain, token, amount and status.
6. Duplicate/retry recovery is demonstrated without a second transfer after an ambiguous post-broadcast condition.
7. Final evidence reports zero unexplained duplicate charges and zero premium-resource leakage before trusted payment confirmation.
8. Operational limitations, failed attempts and remediation are disclosed rather than converted into passes.
9. Mainnet merchant configuration is reviewed from the live Mainnet environment after approval.

## Evidence classification

- `PASS`: automated or preserved evidence proves the control.
- `PARTIAL`: code control exists but external provider/portal evidence is still required.
- `READY, NOT EXECUTED`: safe harness exists but the action would submit a Testnet3 transaction and requires explicit approval.
- `N/A CURRENT SURFACE`: requirement belongs to a GOAT surface Geomacro is not currently using; do not claim it as tested.
- `NOT YET`: Mainnet-only step that must wait for merchant approval/live production configuration.

## Official sources reviewed

- GOAT Flow Merchant Guide
- GOAT Flow Quick Start
- GOAT Flow Integration Guide
- GOAT Flow Overview

The active GOAT portal/API/challenge remains authoritative for deployment-specific merchant IDs, supported chains/tokens, token contracts, decimals, amounts, fees, receiving addresses and enabled capabilities.