# Agent-query adaptive structured intelligence contract

Status: production requirement. This contract extends the global country/hot-topic and x402 readiness work. It does not activate Base mainnet.

## Principle

Geomacro must not return one fixed blob regardless of the agent's question. The agent request is parsed into a deterministic query plan, and the delivered structured intelligence is assembled from governed Geomacro data according to that plan.

Natural-language interpretation may select/filter already-governed facts. It must never invent a score, observation, source, sanction, event, country coverage claim, Risk Gate result, or methodology value.

## Canonical request envelope

All paid agent queries normalize into a versioned request envelope before price/payment eligibility is determined:

- `schema_version`
- `question` (optional natural-language question, bounded length)
- `subjects`: country ISO3 values and/or directional corridors
- `topics`: requested intelligence dimensions
- `time`: current/as-of/range plus freshness requirement
- `output`: detail level, evidence requirement, comparison/ranking intent
- `policy`: optional Risk Gate policy/action context
- `client_request_id`

Supported topic vocabulary must be explicit and versioned. Initial production vocabulary:

- `sovereign_risk`
- `macro_risk`
- `fx_external_risk`
- `sanctions_restrictions`
- `conflict_geopolitics`
- `trade_corridor`
- `energy_commodities`
- `critical_minerals`
- `political_governance`
- `banking_financial_system`
- `food_agriculture`
- `natural_hazards`
- `hot_topics`
- `risk_gate`
- `risk_object`
- `gri_context`

Unknown topics fail validation or are explicitly returned as unsupported. They are never silently mapped to unrelated data.

## Query planning

The server creates a deterministic `query_plan` containing:

- normalized subjects
- normalized topics
- required modules/datasets
- optional enrichment modules
- required freshness per module
- required commercial-source eligibility
- output projection
- evidence/provenance requirements
- Risk Gate requirement
- estimated bounded product class

The plan is hashed. The same normalized request against the same contract version must produce the same plan hash.

## Deliverability before payment

Before a 402 challenge, Geomacro evaluates the query plan against the current production coverage catalog.

Every required module must be:

1. present for every required subject,
2. within its freshness SLA,
3. commercially eligible,
4. provenance-complete,
5. quality/confidence eligible,
6. internally consistent enough to serve,
7. available under the requested as-of/range semantics.

If any required component fails, return a no-charge availability result such as `NOT_AVAILABLE`, `INSUFFICIENT_COVERAGE`, `STALE_REQUIRED_DATA`, `COMMERCIAL_SOURCE_NOT_ELIGIBLE`, or `UNSUPPORTED_QUERY`.

A paid challenge is issued only after the full requested product is deliverable. Immediately before settlement, the same plan is re-evaluated to prevent a stale/race-condition charge.

## Adaptive response envelope

Every successful response uses a stable outer envelope while the `intelligence` modules are selected by the query plan:

- `schema_version`
- `request_id`
- `client_request_id`
- `query_plan_hash`
- `question_interpretation`
- `subjects`
- `as_of`
- `intelligence`
- `hot_topics`
- `risk_gate` when requested/applicable
- `signed_risk_objects` when requested/applicable
- `coverage`
- `confidence`
- `freshness`
- `sources`
- `methodology`
- `limitations`
- `payment`
- `audit`

`intelligence` contains only the requested/required modules, but each module uses a stable versioned schema. This gives agents question-specific data without making the API shape unpredictable.

## Question patterns that must be first-class

- single-country current risk
- multi-country comparison
- country ranking/filtering within the currently deliverable universe
- directional corridor exposure
- sanctions/restrictions lookup
- FX/external vulnerability
- sovereign/fiscal stress
- conflict/geopolitical escalation
- hot-topic impact on one or more countries/corridors
- trade/supply-chain/energy/minerals exposure
- change-since-date / change attribution
- Risk Gate pre-flight for a proposed action
- evidence/source/freshness audit query

Ranking/comparison must never treat missing countries as low-risk. Missing/insufficient subjects are excluded and disclosed.

## Hot-topic semantics

A hot topic is a versioned, time-bounded evidence object, not a permanent label. It must include topic/event ID, affected subjects, event/evidence timestamps, severity, confidence, sources, freshness/expiry, and impact attribution where available. Expired topics must not remain current merely because they were once important.

## Structured-data integrity

Use JSON Schema Draft 2020-12 for externally documented request/response/module contracts. Each production response records schema/methodology versions and hashes. Breaking semantic changes require a new contract version.

Numeric values must retain units, observation period, source, and transformation provenance. Null/missing is distinct from zero. Model-derived interpretation must be marked separately from deterministic/source observations.

## Payment and audit binding

The payment must bind to the normalized query/product, not just an endpoint URL. Persist at minimum:

- request ID
- query-plan hash
- requested product/topics/subjects
- exact advertised price
- payer/payment fingerprint (privacy-preserving where appropriate)
- network/asset/pay-to
- settlement tx hash/reference
- delivered response/product hash
- schema/methodology versions
- delivery timestamp/status
- reconciliation status

A replay of the same valid paid request returns the same/cached delivery according to idempotency policy and must not settle again. Reusing a payment proof for a materially different query must fail.

## Agent controls

Production agents need server-enforced controls in addition to wallet controls:

- per-agent/request authentication identity where applicable
- per-request maximum price
- rolling spend budget
- request/rate limits
- maximum subject count
- maximum time-range/lookback
- maximum response/evidence size
- concurrency limits
- bounded retries with no automatic retry after ambiguous settlement

Limits are evaluated before settlement. Exceeding a limit is a no-charge failure.

## Launch acceptance

Do not call the adaptive paid product production-ready until tests prove:

- different questions select the correct modules and stable schemas
- unsupported/ambiguous queries fail safely
- all requested required data is checked before payment
- insufficient/stale/unlicensed data produces no charge
- multi-country comparison does not hide missing coverage
- hot-topic expiry/freshness works
- exact price is disclosed before payment
- paid response is cryptographically/auditably bound to the request plan
- unpaid requests leak no premium payload
- underpayment/wrong chain/token/recipient fail before settlement
- duplicate/replay/concurrent requests produce zero duplicate charges
- agent spend/rate/usage limits work
- settlement tx, request ID and delivered-product hash reconcile
- signed Risk Objects remain independently verifiable
- `execution_authorized=false` remains true for intelligence/Risk Gate outputs

Base mainnet activation remains a separate final owner-controlled gate after this acceptance suite, country/hot-topic production census, security/resilience checks, and production secrets/wallet configuration are all ready.
