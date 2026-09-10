# Geomacro Structural Data Commercial Package

This is the commercial source of truth for how Geomacro exposes structural historical context to public website users, founding paid pilots and institutional integrations.

Structural data is supporting evidence. It is not a hidden Global Risk Index (GRI) v1.2 input and it is not an undisclosed input to the signed Geomacro Risk Object (GRO) v0.2 score contract.

## 1. What structural data means in Geomacro

Structural data is slower-moving historical context that helps explain the environment around a current geopolitical or macro decision.

The governed commercial serving layer supports:

- country structural profiles;
- directional corridor structural profiles;
- coverage and provenance metadata;
- eligible direct bilateral observations where available;
- bounded machine-readable digests for paid API workflows.

The current corridor model is endpoint-composed. It does not model the complete logistics, maritime, payment, counterparty, sanctions or correspondent-bank route.

## 2. Current governed serving interfaces

The main product consumes historical structural evidence only through governed serving interfaces:

- `commercial_structural_country_profiles`
- `commercial_structural_country_coverage_latest`
- `commercial_structural_corridor_latest`

The governed base commercial evidence boundary remains:

- `commercial_structural_geopolitical_observations`

The private raw warehouse is never a customer-facing commercial interface. Commercial delivery uses governed structured output only.

## 3. What a country structural profile can contain

A paid country profile may include the latest commercially eligible observations across available structural dimensions together with coverage and provenance.

Machine-readable fields can include:

- observation ID;
- structural dimension;
- country ISO3;
- partner-country ISO3 when present;
- observed time;
- published time;
- metric;
- numeric or text value;
- unit;
- event or signal type when present;
- source ID;
- source reference where redistribution rules allow it;
- parser version;
- methodology status;
- quality status;
- normalized content hash;
- retrieval time.

Coverage records can include source ID, structural dimension, country, coverage year/status, observation count, latest observed time, audit metadata and last update time.

Missing dimensions remain missing. Geomacro does not replace missing structural evidence with zero values.

## 4. What a directional corridor profile can contain

A corridor request uses an origin country and destination country.

The current serving contract combines:

1. origin-country structural profile;
2. destination-country structural profile;
3. eligible direct bilateral observations when a source explicitly links the two endpoints.

Every corridor response should disclose:

- `composition_method = ENDPOINT_COMPOSED_V0_1`;
- `route_modeling_status = NOT_MODELED`;
- whether direct bilateral evidence is `AVAILABLE` or `NO_DIRECT_BILATERAL_EVIDENCE`;
- origin/destination coverage metadata;
- current structural observations that survive the commercial source-rights boundary.

A lack of direct bilateral evidence is not evidence of low risk.

## 5. Structural status semantics

Structural context is fail-closed and uses explicit states:

- `AVAILABLE`: eligible governed evidence is available;
- `UNAVAILABLE`: the system is configured but eligible evidence is absent or a governed read failed;
- `NOT_CONFIGURED`: the isolated runtime has no historical warehouse configuration.

No state silently becomes a low-risk value.

## 6. Access model: who gets what

### Public / Free Explorer

Free Explorer is a public website/dashboard experience only.

The public product may show selected intelligence, selected event/evidence summaries, current public GRI visibility, methodology and approved public country/corridor views.

The free layer does **not** include:

- API credentials;
- anonymous structured API access;
- structured-data download/export;
- full country or corridor structural profile payloads;
- signed Risk Objects;
- Risk Gate;
- commercial machine access;
- institutional support or SLA.

Free Explorer has no commercial API credit allocation.

### Founding Analyst Pilot

Default commercial allocation: **5,000 credits per 30 days**, subject to the signed pilot scope.

Current default founding quote: **USD 1,500 / 30 days**.

A narrow paid Analyst pilot may include:

- deeper professional intelligence and analytics;
- alerts/monitoring within the agreed pilot scope;
- country/corridor historical context;
- change attribution where commercially eligible;
- premium Ask Geomacro;
- governed country/corridor profile views;
- agreed structured exports where the signed pilot scope permits them;
- founder-led interpretation/review where included.

This tier is dashboard/research oriented. It does not automatically create a commercial API credential, signed Risk Object entitlement or Risk Gate entitlement.

Raw warehouse delivery is not included.

### Founding API + Risk Gate Pilot

Default commercial allocation: **20,000 credits per 30 days**, subject to the signed pilot scope.

Current default founding quote: **USD 2,500 / 30 days**.

The buyer can additionally receive:

- authenticated machine-readable governed structural payloads;
- country/corridor digests and profiles within registry limits;
- signed country or directional-corridor Risk Objects;
- Risk Gate recommendation and reason codes;
- confidence/freshness/verification state;
- controlled API access with agreed rate limits;
- integration support for one defined workflow;
- decision-audit evidence where implemented.

The customer controls execution. Geomacro keeps `execution_authorized=false`.

Raw warehouse delivery remains prohibited.

### Institutional

Starting product-volume anchor: **100,000 credits per month**, then contracted volume based on geography, history, cadence, API use, support and data-rights scope.

Current annual discussion anchor starts around **USD 24k-36k**, subject to contract and scope.

Potential contracted expansion may include additional countries/corridors, deeper historical coverage, wider API volume, team workflows, custom structured exports, additional approved structural dimensions, custom monitoring cadence and agreed support/security requirements.

These are not generally available promises until separately validated and contracted. Raw/private warehouse access is not an institutional entitlement by default.

### Agent commerce / one-shot machine purchase

A machine or autonomous agent may purchase one bounded capability through an approved payment adapter.

Example canonical mapping:

`machine_risk_preflight -> risk_gate_bundle -> signed Risk Object + Risk Gate decision -> execution_authorized=false`

A one-shot machine payment does not grant the entire monthly API tier. The payment provider can prove payment; only the centralized Geomacro entitlement registry decides the resulting payload.

## 7. Credit tariff

Current commercial product tariff:

- grounded intelligence query: 1 credit;
- current GRI / attribution read: 1 credit;
- country structural digest: 3 credits;
- corridor structural digest: 5 credits;
- full governed country profile: 8 credits;
- full governed corridor profile: 12 credits;
- standalone signed Risk Object: 10 credits;
- Risk Gate + signed-object bundle: 15 credits.

Credits are a product-usage unit, not money, currency, a token, a deposit or a cash-redeemable stored-value instrument.

## 8. Centralized entitlement registry

`src/lib/structured-data-entitlement-registry.ts` is the server-owned source of truth for:

- which commercial tier can access each capability;
- which subject types are valid;
- observation/evidence limits;
- history mode;
- export mode;
- signed Risk Object availability;
- Risk Gate availability;
- public-web vs paid-dashboard vs API vs agent vs institutional access surfaces;
- payment offer to canonical entitlement mapping;
- permanent safety boundaries.

Clients and payment providers cannot override these settings with request fields.

## 9. Commercial source-rights gate

A source may enter customer structural delivery only when the exact dataset/API is identified, commercial reuse is permitted for the intended delivery mode, attribution/reuse requirements are recorded, raw redistribution restrictions are understood, adapter operation is verified, the observation carries an approved commercial eligibility state, and downstream delivery obeys derived-only/raw-data restrictions.

Unknown or review-required source rights fail closed. Public accessibility alone is not commercial permission.

## 10. Current exclusions

The structural commercial product does not currently claim:

- complete route or logistics modelling;
- port, vessel or counterparty modelling;
- correspondent-bank or payment-path modelling;
- sanctions-screening replacement;
- a structural risk score;
- structural weighting inside GRI v1.2;
- structural weighting inside GRO v0.2;
- raw private warehouse redistribution;
- customer delivery of review-gated sources;
- a third-party security or methodology certification.

## 11. Methodology boundary

Main-product structural responses are labelled:

`EVIDENCE_ONLY_NOT_IN_GRI_V1_2`

Historical warehouse evidence remains labelled:

`EVIDENCE_ONLY_NOT_IN_GRO_V02`

If structural evidence is ever promoted into a published score, Geomacro must first introduce a new deterministic/versioned methodology, historical replay, validation, proof artifacts, documentation and deliberate activation step.

## 12. Relationship to Geomacro Agent

Geomacro Agent discovery is not a free commercial API. Free users use the public website/dashboard.

The `/api/agent/risk` route remains a bounded Arc Testnet x402 technical-proof/private-pilot surface. Anonymous `intelligence_query` and `structural_query` fulfillment is disabled under the commercial launch policy.

Production paid structured delivery is resolved through the commercial entitlement layer and the centralized Structured Data Entitlement Registry.
