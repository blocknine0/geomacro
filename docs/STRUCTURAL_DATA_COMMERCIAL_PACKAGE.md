# Geomacro Structural Data Commercial Package

This is the commercial source of truth for how Geomacro exposes structural historical context to public users, founding pilots and institutional integrations.

Structural data is supporting evidence. It is not a hidden Global Risk Index (GRI) v1.2 input and it is not an undisclosed input to the signed Geomacro Risk Object (GRO) v0.2 score contract.

## 1. What structural data means in Geomacro

Structural data is slower-moving historical context that helps explain the environment around a current geopolitical or macro decision.

The current governed commercial serving layer is historical geopolitical evidence delivered as:

- bounded public structured digests;
- country structural profiles;
- directional corridor structural profiles;
- coverage and provenance metadata;
- eligible direct bilateral observations where available.

The current corridor model is endpoint-composed. It does not model the complete logistics, maritime, payment, counterparty, sanctions or correspondent-bank route.

## 2. Current governed serving interfaces

The main product consumes historical structural evidence only through governed serving interfaces:

- `commercial_structural_country_profiles`
- `commercial_structural_country_coverage_latest`
- `commercial_structural_corridor_latest`

The governed base commercial evidence boundary remains:

- `commercial_structural_geopolitical_observations`

The private raw warehouse is never a customer-facing commercial interface. Every customer-facing tier receives governed structured output only.

## 3. What a country structural profile can contain

A country profile may include the latest commercially eligible observations across available structural dimensions together with coverage and provenance.

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
- source URL when redistribution rules allow it;
- parser version;
- methodology status;
- quality status;
- provenance metadata;
- normalized content hash;
- retrieval time.

Coverage records can include:

- source ID;
- structural dimension;
- country;
- coverage year;
- coverage status;
- observation count;
- latest observed time;
- audit metadata;
- last update time.

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

Launch allocation: **500 credits per 30 days**.

Available without a Private Pilot agreement:

- Geomacro Agent v1 grounded intelligence query;
- public Risk Intelligence;
- current verified GRI when the canonical public freshness/proof contract passes;
- selected evidence and source context already exposed in the public product;
- a bounded governed `structural_query` for one country or one directional corridor per request;
- up to three latest commercially eligible structural observations per public structural response;
- structured coverage summary and explicit availability/missing-data state;
- public methodology and audit documentation.

Not included in the public/free layer:

- raw historical structural warehouse access;
- private warehouse access;
- bulk structural exports;
- full country structural profile payloads;
- full corridor structural profile payloads;
- signed Risk Objects;
- Risk Gate integration;
- institutional support or SLA.

The 500-credit allocation is a launch-stage product quota. Durable account-based credit metering must be implemented before the quota is represented as actively enforced across anonymous public requests. Until then, anonymous endpoints remain rate-limited and the tariff remains the commercial entitlement contract.

### Founding Pilot: Analyst / Operational Workflow

Default product allocation: **5,000 credits per 30 days**, subject to the signed pilot scope.

For a narrow paid pilot, the buyer can receive a governed structural evidence package for the agreed country or directional corridor.

Default pilot deliverables may include:

- latest country structural observations;
- origin/destination structural context for one directional corridor;
- source and dimension coverage;
- observation timestamps;
- metric/value/unit;
- source/provenance metadata subject to rights restrictions;
- quality/methodology status;
- normalized integrity hashes;
- explicit missing-data status;
- current public intelligence and verified GRI where relevant;
- agreed structured exports;
- founder-led interpretation and weekly review.

Raw warehouse delivery is not included.

### Founding Pilot: API / Risk Gate

Default product allocation: **20,000 credits per 30 days**, subject to the signed pilot scope.

For a technical pilot, the buyer can additionally receive:

- machine-readable governed structural context payloads;
- signed country or directional-corridor Risk Objects;
- Risk Gate recommendation and reason codes;
- confidence/freshness/verification state;
- controlled API access with agreed rate limits;
- integration support for one defined workflow;
- decision-audit evidence where implemented in the pilot path.

The customer controls execution. Geomacro keeps `execution_authorized=false`.

Raw warehouse delivery remains prohibited.

### Institutional Expansion

Current product-volume starting anchor: **100,000 credits per month**, then contracted volume based on geography, history, cadence, API use, support and data-rights scope.

A wider institutional agreement can be discussed only after the founding pilot validates usefulness, source rights, reliability, support requirements and delivery volume.

Potential expansion may include:

- additional countries and corridors;
- deeper historical coverage;
- wider API volume;
- team workflows;
- custom structured exports;
- additional approved structural dimensions;
- custom monitoring cadence;
- agreed support and security review requirements.

These are not generally available promises until separately validated and contracted. Raw/private warehouse access is not an institutional entitlement.

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

## 8. Commercial source-rights gate

A source may enter customer structural delivery only when:

- the exact dataset/API is identified;
- commercial reuse is permitted for the intended delivery mode;
- attribution/reuse requirements are recorded;
- raw redistribution restrictions are understood;
- adapter operation is verified;
- the observation carries an approved commercial eligibility state;
- downstream delivery obeys derived-only/raw-data restrictions.

Unknown or review-required source rights fail closed.

Public accessibility alone is not commercial permission.

## 9. Current exclusions

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

## 10. Methodology boundary

Main-product structural responses are labelled:

`EVIDENCE_ONLY_NOT_IN_GRI_V1_2`

Historical warehouse evidence remains labelled:

`EVIDENCE_ONLY_NOT_IN_GRO_V02`

If structural evidence is ever promoted into a published score, Geomacro must first introduce a new deterministic/versioned methodology, historical replay, validation, proof artifacts, documentation and deliberate activation step.

## 11. Relationship to Geomacro Agent

Geomacro Agent v1 is the public machine-readable entry point.

Today it provides:

- grounded public intelligence queries;
- bounded public governed structural digests;
- discovery of the controlled risk-preflight capability.

Full structural profiles, signed Risk Objects and Risk Gate remain Founding Pilot / controlled paid capabilities until wider source-rights, reliability, account metering and access-control contracts are validated.

The commercial sequence is therefore:

`public agent discovery -> grounded intelligence / bounded structured digest -> qualified workflow -> full structural profile / signed Risk Object / Risk Gate pilot -> validated paid continuation`
