# Agent-query adaptive structured intelligence contract

Status: production requirement. This does not activate Base mainnet.

## Principle

Geomacro does not return one fixed blob regardless of the agent's question. A request is normalized into a deterministic query plan and the delivered intelligence is assembled from governed Geomacro data according to that plan.

Natural-language interpretation may select/filter already-governed facts. It must never invent a score, observation, source, sanction, event, country coverage claim, Risk Gate result, or methodology value.

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

## Deliverability before payment

Before a 402 challenge, Geomacro evaluates the exact query plan against production data. Every required module must be present, within its module-specific freshness SLA, commercially eligible for the exact delivery mode, provenance-complete enough to serve, and internally available for the requested subject.

For adaptive structured evidence, source eligibility additionally requires explicit permission for the structured/raw redistribution boundary used by the response. Sources approved only for internal or derived intelligence may still support governed scores/Risk Objects but are not exposed as paid structured evidence rows.

If any required component fails, return a no-charge availability result such as `NOT_AVAILABLE`, `INSUFFICIENT_COVERAGE`, `STALE_REQUIRED_DATA`, `COMMERCIAL_SOURCE_NOT_ELIGIBLE`, or an unsupported-query error. A paid challenge is issued only after deliverability succeeds.

Immediately before settlement, deliverability is checked again. The final payload must then be assembled and durably prepared before settlement is attempted.

## Adaptive response envelope

Every successful response uses a stable versioned outer contract while the internal modules are selected by the query plan. The response includes:

- `schema_version`
- product ID
- request/client request IDs
- `query_plan_hash`
- normalized question interpretation
- subjects and effective as-of
- requested structural intelligence modules
- signed Risk Objects when requested
- Risk Gate output when requested
- GRI context when requested
- serving/coverage metadata
- source IDs and source-contract metadata available from deliverability
- methodology/schema versions
- limitations
- payment metadata
- `delivered_product_hash`
- `execution_authorized=false`

Null/missing is distinct from zero. Numeric values retain unit, observation timing and deterministic provenance fields exposed by the governed serving layer.

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

A replay of the same valid paid request is idempotent and must not settle a second time. Reusing the same payment proof for a materially different query fails.

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
- structured evidence is not exposed from derived-only/no-redistribution sources;
- final deliverability is rechecked and the response is prepared before settlement;
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