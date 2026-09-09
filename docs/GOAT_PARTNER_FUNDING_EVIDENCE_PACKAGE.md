# Geomacro × GOAT: Partner / Funding Evidence Package

Status: **PARTNER-PILOT PACKAGE — TESTNET PROOF TRACK**

## 1. What Geomacro is

Geomacro is **Verified Intelligence & Decision Infrastructure** for geopolitical and macro risk.

The product turns live risk context into structured, machine-readable decision context for humans, financial teams and autonomous software systems.

The commercial product is not a prediction market and is not a payment product. Its core outputs are:

- explainable risk intelligence;
- deterministic/versioned Global Risk Index context;
- signed/verifiable Risk Objects;
- policy-driven Risk Gate decisions;
- reason codes and counterfactuals;
- country/corridor decision context;
- structured API/agent delivery.

Customer-facing delivery is structured-only. Raw/private warehouse data is never the product payload.

`execution_authorized=false` is permanent: Geomacro provides decision context but does not authorize or execute a buyer's financial transaction.

## 2. Why GOAT matters to this product

GOAT Flow/x402 can provide a machine-native payment and distribution rail for an autonomous agent buying a Geomacro intelligence service.

The initial integration demonstrates one clean economic loop:

```text
Agent needs geopolitical/macro risk context
        ↓
Geomacro prepares one bounded verified risk preflight
        ↓
GOAT Flow returns an x402 payment challenge
        ↓
Buyer controls and submits its own payment
        ↓
Geomacro verifies GOAT's authenticated merchant order state
        ↓
Exact order / payer / chain / token / amount / transaction reconcile
        ↓
Geomacro releases the prepared structured intelligence
        ↓
Agent can independently verify the signed Risk Object
```

This gives GOAT a real agent-facing service use case rather than a synthetic token-transfer demo, while giving Geomacro a path to paid machine-to-machine intelligence calls.

## 3. Initial paid product unit

SKU: `risk_preflight_v1`

A successful paid unit can contain:

- one bounded country or corridor preflight;
- signed Risk Object context;
- Risk Gate decision;
- reason codes;
- counterfactual conditions;
- governed GRI/evidence context where permitted;
- immutable request/payment/delivery evidence;
- `execution_authorized=false`.

The buyer never receives raw/private source rows or unrestricted internal evidence blobs.

## 4. Commercial model

GOAT is an **isolated partner distribution/payment rail**, not a replacement for Geomacro's general billing architecture.

Potential GOAT-native revenue model after production launch:

- per-call machine intelligence purchase;
- metered agent/API intelligence consumption;
- prepaid/contracted agent usage for larger customers;
- later enterprise plans where GOAT is one eligible machine-payment rail.

Geomacro's broader production billing plan remains separate and is intended to support real-money INR/USD and approved production payment methods across explicitly enabled rails/networks.

Arc/Circle Testnet x402 and GOAT Testnet3 remain technical proof environments and are never counted as revenue.

## 5. What is implemented now

Current partner branch contains:

### Merchant integration

- official GOAT Testnet3/Mainnet origins pinned by environment;
- server-only HMAC merchant authentication;
- strict HMAC-safe scalar validation;
- bounded request timeout and response size;
- redirects disabled;
- merchant identity/capability discovery;
- dynamic runtime token-contract discovery rather than stale hardcoding;
- HTTP 402 order creation;
- authenticated order-status reads;
- current known-state fail-closed model.

### Order safety

- canonical Geomacro request idempotency;
- deterministic `dapp_order_id`;
- durable external-order creation claim;
- provider-attempt marker before external create call;
- ambiguous creation failure does not create a blind second order;
- exact order/payer/chain/token/amount reconciliation;
- browser/UI success is never sufficient for fulfillment.

### Intelligence fulfillment

- intelligence can be prepared before payment but remains server-side;
- resource hash is persisted;
- provider challenge is normalized before persistence;
- raw provider response is not exposed/persisted as commercial evidence;
- only trusted paid states can release the resource;
- payment, resource and fulfillment records reconcile;
- signed Risk Object can be verified through Geomacro's public verification endpoint;
- `execution_authorized=false` remains enforced.

### Evidence / resilience

- immutable partner-pilot evidence tables;
- service-role-only database access;
- concurrency-safe fulfillment;
- testnet/commercial-revenue boundary in code and tests;
- dedicated no-payment Testnet3 provider dry-run harness;
- dedicated manual paid Testnet3 E2E harness;
- sanitized JSON evidence artifacts;
- Product CI, CodeQL, database migration replay and Risk Object lifecycle gates.

## 6. Testnet3 proof state

Confirmed externally:

- Geomacro has access to the GOAT Flow merchant portal/Testnet3 environment.
- GOAT Testnet3 is configured in the integration as chain ID `48816` / `eip155:48816`.

Engineering-ready proof stages:

### A. No-payment provider dry run

The dry-run harness:

1. authenticates with server-only merchant credentials;
2. verifies the merchant identity and `DIRECT` mode;
3. discovers the merchant's Testnet3 USDC capability;
4. creates a tiny Testnet3 order and requires HTTP 402;
5. validates the normalized payment challenge;
6. reads the order back through authenticated merchant API;
7. requires an unpaid `CHECKOUT_VERIFIED` state;
8. requires no transaction hash;
9. saves sanitized structured evidence only.

The payer address is randomly generated without a private key, so this dry run cannot submit a token transfer.

**Current live status:** the repository workflow ran, but the network call was correctly skipped because the required GOAT merchant secrets were not exposed in that GitHub workflow context. No successful provider dry-run claim is made until the sanitized artifact exists.

### B. Paid Testnet3 E2E

A separate manual-only workflow is ready for one explicitly acknowledged Testnet3 payment.

It requires:

- protected `goat-testnet3-paid-proof` environment;
- staging Geomacro deployment, never the public production host;
- dedicated Testnet wallet secret;
- exact acknowledgement `GOAT_TESTNET3_USDC`;
- enough Testnet USDC for the configured test amount.

The harness then requires:

- successful Testnet3 transfer;
- GOAT server-side paid state;
- exact transaction reconciliation;
- Geomacro paid-resource release;
- signed Risk Object cryptographic verification;
- `execution_authorized=false` end to end;
- sanitized evidence artifact.

**Current live status:** ready but not executed. No Testnet transaction hash is claimed yet.

## 7. Security boundaries that can be shown to GOAT

Geomacro can demonstrate the following design decisions directly from code/tests:

1. Merchant API keys/secrets never enter browser code.
2. Buyer wallet private keys are never held by Geomacro.
3. Geomacro does not sign the buyer payment.
4. Testnet transactions are never counted as revenue.
5. Provider raw response is not a customer/commercial evidence payload.
6. Unknown GOAT status fails closed.
7. `CHECKOUT_VERIFIED` cannot fulfill intelligence.
8. Only `PAYMENT_CONFIRMED` or `INVOICED` can reach paid fulfillment.
9. Exact merchant/order/dapp-order/payer/chain/token/amount fields must match.
10. Ambiguous order creation blocks blind retry.
11. Paid fulfillment is concurrency-safe/idempotent.
12. Risk Object validity is independently machine-verifiable.
13. Risk Gate always keeps `execution_authorized=false`.

## 8. Evidence GOAT should receive after the secure test run

Do not send merchant secrets or wallet keys.

Share only:

- final exact Git commit;
- CI/security gate summary;
- architecture/flow diagram;
- sanitized 402 challenge;
- GOAT order ID;
- deterministic Geomacro `dapp_order_id`;
- Testnet3 transaction hash after paid test;
- authenticated final GOAT order status;
- exact chain/token/amount reconciliation summary;
- Geomacro resource hash;
- public Risk Object verification result;
- non-execution boundary;
- relevant latency numbers;
- known limitations.

## 9. What Geomacro should ask GOAT for

The partner conversation should be concrete rather than a generic funding request.

Primary asks:

- builder/grant funding to productionize the agent-paid intelligence integration;
- technical review of the merchant/x402 integration and settlement model;
- support moving the validated Testnet3 pilot to an approved production/mainnet path;
- official ecosystem/project listing or partner recognition once proof gates pass;
- co-marketing of a real autonomous-agent intelligence purchasing use case;
- introductions to GOAT ecosystem agent/app builders who need external risk intelligence;
- guidance on production reconciliation/refund/dispute operations.

## 10. Why funding this is useful to GOAT

Geomacro adds a non-trivial service that autonomous systems can actually purchase: geopolitical and macro risk decision context.

A successful integration demonstrates that GOAT/x402 can support more than checkout or token transfer. It can support an agent buying a verifiable decision input before taking a separate economic action.

That gives GOAT an ecosystem example spanning:

- agent-to-service payment;
- real machine-readable utility;
- verified structured output;
- policy-aware financial context;
- repeatable per-call economic activity.

## 11. Production revenue gate

Do not announce GOAT-generated Geomacro revenue until all are true:

- GOAT production/mainnet merchant path is approved;
- production credentials are isolated from Testnet3;
- a real commercial price/SKU is approved;
- legal/entity/accounting treatment is ready;
- production security/resilience gates pass;
- a real buyer pays;
- GOAT confirms settlement server-side;
- the service is delivered;
- payment/order/resource/delivery records reconcile.

The first such completed order is the point at which this track can become actual attributable GOAT-originated revenue.

## 12. Partner-facing short narrative

> Geomacro is building verified geopolitical and macro risk intelligence for human and machine decisions. We integrated GOAT Flow/x402 as an isolated machine-payment rail for a real service: an autonomous agent can buy a structured risk preflight, payment is verified server-side, and only then does Geomacro release signed Risk Object and Risk Gate context. The buyer keeps control of its wallet and Geomacro never authorizes execution. We now want to complete the Testnet3 proof with GOAT, harden the production settlement path, and explore grant support plus an official ecosystem partnership for agent-paid risk intelligence.

## 13. Truth table

| Claim | Current status |
| --- | --- |
| GOAT Testnet3 merchant access | Confirmed |
| GOAT integration runtime implemented | Yes, partner branch |
| Structured-only paid intelligence contract | Implemented |
| Raw provider response removed from commercial challenge contract | Implemented/tested |
| Safe provider dry-run harness | Implemented |
| Live provider dry-run artifact | Pending secure workflow secrets |
| Paid Testnet3 E2E harness | Implemented |
| Paid Testnet3 transaction | Not yet executed |
| GOAT official partnership | Not yet confirmed |
| GOAT-originated commercial revenue | Not yet started |
| GOAT replaces general Geomacro billing | No |

This table must be updated from evidence before any external partner/funding submission.
