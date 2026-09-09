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

Production integration should therefore prefer provider-hosted or provider-controlled flows for regulated functions such as:

- INR collection through supported domestic rails;
- USD and other international card/bank collection;
- cross-border settlement;
- fiat/crypto conversion when offered by an appropriately eligible provider;
- blockchain payment screening/settlement where required;
- refunds and chargeback handling;
- merchant/customer payment records required by the provider contract.

## 3. Regulatory gates before launch

The production payment feature must not launch until the exact provider/entity/country flow has been reviewed for the applicable legal and contractual requirements.

India-specific review must include, as applicable:

- RBI payment-aggregator / payment-gateway framework;
- RBI Payment Aggregator - Cross Border requirements for cross-border collection/settlement;
- FEMA and authorised-dealer-bank requirements for international receipts;
- FIU-IND / PMLA implications if any Geomacro-controlled flow would amount to VDA exchange, transfer, safekeeping/custody or related financial services;
- tax, invoicing and accounting treatment;
- merchant KYC/KYB and customer/payment screening required by the selected providers.

Official reference points reviewed for this plan:

- RBI, Regulation of Payment Aggregator - Cross Border, 31 October 2023: https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12561
- RBI authorised payment-system / PA information and approval framework: https://www.rbi.org.in/
- FIU-IND, Registration of Virtual Digital Asset Service Providers as Reporting Entity, 4 July 2023: https://fiuindia.gov.in/pdfs/downloads/VDASP04072023.pdf
- FIU-IND current AML/CFT guidance and VDA registration materials: https://fiuindia.gov.in/files/Downloads/Downloads.html

These references establish architecture gates; they are not a substitute for provider onboarding, legal/accounting review or any authorisation actually required for a specific flow.

## 4. Currency and chain abstraction

Application code must separate four concepts:

1. **Invoice currency** — e.g. INR or USD.
2. **Payment method** — e.g. UPI/card/bank transfer/stablecoin.
3. **Payment network/chain** — e.g. a supported production blockchain or fiat network.
4. **Settlement currency/account** — what Geomacro actually receives after provider settlement.

Do not encode product prices directly in blockchain atomic units.

A commercial invoice should have a stable fiat-denominated commercial value. A provider may quote the equivalent crypto amount for a short expiry window when the customer chooses a crypto payment method.

## 5. Multi-chain policy

Multi-chain does not mean every chain is enabled automatically.

Each production chain/asset pair must pass an explicit enablement gate covering:

- provider support;
- production network only;
- finality/reorg assumptions;
- supported stablecoin/token contract identity;
- chain/address validation;
- payment expiry and under/over-payment handling;
- confirmation requirements;
- sanctions/AML/provider screening boundaries;
- refund capability;
- reconciliation and accounting;
- operational monitoring;
- incident disable switch.

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
- explicit reconciliation between invoice, provider transaction and entitlement/credit grant.

## 7. Relationship to Geomacro credits

Credits are a product-usage accounting unit, not money, currency, a token or a withdrawable stored-value instrument.

A successful real-money purchase/subscription may grant a defined credit allocation, but:

- credits are not cash-redeemable;
- credits are not transferable between users unless a future enterprise contract explicitly implements team allocation;
- payment success and credit grant must be idempotently linked;
- failed/refunded/disputed payments must follow an explicit entitlement-reversal policy;
- raw data access remains prohibited regardless of credit balance.

Current launch commercial credit anchors:

- Free Explorer: 500 credits per 30 days;
- Founding Analyst Pilot: 5,000 credits per 30 days;
- Founding API + Risk Gate Pilot: 20,000 credits per 30 days;
- Institutional: 100,000-credit monthly starting pool, then contracted volume.

These are product entitlements. They do not replace the negotiated commercial pricing guardrails for founding pilots/institutional agreements.

## 8. Migration from current x402 technical proof

The current Arc Testnet Circle x402 implementation remains useful as evidence that Geomacro can bind machine payment to machine-readable risk delivery.

It must remain labelled **technical proof** until replaced or complemented by a separately production-reviewed payment implementation.

Production launch must not simply switch the existing testnet configuration to mainnet. It requires a new production payment security/compliance review, provider contract, reconciliation path, accounting treatment, failure-state testing and launch-readiness evidence.

## 9. Implementation sequence

1. Finish current intelligence / structural-data / credit entitlement contracts.
2. Add durable user/account identity and server-side credit ledger.
3. Select legal entity / merchant-of-record or direct-merchant structure.
4. Select regulated provider(s) for INR, USD/international and eligible crypto payments.
5. Build currency/payment-method abstraction.
6. Build signed provider webhook/payment-status verification.
7. Add idempotent invoice -> payment -> entitlement ledger.
8. Add production chain/asset allowlist and fail-closed validation.
9. Run security, abuse, reconciliation, refund and concurrency tests.
10. Complete legal/accounting/provider onboarding checks.
11. Launch production payment rails with observability and emergency disable controls.

## 10. Non-negotiable commercial boundary

**Commercial customer payments are real-money production payments. Testnet payments never count as commercial revenue or customer settlement.**
