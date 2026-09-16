# Geomacro Commercial Agent Distribution Plan

Status: implementation plan. Real-money activation remains gated.

## Objective

Turn the existing Geomacro Risk Object / Risk Gate and x402 technical proof into a measurable commercial service that autonomous agents can discover, purchase, receive, verify, and reuse without weakening Geomacro's source-rights, proof, or execution boundaries.

The first commercial milestone is not a marketplace listing. It is one independently initiated real-USDC purchase that is reconciled to a delivered Geomacro intelligence object with zero duplicate charge.

## Non-negotiable boundaries

- `execution_authorized=false` remains true for every delivered Geomacro result. Geomacro informs an external decision; it does not execute the customer's financial action.
- Paid delivery is allowed only for country/data scope whose commercial-source eligibility is explicitly cleared.
- Testnet payments are never revenue.
- A settlement is not reconciled revenue until network, asset, amount, recipient, request/order ID, and delivered resource agree with the Geomacro ledger.
- Payment success and fulfillment success are separate states.
- Ambiguous settlement is never blindly retried.
- No raw payment signature, authorization, wallet private key, facilitator secret, or signing private key is stored in analytics or artifacts.

## Architecture

```text
agent / marketplace / MCP client
        |
        v
machine discovery
(OpenAPI + llms.txt + marketplace metadata)
        |
        v
versioned offer resolver
(resource + price + network + asset + expiry + policy)
        |
        v
payment adapter
(Coinbase x402 first; GOAT / Nevermined adapters follow)
        |
        v
payment + delivery ledger
(idempotency, reconciliation, remedies)
        |
        v
Geomacro intelligence core
        |
        v
signed Risk Object / Risk Gate result
        |
        v
delivery receipt + attribution
```

One intelligence core serves every rail. Marketplace-specific code must stay at discovery/payment boundaries rather than forking risk methodology or response semantics.

## Launch products

Initial prices are controlled launch experiments, not claims about market-clearing value.

| Product | Resource purpose | Initial test price |
| --- | --- | ---: |
| Discovery Signal | bounded current country signal for agent discovery | $0.02 |
| Signed Risk Object | signed machine-readable country intelligence | $0.10 |
| Event Risk Intelligence | bounded event-specific risk context | $0.10 |
| Macro + Geopolitical Assessment | combined bounded assessment | $0.15 |
| Corridor Assessment | directional endpoint-composed corridor context | $0.25 |
| Risk Gate Pre-flight | policy evaluation over eligible signed context | $0.25 |
| Deep Evidence Bundle | richer evidence/confidence package | $0.50 |
| Agent Decision Bundle | bounded combined context + Risk Gate output | $0.50-$1.00 |

Only products actually supported by the production data contract may be advertised. Do not expose unsupported logistics, counterparty, sanctions-screening, legal-compliance, or autonomous-execution claims.

## Phase 0: exact-head audit

Before adding new adapters:

1. Pin the exact `main` commit.
2. Confirm Product CI, schema safety, security/resilience, CodeQL, Risk Object verification, and relevant GRI proof checks.
3. Confirm migration `927_coinbase_x402_delivery_ledger.sql` is deployed to the intended production database.
4. Confirm the current Coinbase Base Sepolia acceptance evidence and zero-duplicate-charge evidence remain valid for the deployed code lineage.
5. Produce a source-rights allowlist for every paid response field and supported geography.

## Phase 1: Coinbase Base mainnet

The existing Coinbase rail remains the first real-money path.

Release gates:

- dedicated Base mainnet revenue address;
- production CDP credentials stored server-side;
- explicit production environment and price;
- `COINBASE_X402_MAINNET_ACK=I_ACCEPT_REAL_USDC` only after all gates pass;
- unpaid request returns 402 and leaks no premium payload;
- exact terms are bound to the paid retry;
- replay of same proof + same request returns the same delivery without a second charge;
- changed request with reused proof fails;
- concurrent duplicates cannot independently settle;
- settlement timeout/ambiguity enters reconciliation state;
- delivery failure after payment has a recorded remedy state;
- first real-USDC purchase is manually reconciled before any revenue claim.

## Phase 2: machine discovery

Publish factual machine-readable discovery surfaces for the production products:

- `/llms.txt` with a concise Geomacro description and links to machine documentation;
- `/agent-commerce.md` with supported products, scope, payment rails, response semantics, limitations, and examples;
- an OpenAPI document for supported public/paid agent endpoints;
- x402 Bazaar metadata for every Coinbase-paid resource;
- MCP exposure only for bounded tools whose payment and response contracts are acceptance-tested.

Discovery vocabulary may include factual capabilities such as country risk, geopolitical risk, macroeconomic risk, treasury pre-flight context, corridor risk, supplier-country exposure, geopolitical escalation context, portfolio geopolitical exposure, signed risk objects, and machine-readable risk evidence. Do not keyword-stuff unsupported capabilities.

## Phase 3: additional rails and registries

### GOAT Flow / x402

Treat GOAT as a merchant integration, not merely another header format. Production work includes merchant approval, production credentials, receiving configuration, supported token/network discovery at runtime, idempotent orders, webhook verification, status reconciliation, and payment-to-delivery correlation. Do not assume Testnet3 configuration equals mainnet.

### Nevermined

Add a Nevermined provider path only after the canonical Geomacro product contract is stable. Keep the underlying Geomacro resource identical and map Nevermined plan/credit or x402 entitlement to the same delivery ledger. Publish the required machine-facing integration documentation from Geomacro's own domain.

### Directories / marketplaces

Submit or verify indexing only where the service can actually be called and paid. Record each registry as a distribution source. A directory presence is not counted as revenue or a customer.

## Phase 4: attribution and growth

Every external request should receive a privacy-minimized attribution record when technically available:

```text
source / marketplace
resource_id
price_version
request_id
payment_provider
network
asset
quoted_amount
settlement_reference_hash
payer_reference_hash
delivery_id
delivery_hash
status
latency_ms
created_at
```

Do not trust a caller-supplied source tag as proof of marketplace origin. Treat it as attribution metadata unless cryptographically/provider verified.

Core funnel:

```text
discovery -> unpaid request -> 402 -> paid retry -> settlement -> delivery -> repeat payer
```

Report separately:

- discovered/called resources;
- unique privacy-preserving payer references;
- successful settlements;
- successful deliveries;
- duplicate-charge count;
- paid-but-undelivered count;
- reconciled gross USDC revenue;
- revenue by source/product;
- repeat payer rate;
- 7-day and 30-day run rate.

## Phase 5: evidence-driven marketing

Marketing automation must consume verified product evidence rather than invent claims.

Eligible triggers include:

- a new marketplace/indexing confirmation;
- a new production endpoint;
- a reconciled revenue milestone;
- a sustained GRI proof milestone only after the configured sustained-evidence threshold is actually met;
- a material GRI change with proof/evidence available;
- a documented product/security milestone.

Generate channel-specific drafts for X, LinkedIn, Discord/community, developer docs, and partner updates. Public geopolitical/macro posts and commercial claims require a human approval step before publishing. Never publish payer identity, sensitive request content, wallet/private data, or unsupported revenue/security claims.

## Revenue evidence milestones

Track these as evidence points, not promises:

1. first reconciled real-USDC purchase;
2. first independent external payer;
3. 10 independent paying references;
4. 100 genuine paid purchases;
5. first repeat payer;
6. first $100 reconciled cumulative revenue;
7. first $1,000 30-day run rate;
8. first external workflow using Geomacro repeatedly as a pre-flight dependency.

Do not forecast revenue from marketplace listings alone.

## Launch acceptance matrix

| Gate | Required before real-money public promotion |
| --- | --- |
| commercial source/data rights for paid fields | YES |
| exact-head CI/security/resilience | YES |
| production DB ledger and migrations | YES |
| dedicated production settlement wallet | YES |
| unpaid premium leak test | YES |
| wrong network/token/amount/pay-to tests | YES |
| replay + concurrent duplicate tests | YES |
| ambiguous settlement reconciliation | YES |
| payment-to-delivery audit trail | YES |
| privacy-safe attribution | YES |
| first controlled mainnet purchase reconciliation | YES |
| marketplace indexing | after the endpoint is safe and callable |
| automated public posting | NO; approval-gated initially |

## Execution order

1. Audit current exact head against Coinbase mainnet gates.
2. Close source-rights allowlist for paid output.
3. Deploy/verify production delivery ledger.
4. Run final Base Sepolia regression and security suite.
5. Configure Base mainnet production environment without enabling the acknowledgement.
6. Owner authorizes real-USDC activation; enable the acknowledgement.
7. Execute one capped controlled purchase and reconcile it end to end.
8. Publish machine discovery surfaces and verify Coinbase indexing.
9. Add GOAT merchant adapter and acceptance tests.
10. Add Nevermined adapter and machine documentation.
11. Add compatible directories/registries and attribution tags.
12. Enable approval-gated evidence-driven marketing drafts.
13. Measure real funnel data and adjust pricing from evidence.

## Definition of first commercial success

Geomacro reaches the first commercial evidence point when an external or controlled production buyer purchases an eligible Geomacro resource with real funds, the payment is independently verifiable and reconciled, the correct signed intelligence is delivered, the delivery is auditable, no duplicate charge occurs, and the result preserves the non-execution boundary.
