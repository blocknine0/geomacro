# Agent-query adaptive structured intelligence contract

Status: production requirement. This does not activate Base mainnet.

## Principle

Geomacro does not sell or return upstream source feeds. A request is normalized into a deterministic query plan and the delivered product is Geomacro-generated structured intelligence assembled from governed internal evidence according to that plan.

Natural-language interpretation may select/filter already-governed facts. It must never invent a score, observation, sanction, event, country coverage claim, Risk Gate result, or methodology value.

The external boundary is permanent:

`Upstream evidence -> internal retrieval/normalization/verification -> Geomacro structured derived intelligence -> user or machine`

Successful paid responses must not expose upstream source identity, provider identity, source URL, source contract/licence metadata, internal provenance objects, retrieval metadata, or raw upstream payload/content.

## Canonical request envelope

All paid agent queries normalize into a versioned envelope before payment eligibility is determined:

- `schema_version`
- `question` (optional bounded natural-language question)
- `subjects`: country ISO3 values and/or directional corridors
- `topics`: requested intelligence dimensions
- `as_of` when the requested module explicitly supports historical semantics
- `max_age_seconds` as a request-wide stricter freshness override only
- `evidence` and `detail`
- optional `risk_gate_context`
- `client_request_id`

Supported topic vocabulary is explicit and versioned:

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

Unknown or ambiguous topics fail validation. They are never silently mapped to unrelated data.

## Query planning

The server creates a deterministic query plan containing normalized subjects/topics, required governed modules, module-specific freshness SLAs, evidence/detail requirements, Risk Gate context, supported historical semantics, and a stable `query_plan_hash`.

The same normalized request against the same contract version must produce the same plan hash. Payment proof is bound to this plan/product contract, not merely to an endpoint URL.

## Historical semantics

The current structural serving views and public GRI reader are latest-state products. They must not answer a historical `as_of` request by silently substituting current data.

Until a module has a tested at-or-before serving contract, historical requests for that module fail closed. Signed Risk Objects and Risk Gate evaluations may use their existing compatible at-or-before path where available.

## Paid-output source eligibility

Commercial readiness is scoped to sources explicitly enabled to influence paid Geomacro output. The broader ingestion/research/source universe remains independently governed and auditable, but it does not become a paid-delivery prerequisite merely because it exists in the registry.

A source may influence paid structured intelligence only when all applicable internal gates pass:

- lawful/governed ingestion is enabled;
- commercial derived use is approved as `COMMERCIAL_OK` or `DERIVED_ONLY`;
- `enabled_for_commercial_signals=true`;
- source certification is `CERTIFIED` for the governed production path;
- required evidence is current and technically deliverable for the requested module.

`raw_redistribution_allowed` is retained internally as a rights fact but is not a prerequisite for this product because raw/source payload redistribution is outside the product boundary.

Any source that is permission-pending, review-pending, technically unverified, disabled for commercial signals, stale, or otherwise ineligible must fail closed and cannot influence a paid response.

## Deliverability before payment

Before a 402 challenge, Geomacro evaluates the exact query plan against production state. Every required module must be present, within its module-specific freshness SLA, eligible for commercial derived use, provenance-complete internally, and available for the requested subject.

If any required component fails, return a no-charge availability result such as `NOT_AVAILABLE`, `INSUFFICIENT_COVERAGE`, `STALE_REQUIRED_DATA`, `COMMERCIAL_SOURCE_NOT_ELIGIBLE`, or an unsupported-query error. Internal source identity and rights metadata remain private even in no-charge availability responses.

Immediately before settlement, deliverability is checked again. The final payload must then be assembled, source-sanitized, re-hashed, contract-validated and durably prepared before settlement is attempted.

## Adaptive response envelope

Every successful response uses a stable versioned outer contract while internal modules are selected by the query plan. The response may include:

- `schema_version`
- product ID
- request/client request IDs
- `query_plan_hash`
- normalized question interpretation
- subjects and effective as-of
- requested Geomacro structured intelligence modules
- signed Geomacro Risk Object attestations when requested
- Risk Gate output when requested
- GRI context when requested
- serving/coverage/freshness metadata that does not identify an upstream provider
- methodology/schema versions that do not identify an upstream provider
- limitations
- payment metadata
- `delivered_product_hash`
- `execution_authorized=false`

The response must not include upstream source IDs, source URLs, provider names, licence/source-contract fields, raw source payloads, internal provenance/retrieval metadata, or source-specific fallback labels.

Null/missing is distinct from zero. Numeric and categorical outputs retain the timing/unit/quality information needed to interpret the Geomacro result without turning the response into upstream-data resale.

## Payment and audit binding

The paid path binds and persists at minimum:

- request ID
- query-plan hash
- product ID/version
- exact price/network/asset/pay-to contract
- privacy-preserving payment fingerprint
- delivered-product hash
- settlement transaction/reference
- delivery status
- reconciliation state

Internal source/provenance and rights evidence may be retained server-side for audit and dispute handling, but is not part of the customer payload.

A replay of the same valid paid request is idempotent and must not settle a second time. Legacy stored response payloads are sanitized and re-hashed before replay so old internal metadata cannot be re-exposed.

## Server-enforced agent controls

Production settlement is additionally protected by server-side controls including per-request maximum price, daily spend ceiling, daily request count, request/rate limits, subject count, body size, replay conflict handling, and manual-review locking after ambiguous settlement. These controls complement wallet-level protections.

## Launch acceptance

Do not call the adaptive paid product production-ready until tests prove:

- different questions deterministically select the correct governed modules;
- unsupported/ambiguous queries fail safely;
- unsupported historical semantics fail closed;
- all required data is checked before a payment challenge;
- insufficient, stale or commercially ineligible data produces no charge;
- caller freshness can tighten but never relax module SLAs;
- only certified, derived-commercial-eligible, explicitly paid-output-enabled sources can influence a paid result;
- raw redistribution permission is never incorrectly required for a derived-only product;
- raw source content, source identity, provider identity, source URLs, source contracts and internal provenance never reach the paid response;
- final deliverability is rechecked and the response is sanitized, re-hashed and durably prepared before settlement;
- replayed legacy payloads pass the same source-free boundary;
- exact price is disclosed before payment;
- payment/query/product binding is enforced;
- unpaid requests leak no premium payload;
- wrong chain/token/recipient, underpayment, replay conflicts and ambiguous settlement are blocked;
- duplicate/replay/concurrent requests produce zero duplicate charges;
- server-side spend/request controls work;
- settlement transaction, request ID and delivered-product hash reconcile;
- signed Risk Objects remain independently verifiable;
- `execution_authorized=false` remains true.

Base mainnet activation remains a separate final owner-controlled gate after these checks, production data census, security/resilience evidence, wallet/CDP configuration and explicit real-USDC authorization are all ready.
