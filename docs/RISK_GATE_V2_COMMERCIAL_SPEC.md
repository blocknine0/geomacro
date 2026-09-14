# Geomacro Risk Gate v2 Commercial Specification

## Status

This document defines the target commercial architecture for the next Risk Gate iteration. It is a build specification, not a claim that every item below is already live.

Risk Gate v1 remains the current implemented Private Pilot contract until v2 components are built, tested, deployed and verified.

The permanent product boundary does not change:

- Geomacro provides external geopolitical, macroeconomic and related real-world risk context.
- Risk Gate evaluates that context against a caller/customer policy.
- The customer or consuming system owns identity, permissions, compliance, fiduciary judgment and downstream execution.
- `execution_authorized` must remain `false` at the Geomacro boundary.
- No Risk Gate response may be presented as transaction authorization, sanctions clearance, investment advice or custody/execution approval.

## Commercial product definition

Risk Gate is Geomacro's pre-decision external-risk control layer for financial systems, institutions and autonomous agents.

Plain-language product statement:

> Check the external geopolitical and macro risks that matter to a financial action before the customer's system decides what to do.

Risk Gate should answer five questions quickly:

1. What action is being considered?
2. What countries, corridors, entities, sectors, markets and routes are exposed?
3. Which external risk modules matter to this specific action?
4. What changed, why, and how confident is Geomacro?
5. Does the customer's own policy require normal handling, reduced exposure, review or a pause?

## Commercial outcome model

The existing machine contract remains compatible with the current decision ladder:

- `CONTINUE`
- `REDUCE_LIMIT`
- `REQUIRE_APPROVAL`
- `PAUSE`

The commercial UI may present plain-language labels without changing the machine meaning:

| Machine decision | Commercial display label | Meaning |
| --- | --- | --- |
| `CONTINUE` | CLEAR | No configured Risk Gate threshold requires escalation. |
| `REDUCE_LIMIT` | CAUTION | Risk is above the normal operating range; reduce exposure according to customer policy. |
| `REQUIRE_APPROVAL` | REVIEW | Human or higher-policy approval is required. |
| `PAUSE` | HOLD | The configured policy or fail-closed control requires a pause. |

`REROUTE` is a recommendation candidate, not a separate authorization state. It may be returned as an advisory alternative when a lower-risk corridor/route is known and validated, while the canonical decision remains one of the four states above.

## Global subject model

Risk Gate v2 must not be limited to a small set of demo countries or corridors. The architecture must support global coverage wherever Geomacro has sufficient validated data.

Target subject classes:

- country / territory
- country-to-country corridor
- regional corridor
- region
- state / province / subnational area
- city / metro where data quality is sufficient
- port
- airport
- border crossing
- strait / canal / maritime chokepoint
- shipping / logistics route
- energy route / pipeline / transmission corridor
- currency pair
- commodity / strategic resource
- market / asset exposure
- sector / industry
- counterparty geographic exposure
- portfolio exposure
- event / crisis
- custom multi-exposure basket

A request may contain one primary subject and multiple linked exposures.

## Action context model

Risk Gate should understand what the customer is trying to do, because the same country risk should not produce the same relevance weighting for every workflow.

Initial commercial action classes:

- cross-border payment
- treasury transfer
- cash concentration / sweeping
- FX conversion / hedge
- settlement
- lending / credit exposure
- trade finance
- counterparty onboarding / review
- investment / allocation review
- supply-chain sourcing decision
- shipment / route planning
- commodity procurement
- insurance / underwriting review
- institutional wallet transfer
- stablecoin transfer / redemption / settlement
- autonomous financial-agent action
- custom customer-defined action

Action context should be able to include:

- amount and currency
- origin and destination
- settlement currency
- customer sector
- counterparty jurisdiction
- intermediary jurisdictions
- route/chokepoint exposure
- commodity/sector exposure
- time horizon
- urgency
- policy profile
- customer-defined tags

## Market-wide risk ontology

Risk Gate v2 needs a broad ontology because commercial users care about both persistent risk categories and rare risks that become material during a crisis.

### 1. Geopolitical and security

- interstate conflict
- civil conflict
- military escalation
- territorial dispute
- terrorism / political violence
- coup / unconstitutional transfer of power
- election instability
- protest / civil unrest
- diplomatic rupture
- alliance change
- border closure
- military mobilization
- expropriation / nationalization risk

### 2. Geoeconomic, sanctions and trade

- sanctions
- secondary-sanctions exposure
- asset freezes
- export controls
- import restrictions
- tariffs
- quotas
- embargoes
- investment screening
- trade retaliation
- forced-localization measures
- technology restrictions
- forced-labor / supply-chain restrictions
- payment-system exclusion

### 3. Political, governance and institutional

- government stability
- policy continuity
- rule-of-law deterioration
- institutional weakness
- corruption / governance deterioration
- regulatory unpredictability
- civic instability
- emergency powers / state intervention

### 4. Sovereign and fiscal

- sovereign credit deterioration
- debt sustainability
- default / restructuring risk
- fiscal deficit stress
- public-finance deterioration
- reserve adequacy
- external funding dependence
- debt-service burden

### 5. Macro and monetary

- growth slowdown / recession
- inflation
- interest-rate shock
- monetary-policy divergence
- unemployment / labor-market stress
- current-account stress
- balance-of-payments stress
- liquidity conditions
- demand shock

### 6. FX, capital mobility and convertibility

- currency depreciation / appreciation shock
- FX volatility
- reserve depletion
- capital controls
- convertibility restrictions
- repatriation restrictions
- multiple exchange-rate regimes
- offshore/onshore market dislocation

### 7. Banking, credit and financial-system

- banking-system stress
- funding stress
- deposit flight
- credit deterioration
- sovereign-bank feedback risk
- market liquidity stress
- capital-market closure
- contagion risk
- settlement-system stress

### 8. Payments and treasury

- cross-border payment disruption
- correspondent-banking constraints
- payment-rail outage
- settlement delay
- beneficiary-jurisdiction restrictions
- stablecoin / digital-asset rail restriction
- reserve / redemption risk relevant to settlement
- local banking holiday / emergency closure
- treasury repatriation constraints

### 9. Supply chain and logistics

- port disruption
- maritime security
- shipping-lane disruption
- border congestion / closure
- customs disruption
- airfreight disruption
- rail / road disruption
- supplier concentration
- critical component shortage
- inventory shock
- freight-cost shock
- insurance withdrawal / war-risk premium

### 10. Energy, commodities and strategic resources

- oil / gas disruption
- electricity / grid disruption
- food and agriculture shock
- metals shock
- rare-earth disruption
- critical-mineral disruption
- fertilizer / petrochemical disruption
- strategic commodity dependency
- energy transit chokepoint exposure

### 11. Regulatory, legal and compliance environment

- regulatory change
- licensing restriction
- tax / capital-treatment change
- foreign-investment restriction
- data-localization requirement
- contract-enforcement deterioration
- legal-system disruption
- product / sector ban

Risk Gate does not replace sanctions/KYC/AML screening. These signals provide contextual external risk only.

### 12. Infrastructure, cyber and technology

- critical-infrastructure disruption
- cyberattack with macro/operational impact
- telecom outage
- internet shutdown
- cloud / data-center regional disruption
- satellite / GNSS disruption
- submarine-cable disruption
- semiconductor / technology supply shock
- export-controlled technology dependency

### 13. Climate, environment and natural hazard

- extreme weather
- flood
- drought
- wildfire
- earthquake
- storm / cyclone
- water stress
- heat stress
- climate-policy shock
- physical asset / logistics interruption

The financial relevance of these risks must be context-sensitive rather than automatically blended into every decision.

### 14. Societal, labor and health

- strike / labor disruption
- migration shock
- social instability
- public-health emergency
- workforce availability shock
- inequality / social-fragility transmission when material to the action

### 15. Information and influence

- misinformation / disinformation shock
- information-integrity deterioration
- foreign interference
- market-moving false-information event
- communications restriction

These modules require strong confidence controls because information operations can themselves contaminate evidence.

### 16. Emerging and long-tail risks

This module captures valid but less frequently monitored risks that can become material rapidly, for example:

- rare material shortages
- unusual capital controls
- insurance-market withdrawal
- emergency shipping restrictions
- satellite-navigation interference
- critical cable outages
- sudden digital-asset restrictions
- unexpected reserve rules
- rapid nationalization measures
- new war-risk zones
- sanctions-evasion enforcement shocks

Long-tail signals must never receive high weight merely because they are novel. Relevance, evidence quality, confidence and transmission path are required.

## Context-sensitive module activation

Risk Gate must not run every module with equal importance for every request.

The context resolver should produce an explicit activation plan:

```text
action + geography + corridor + currency + sector + counterparty + route + time horizon
    -> relevant risk modules
    -> module weights
    -> hard-stop checks
    -> evidence requirements
```

Examples:

### Cross-border treasury payment

Likely active modules:

- country / corridor geopolitical risk
- sanctions / trade restrictions
- FX / convertibility
- banking / payment-system stress
- macro / sovereign stress
- settlement-rail disruption
- capital controls / repatriation

### Semiconductor sourcing

Likely active modules:

- geopolitical conflict
- trade/export controls
- technology restrictions
- supplier concentration
- shipping/logistics
- electricity / infrastructure
- FX
- critical materials

### Commodity procurement

Likely active modules:

- conflict
- commodity supply
- shipping / chokepoints
- sanctions
- energy costs
- FX
- weather where relevant
- sovereign / political instability

## Risk calculation architecture

Risk Gate v2 should separate world-state calculation from customer policy evaluation.

```text
raw/derived eligible signals
    -> normalized subject signals
    -> subject/module Risk Objects
    -> exposure relevance + transmission model
    -> action-specific risk context
    -> customer policy
    -> Risk Gate decision
```

Risk Gate must not hide uncertainty behind a single score.

For each active module, the calculation should preserve at minimum:

- module score
- module confidence
- previous module score
- delta
- top drivers
- evidence count
- independent-source count where available
- freshness
- methodology version
- data/calculation hash
- commercial eligibility state

## Scoring principles

The exact production methodology must be separately versioned and validated. The v2 architecture should support the following model without hard-coding unvalidated weights into the public contract.

For each signal/module:

```text
normalized impact
x evidence confidence
x freshness/decay
x subject relevance
x action relevance
x transmission strength
= weighted contribution
```

Then:

```text
active module contributions
+ deterministic hard-stop rules
+ verified change/delta escalation rules
= action risk context
```

The customer policy then maps that risk context to the canonical Risk Gate decision.

### Required scoring properties

- deterministic for a fixed input set, methodology version and timestamp bucket
- reproducible
- versioned
- bounded
- traceable to raw/derived evidence identifiers
- explicit decay
- explicit confidence
- explicit missing-data handling
- no silent substitution of stale data for fresh data
- change attribution that reconciles material score movement
- preserved previous state for delta analysis

## Coverage and confidence behavior

Risk Gate must prefer an honest degraded result over false precision.

Target coverage states:

- `FULL`
- `PARTIAL`
- `LIMITED`
- `INSUFFICIENT`

A request with insufficient verified coverage must not silently produce a normal `CONTINUE` result.

Depending on customer policy, `INSUFFICIENT` coverage should normally result in `REQUIRE_APPROVAL` or `PAUSE`.

## Suggested v2 request contract

Illustrative forward contract:

```json
{
  "schema_version": "risk-gate-request-2.0",
  "request_id": "rgq_...",
  "primary_subject": {
    "type": "corridor",
    "id": "IN>AE"
  },
  "exposures": [
    { "type": "country", "id": "IND", "role": "origin" },
    { "type": "country", "id": "ARE", "role": "destination" },
    { "type": "currency", "id": "USD", "role": "settlement" }
  ],
  "action_context": {
    "action_type": "cross_border_payment",
    "amount": 250000,
    "currency": "USD",
    "origin_country_iso3": "IND",
    "destination_country_iso3": "ARE",
    "sector": "financial_services",
    "time_horizon": "immediate"
  },
  "policy": {
    "policy_id": "treasury-standard",
    "policy_version": "1.0.0"
  }
}
```

The customer policy thresholds may remain server-side for managed institutional profiles or be supplied under an authenticated contract, depending on the commercial integration model.

## Suggested v2 response contract

Illustrative target response:

```json
{
  "schema_version": "risk-gate-2.0",
  "request_id": "rgq_...",
  "decision": "REQUIRE_APPROVAL",
  "display_label": "REVIEW",
  "recommended_action": "REQUIRE_HUMAN_APPROVAL",
  "execution_authorized": false,
  "subject": {
    "type": "corridor",
    "id": "IN>AE"
  },
  "action_risk": {
    "score": 67.4,
    "previous_score": 58.2,
    "delta": 9.2,
    "confidence": 0.86,
    "coverage": "FULL",
    "direction": "escalating"
  },
  "active_modules": [
    {
      "module": "currency_fx",
      "score": 72.1,
      "delta": 8.4,
      "confidence": 0.9,
      "contribution": 18.2
    }
  ],
  "top_drivers": [],
  "thresholds_triggered": [],
  "watchlist": [],
  "alternatives": [],
  "integrity": {
    "methodology_version": "...",
    "calculation_hash": "...",
    "risk_object_ids": []
  },
  "policy": {
    "policy_id": "treasury-standard",
    "policy_version": "1.0.0"
  }
}
```

The response must preserve the current verifiability and audit boundary rather than returning an opaque LLM-generated recommendation.

## Database architecture

The implementation should extend the current persisted Risk Object and immutable audit architecture instead of replacing it.

Target normalized tables / stores:

### `risk_subjects`

Canonical subject registry.

Key fields:

- `subject_id`
- `subject_type`
- `canonical_code`
- `display_name`
- `parent_subject_id`
- `geometry_or_route_ref` where applicable
- `active`
- `coverage_state`
- timestamps

### `risk_exposure_edges`

Links subjects and exposures.

Examples:

- corridor -> origin country
- corridor -> destination country
- route -> chokepoint
- commodity -> producing country
- sector -> strategic input

Key fields:

- `edge_id`
- `from_subject_id`
- `to_subject_id`
- `relationship_type`
- `direction`
- `weight_hint`
- `methodology_version`
- timestamps

### `risk_module_states`

Versioned module-level subject state.

Key fields:

- `module_state_id`
- `subject_id`
- `risk_module`
- `score`
- `previous_score`
- `delta`
- `confidence`
- `coverage_state`
- `generated_at`
- `expires_at`
- `methodology_version`
- `input_hash`
- `data_hash`
- `calculation_hash`
- `commercial_eligibility_status`

### `risk_module_attribution`

Key fields:

- `module_state_id`
- `driver_code`
- `score_contribution`
- `delta_contribution`
- `signal_count`
- `weight`

### `risk_action_profiles`

Versioned default activation/weight templates by action type.

Key fields:

- `profile_id`
- `action_type`
- `version`
- `active_modules`
- `module_weights`
- `required_exposures`
- `hard_stop_rules`
- `status`

### `risk_gate_policy_profiles`

Managed customer policy profiles where contractually appropriate.

Key fields:

- `policy_id`
- `client_id`
- `policy_version`
- thresholds
- minimum confidence
- minimum coverage
- hard-stop rules
- allowed action types
- status

### `risk_gate_v2_audit_log`

If a new audit table is required, it must preserve the current immutable/minimized audit principles.

It should store metadata and hashes required to reproduce/correlate a decision without turning the audit ledger into a dump of customer-sensitive payloads.

## Commercial UI flow

The `/risk-gate` page should become a clear B2B product surface.

### Hero

Recommended core copy:

**Check geopolitical and macro risk before your system takes financial action.**

Supporting message:

Risk Gate turns current external risk into a verifiable pre-decision check for treasury, payments, lending, FX, institutional workflows and financial agents.

Primary CTA:

- `Test Risk Gate`

Secondary CTA:

- `Request an institutional pilot`

### Interactive demo flow

1. Choose workflow/action type.
2. Choose origin/exposure country.
3. Choose destination/corridor where relevant.
4. Add currency, amount, sector or other relevant exposure.
5. Select a standard demo policy profile.
6. Run Risk Gate.
7. Show result.

### Result hierarchy

The UI should show, in this order:

1. decision: CLEAR / CAUTION / REVIEW / HOLD
2. one-sentence reason
3. current risk + change
4. confidence + coverage
5. relevant modules for this action
6. top drivers
7. thresholds triggered
8. emerging/watchlist risks
9. what would change the result / counterfactual
10. signed Risk Object / integrity / methodology proof
11. machine-readable JSON
12. explicit `execution_authorized = false`

### Three risk views

The commercial UI should distinguish:

- **Headline risks**: major current external risks relevant to the selected geography/market.
- **Relevant risks for this action**: modules that materially affect the current decision.
- **Watchlist / emerging risks**: lower-current-impact signals that could become material if a trigger occurs.

This prevents a long ontology from overwhelming the user while retaining long-tail coverage.

## Initial buyer-specific presets

The first commercial presets should be:

1. Treasury and cross-border payments
2. FX and settlement
3. Lending / counterparty exposure
4. Institutional wallet / programmable finance
5. Autonomous financial agents
6. Supply-chain / commodity exposure

These presets change context/module relevance and customer-policy defaults; they do not create separate incompatible risk engines.

## Public and private product boundary

Public website/demo may expose:

- demo/sample risk context
- supported subject types
- methodology concepts
- explainability
- sample machine-readable output
- verification concepts
- Testnet technical proof

Private/institutional delivery may include:

- customer policy profiles
- customer-specific thresholds
- private exposures
- custom subject baskets
- higher-rate API access
- private alerts/webhooks
- audit exports
- support/operations commitments according to contract

## Security and resilience requirements

Before external Early Access or commercial pilot claims, v2 must have documented evidence for:

- authentication and authorization
- tenant isolation
- rate limiting
- input validation
- replay/idempotency handling
- audit persistence
- request/response data minimization
- secret isolation
- signature verification
- fail-closed behavior
- stale/degraded-data handling
- negative-path tests
- load/stress tests
- retry behavior
- dependency failure behavior
- critical/high finding remediation and retest

## Commercial data-rights requirement

Every signal used in paid Risk Gate delivery must carry enough policy metadata to determine whether its use is allowed for the specific commercial output.

Restricted or review-pending sources must fail closed from commercial delivery.

Raw third-party content should not be redistributed merely because a derived Risk Gate output exists.

## Implementation priority

### Phase 1: Contract and ontology foundation

- define v2 subject/action/exposure contracts
- define broad risk taxonomy
- preserve v1 compatibility
- define display-label mapping
- define coverage/degraded states
- document v2 request/response contract

### Phase 2: Data model

- subject registry
- exposure graph
- module-state persistence
- attribution persistence
- action profiles
- policy profiles
- migration and RLS/security tests

### Phase 3: Context resolver and module engine

- action-context resolver
- module activation
- weighting/transmission model
- confidence/freshness behavior
- change attribution
- emerging-risk watchlist
- deterministic hashes/versioning

### Phase 4: Risk Gate engine v2

- aggregate action risk context
- policy evaluation
- hard-stop rules
- degraded coverage behavior
- counterfactuals
- alternatives/reroute advisory where validated
- immutable audit

### Phase 5: API

- authenticated v2 endpoint
- compatibility/versioning
- idempotency
- stable error contract
- rate limits
- observability
- sample SDK/request examples

### Phase 6: Commercial UI

- rebuild `/risk-gate`
- interactive country/corridor/global exposure demo
- buyer presets
- plain-language decision result
- machine-readable proof panel
- institutional pilot CTA

### Phase 7: Validation

- methodology tests
- geography/corridor coverage tests
- security review
- stress/resilience tests
- commercial source-rights checks
- design-partner tests
- willingness-to-pay / pilot validation

## Definition of commercial readiness

Risk Gate v2 is not commercially ready merely because the UI looks complete.

A supported workflow is ready for an external pilot only when:

- the required risk modules have validated data coverage;
- methodology and calculation are versioned and reproducible;
- confidence and degraded states are explicit;
- commercial source eligibility is verified;
- request/response contracts are stable;
- security and stress evidence exists;
- audit behavior is verified;
- no critical/high unresolved finding remains;
- the customer-policy and execution boundary is explicit;
- a real design-partner workflow has been exercised end to end.
