# Geomacro Commercial Payment Roadmap

Status: **NEXT COMMERCIAL PHASE, NOT YET ACTIVE**

This document is the source of truth for the next production payment architecture. It is intentionally separate from Arc Testnet x402 technical proof.

## 1. Core rule

Commercial Geomacro payments must use **real-money production payment rails**.

The next production system should support:

- multi-currency payments;
- multi-chain payments where an onchain option is used;
- direct USD-denominated payment options;
- direct INR-denominated payment options for eligible customers;
- plan/credit purchases and contracted institutional invoices;
- payment receipts and an auditable entitlement/credit update path.

Arc Testnet x402 remains historical/technical proof only. It must not be presented as the commercial billing system.

## 2. What customers are paying for

Payments buy Geomacro product access and services, for example:

- Free-to-paid plan upgrades;
- included credit pools;
- structured-data access;
- API usage;
- signed Risk Objects;
- Risk Gate access;
- founding pilots;
- institutional agreements;
- agreed structured exports, monitoring or support.

Payments are **not** real-money prediction-market stakes and must not be connected to the Testnet market application.

## 3. Supported payment categories

### Fiat

Planned customer-facing fiat currencies include:

- USD;
- INR;
- additional currencies only after processor, tax, settlement and regulatory requirements are validated.

Fiat methods may include cards, bank-transfer or invoice-based settlement depending on the selected production provider and customer jurisdiction.

### Onchain

Production onchain payments may support multiple approved chains and approved payment assets.

Requirements before enabling any chain/asset:

- production network only;
- explicit chain allowlist;
- explicit asset/contract allowlist;
- confirmation/finality policy;
- address and treasury separation;
- idempotent payment intent;
- replay/double-credit protection;
- webhook/onchain reconciliation;
- refund/failed-payment handling;
- accounting denomination recorded separately from settlement asset;
- customer receipt and transaction reference;
- sanctions/compliance/payment-provider requirements where applicable.

No arbitrary token acceptance.

## 4. Billing currency vs settlement asset

A plan should have a clear commercial billing currency even if the customer pays using another supported rail.

Example:

- invoice/plan price: USD 1,500;
- customer chooses an eligible INR payment rail or an approved onchain payment rail;
- the payment service records the actual charged amount, FX/quote reference where relevant, settlement asset/network and final commercial entitlement;
- the credit ledger receives the entitlement only after confirmed settlement.

Price calculation and payment settlement must be auditable and must not silently change product credit costs.

## 5. Payment-to-credit boundary

Production flow:

`plan / invoice -> payment intent -> payment confirmation -> idempotent reconciliation -> entitlement event -> commercial credit account update`

Rules:

- never grant credits from an unverified client-side success screen;
- server-side verification is mandatory;
- one payment reference can create entitlement only once;
- webhook retries must be idempotent;
- failed/reversed payments must not create usable entitlement;
- manual founder adjustments require a separate audited administrative path;
- credit usage remains separate from payment transaction records.

## 6. Account identity

The credit/account layer must not be wallet-only.

Current SIWE wallet identity can be one principal type. Future production accounts may also use verified email, organization accounts or API clients. Multiple authenticated principals may eventually belong to one commercial organization/account.

Raw API keys, payment secrets and processor credentials must never be persisted as account identifiers.

## 7. Security requirements

Before production payment activation:

- no secret payment credentials in browser bundles;
- least-privilege production keys;
- webhook signature verification;
- replay protection;
- idempotency keys;
- strict amount/currency/plan validation on the server;
- server-side entitlement creation;
- immutable/auditable payment events;
- separate production and Testnet credentials;
- production-host allowlists;
- rate limits and abuse controls;
- no customer transaction signing by Geomacro unless a deliberately separate future custody model is legally and technically approved;
- security and resilience tests covering duplicate webhooks, partial failures, delayed settlement and provider outage.

## 8. Commercial availability

Do not publish a provider, chain list, FX promise, payment-method promise or settlement SLA until it has been implemented and tested in production-like staging and its legal/commercial requirements have been reviewed.

The first production release should enable the smallest reliable set of payment rails necessary for real customers, then expand deliberately.

## 9. Relationship to current Testnet proof

Circle/Arc/x402 Testnet evidence remains useful as architecture proof of machine-paid delivery. It does not set the production price, production currency, supported production network or payment provider.

Commercial public copy must clearly distinguish:

- `Technical Proof`: Arc Testnet / historical x402 demonstration;
- `Production Billing`: future real-money multi-currency / multi-chain payment system described in this roadmap.
