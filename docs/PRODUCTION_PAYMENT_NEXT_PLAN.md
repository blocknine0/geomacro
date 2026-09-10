# Geomacro Production Payment Next Plan

**Status: NEXT PLAN — NOT CURRENT GENERAL AVAILABILITY**

This document defines the next commercial payment direction. It must not be confused with the existing Arc Testnet / Circle x402 technical proof.

## 1. Product decision

Geomacro's next commercial payment system will use **real-money production payment rails only**.

Target customer payment options:

- INR-denominated payment for India-facing customers;
- USD-denominated payment for international customers;
- additional fiat currencies where a licensed payment provider supports them;
- approved crypto/stablecoin payment on multiple production blockchains where legally and operationally eligible;
- multi-chain settlement support without forcing every customer onto one blockchain.

No testnet transaction is a commercial payment. Testnet remains technical proof only.

## 2. Merchant-not-intermediary architecture

The preferred architecture is for Geomacro to remain the merchant selling its own intelligence/data/API service and to use appropriately regulated payment providers for collection, conversion and settlement.

Geomacro should not deliberately become a payment aggregator, exchange, remittance operator, wallet custodian or virtual-asset transfer service merely to collect its own subscription/pilot revenue.

Production integration should therefore prefer provider-hosted or provider-controlled flows for regulated functions such as INR collection, USD/international card or bank collection, cross-border settlement, provider-supported conversion, blockchain payment screening/settlement, refunds/chargebacks and merchant/customer payment records.

## 3. Regulatory gates before launch

The production payment feature must not launch until the exact provider/entity/country flow has been reviewed for the applicable legal and contractual requirements.

India-specific review must include, as applicable, RBI payment-aggregator/payment-gateway framework, Payment Aggregator - Cross Border requirements, FEMA/authorised-dealer-bank requirements, FIU-IND/PMLA implications if any Geomacro-controlled flow would amount to VDA exchange/transfer/custody or related financial services, tax/invoicing/accounting treatment, and merchant KYC/KYB/customer screening required by the selected providers.

These architecture gates are not a substitute for provider onboarding, legal/accounting review or any authorisation actually required for a specific flow.

## 4. Currency and chain abstraction

Application code must separate:

1. invoice currency, such as INR or USD;
2. payment method, such as UPI/card/bank transfer/stablecoin;
3. payment network/chain;
4. settlement currency/account;
5. canonical Geomacro commercial offer;
6. canonical Geomacro entitlement created after verified settlement.

Do not encode product prices directly in blockchain atomic units. A commercial invoice should have a stable commercial value. A provider may quote the equivalent crypto amount for a short expiry window when the customer chooses crypto.

## 5. Multi-chain policy

Multi-chain does not mean every chain is enabled automatically.

Each production chain/asset pair must pass an explicit enablement gate covering provider support, production network identity, finality/reorg assumptions, stablecoin/token identity, address validation, expiry and under/over-payment handling, confirmation requirements, provider screening boundaries, refund capability, reconciliation/accounting, monitoring and an incident disable switch.

Unknown chains/assets fail closed.

## 6. Real-money safety invariants

Production payment code must enforce:

- no testnet chain IDs or test assets in commercial checkout;
- no customer private keys or seed phrases handled by Geomacro;
- no Geomacro signing of a customer's wallet transaction;
- no silent currency conversion;
- no ambiguous payment-success state;
- idempotent order/payment processing;
- server-side verification of provider payment status;
- amount + currency + order binding;
- replay protection;
- immutable payment/audit reference;
- refund and dispute state separated from successful settlement;
- secrets only in server-side secret storage;
- webhook signature verification where webhooks are used;
- explicit reconciliation between invoice, provider transaction and entitlement/credit grant;
- no payment provider can inject arbitrary Geomacro capabilities or response limits;
- payment cannot bypass commercial source-rights restrictions.

## 7. Relationship to the Structured Data Entitlement Registry

Payment is not the data-policy engine.

The canonical fulfillment sequence is:

`provider payment -> verified settlement -> canonical offer_id -> canonical entitlement -> Structured Data Entitlement Registry -> usage charge -> governed structured payload -> audit receipt`

`src/lib/structured-data-entitlement-registry.ts` owns the exact server-side mapping of tier/offer to:

- API availability;
- allowed capability IDs;
- country/corridor/query subject support;
- observation/evidence limits;
- historical depth;
- export mode;
- signed Risk Object entitlement;
- Risk Gate entitlement;
- machine one-shot capability limits;
- safety boundaries.

Provider metadata may carry amount, currency, provider order/payment identifiers and settlement evidence. It must never carry authoritative capability lists, history depth or payload limits.

## 8. Relationship to Geomacro credits

Credits are a product-usage accounting unit, not money, currency, a token or a withdrawable stored-value instrument.

A successful real-money purchase/subscription may grant a defined credit allocation, but credits are not cash-redeemable, payment success and the credit grant must be idempotently linked, failed/refunded/disputed payments must follow an entitlement-reversal policy, and raw data access remains prohibited regardless of credit balance.

Current launch commercial access anchors:

- Free Explorer: public website/dashboard only; **0 commercial API credits**;
- Founding Analyst Pilot: **5,000 credits per 30 days**, default founding quote **USD 1,500 / 30 days**;
- Founding API + Risk Gate Pilot: **20,000 credits per 30 days**, default founding quote **USD 2,500 / 30 days**;
- Institutional: **100,000-credit monthly starting pool**, then contracted volume; current annual discussion anchor starts around **USD 24k-36k**.

These remain launch/pilot references, not a claim of generally available self-serve public pricing.

## 9. Machine one-shot payment

An autonomous agent may pay for one bounded service without receiving a monthly account-level tier.

Initial canonical example:

`machine_risk_preflight -> one_shot entitlement -> risk_gate_bundle -> signed Risk Object + Risk Gate decision`

The response remains `execution_authorized=false`.

A GOAT/x402 payment, a future stablecoin rail or another machine-payment provider must all map into the same canonical one-shot entitlement. The provider does not define the output.

## 10. Migration from current x402 technical proof

The current Arc Testnet Circle x402 implementation remains useful as evidence that Geomacro can bind machine payment to machine-readable risk delivery.

It must remain labelled **technical proof** until replaced or complemented by a separately production-reviewed payment implementation.

Production launch must not simply switch the existing testnet configuration to mainnet. It requires a new production payment security/compliance review, provider contract, reconciliation path, accounting treatment, failure-state testing and launch-readiness evidence.

## 11. Implementation sequence

1. Lock the centralized Structured Data Entitlement Registry and free-to-paid access boundaries.
2. Complete production commercial identity, API credentials, entitlement and credit ledger migration.
3. Prove authenticated paid API fulfillment against real governed data.
4. Add durable canonical offer/order/payment records.
5. Select legal entity / merchant structure and regulated provider(s) for applicable INR, USD/international and production stablecoin flows.
6. Build signed webhook/payment-status verification and idempotent payment-to-entitlement reconciliation.
7. Add one-shot machine purchase fulfillment through the same registry.
8. Add production chain/asset allowlist and fail-closed validation where crypto rails are enabled.
9. Run security, abuse, reconciliation, refund and concurrency tests.
10. Complete legal/accounting/provider onboarding checks.
11. Launch production payment rails with observability and emergency disable controls.

## 12. Non-negotiable commercial boundary

**Commercial customer payments are real-money production payments. Testnet payments never count as commercial revenue or customer settlement. Free Explorer is website/dashboard only and is not a free API tier.**
