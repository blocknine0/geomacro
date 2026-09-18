# Geomacro Commercial Agent Distribution Plan

Status: PRE-LAUNCH BUILD. **ALL MAINNET / REAL-MONEY ACTIVATION IS LOCKED UNTIL ONE COORDINATED OFFICIAL LAUNCH.**

## Objective

Turn the existing Geomacro Risk Object / Risk Gate and x402 technical proof into a measurable commercial service that autonomous agents can discover, purchase, receive, verify, and reuse without weakening Geomacro's source-rights, proof, or execution boundaries.

The immediate milestone is the initial commercial pay-per-call readiness path at 0.05 USDC per successful paid intelligence delivery, with the first 10,000 successful deliveries tracked as the adoption milestone. The 10,000-delivery target is post-launch customer demand, not founder-funded traffic. Production rails remain disabled until their required runtime configuration and explicit owner authorization are in place. Marketplace promotion and the optional 40k capacity-certification track remain separate evidence stages.

## Global launch lock

Until the official launch decision:

- no Coinbase Base mainnet settlement;
- no GOAT mainnet settlement;
- no Nevermined production settlement;
- no other marketplace or facilitator may charge real funds;
- no environment acknowledgement, production payment toggle, or equivalent kill switch may be enabled;
- production credentials may be provisioned server-side only when necessary for readiness checks, but must not make a chargeable route live;
- marketplace submissions may be prepared in draft/test mode, but must not advertise a chargeable production endpoint;
- all paid-product claims remain pre-launch/readiness claims.

A provider-specific implementation being ready does not override this global lock.

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
(Coinbase / GOAT / Nevermined / future rails)
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

| Product | Resource purpose | Initial launch-test price |
| --- | --- | ---: |
| Discovery Signal | bounded current country signal for agent discovery | $0.05 |
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
4. Confirm current sandbox/testnet acceptance evidence and zero-duplicate-charge evidence remain valid for the deployed code lineage.
5. Produce a source-rights allowlist for every future paid response field and supported geography.

## Phase 1: common commerce core and Coinbase readiness

The existing Coinbase rail remains the reference implementation, but mainnet remains disabled.

Pre-launch gates:

- dedicated future Base mainnet revenue address with ownership/recovery procedure;
- production CDP credentials stored server-side where required, without enabling settlement;
- explicit production price/version configuration;
- `COINBASE_X402_MAINNET_ACK` remains blank/disabled;
- unpaid request returns 402 and leaks no premium payload;
- exact terms are bound to the paid retry;
- replay of same proof + same request returns the same delivery without a second charge in acceptance testing;
- changed request with reused proof fails;
- concurrent duplicates cannot independently settle;
- settlement timeout/ambiguity enters reconciliation state;
- delivery failure after payment has a recorded remedy state;
- launch runbook defines the later capped first production transaction and reconciliation procedure without executing it pre-launch.

## Phase 2: machine discovery

Prepare factual machine-readable discovery surfaces before launch:

- `/llms.txt` with a concise Geomacro description and links to machine documentation;
- `/agent-commerce.md` with supported products, scope, payment rails, response semantics, limitations, and examples;
- an OpenAPI document for supported public/paid agent endpoints;
- x402 Bazaar metadata for every Coinbase-compatible resource;
- MCP exposure only for bounded tools whose payment and response contracts are acceptance-tested.

Discovery vocabulary may include factual capabilities such as country risk, geopolitical risk, macroeconomic risk, treasury pre-flight context, corridor risk, supplier-country exposure, geopolitical escalation context, portfolio geopolitical exposure, signed risk objects, and machine-readable risk evidence. Do not keyword-stuff unsupported capabilities.

## Phase 3: additional rails and registries, pre-launch only

### GOAT Flow / x402

Treat GOAT as a merchant integration, not merely another header format. Complete merchant-readiness work, receiving configuration, supported token/network discovery, idempotent orders, webhook verification, status reconciliation, and payment-to-delivery correlation in non-production/sandbox modes. Do not enable GOAT mainnet before the coordinated launch.

### Nevermined

Build and acceptance-test the Nevermined provider path against the canonical Geomacro product contract. Map Nevermined plan/credit or x402 entitlement to the same delivery ledger and publish machine-facing integration documentation from Geomacro's domain. Keep Nevermined production settlement disabled until coordinated launch.

### Directories / marketplaces

Prepare submissions and validate metadata where possible. Before launch, record listings as `draft`, `sandbox`, `testnet`, or `ready_for_launch`. Do not count a directory presence as revenue/customer evidence and do not expose a chargeable production route early.

## Phase 4: attribution, observability and growth foundation

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

Pre-launch dashboards must clearly separate synthetic/testnet acceptance data from future production revenue.

## Phase 5: evidence-driven marketing

Build marketing automation before launch, but keep external publishing approval-gated.

Eligible triggers after launch may include:

- a new marketplace/indexing confirmation;
- a new production endpoint;
- a reconciled revenue milestone;
- a sustained GRI proof milestone only after the configured sustained-evidence threshold is actually met;
- a material GRI change with proof/evidence available;
- a documented product/security milestone.

Generate channel-specific drafts for X, LinkedIn, Discord/community, developer docs, and partner updates. Public geopolitical/macro posts and commercial claims require a human approval step before publishing. Never publish payer identity, sensitive request content, wallet/private data, or unsupported revenue/security claims.

## Revenue evidence milestones after official launch

Track these as evidence points, not promises:

1. first reconciled real-money purchase;
2. first independent external payer;
3. 10 independent paying references;
4. 100 genuine paid purchases;
5. first repeat payer;
6. first $100 reconciled cumulative revenue;
7. first $1,000 30-day run rate;
8. first external workflow using Geomacro repeatedly as a pre-flight dependency.

Do not forecast revenue from marketplace listings alone.

## Coordinated official launch acceptance matrix

Every REQUIRED gate must be green before any real-money provider is activated.

| Gate | Required before official launch |
| --- | --- |
| commercial source/data rights for every paid field/scope | YES |
| exact-head CI/security/resilience | YES |
| production DB ledger and migrations | YES |
| provider-neutral offer/product contract | YES |
| dedicated settlement/revenue wallets + recovery procedures | YES |
| unpaid premium leak tests | YES |
| wrong network/token/amount/pay-to tests | YES |
| replay + concurrent duplicate tests | YES |
| ambiguous settlement reconciliation | YES |
| paid-but-undelivered remedy state | YES |
| payment-to-delivery audit trail | YES |
| privacy-safe attribution | YES |
| machine discovery surfaces | YES |
| Coinbase adapter acceptance | YES |
| GOAT adapter acceptance or explicit launch exclusion | YES |
| Nevermined adapter acceptance or explicit launch exclusion | YES |
| monitoring/alerting/reconciliation runbook | YES |
| incident rollback/kill-switch procedure | YES |
| launch-day smoke-test plan | YES |
| launch copy/listing metadata reviewed | YES |
| automated public posting | NO; approval-gated initially |
| explicit owner go-live authorization | YES, FINAL GATE |

## Execution order before activation

1. Audit current exact head against common and Coinbase readiness gates.
2. Close source-rights allowlist for all intended paid outputs.
3. Verify/deploy production delivery ledger while settlement remains disabled.
4. Complete provider-neutral offer catalog, pricing versioning and delivery semantics.
5. Complete final Coinbase sandbox/Base Sepolia regression and security suite.
6. Complete GOAT non-production merchant adapter and acceptance tests.
7. Complete Nevermined sandbox/provider adapter and acceptance tests.
8. Complete `/llms.txt`, machine docs, OpenAPI, Bazaar metadata and bounded MCP discovery.
9. Complete privacy-safe marketplace attribution and revenue/reconciliation dashboarding.
10. Complete compatible marketplace/directory submission packages without activating chargeable routes.
11. Complete approval-gated marketing automation and launch content drafts.
12. Run cross-provider negative, replay, concurrency, resilience and paid-but-undelivered tests.
13. Freeze a release candidate and run exact-head Product CI, CodeQL/security, schema, Risk Object and GRI proof gates.
14. Produce a signed/immutable launch-readiness evidence manifest with known limitations.
15. Review every launch gate and explicitly list any provider excluded from launch rather than silently weakening acceptance.
16. Only after all required gates pass, request explicit owner go-live authorization.
17. On the coordinated launch, enable only the approved production rails, run capped smoke transactions, reconcile them, verify marketplace discovery, then publish launch communications.

## Definition of launch-ready

Geomacro is launch-ready only when the intended commercial products have cleared source rights, the canonical delivery contract and all included payment adapters pass acceptance/security tests, machine discovery and attribution are ready, production monitoring/reconciliation/rollback procedures exist, and the release candidate has exact-head evidence. Launch-ready does not mean mainnet is enabled.

## Definition of first commercial success

Only after official launch: an independent or controlled production buyer purchases an eligible Geomacro resource with real funds, the payment is independently verifiable and reconciled, the correct signed intelligence is delivered, the delivery is auditable, no duplicate charge occurs, and the result preserves the non-execution boundary.
