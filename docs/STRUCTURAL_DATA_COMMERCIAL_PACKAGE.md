# Geomacro Structural Data Commercial Package

This is the commercial source of truth for how Geomacro exposes structural historical context to public users, founding pilots and institutional integrations.

Structural data is supporting evidence. It is not a hidden Global Risk Index (GRI) v1.2 input and it is not an undisclosed input to the signed Geomacro Risk Object (GRO) v0.2 score contract.

## 1. What structural data means in Geomacro

Structural data is slower-moving historical context that helps explain the environment around a current geopolitical or macro decision.

The current governed commercial serving layer is historical geopolitical evidence delivered as:

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

The private raw warehouse is never a customer-facing commercial interface.

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

### Public / Free

Available without a Private Pilot agreement:

- Geomacro Agent v1 grounded intelligence query;
- public Risk Intelligence;
- current verified GRI when the canonical public freshness/proof contract passes;
- selected evidence and source context already exposed in the public product;
- public methodology and audit documentation.

Not included in the public/free layer:

- raw historical structural warehouse access;
- bulk structural exports;
- full country structural profile payloads;
- corridor structural payloads;
- signed Risk Objects;
- Risk Gate integration;
- institutional support or SLA.

### Founding Pilot: Analyst / Operational Workflow

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
- founder-led interpretation and weekly review.

### Founding Pilot: API / Risk Gate

For a technical pilot, the buyer can additionally receive:

- machine-readable structural context payloads;
- signed country or directional-corridor Risk Objects;
- Risk Gate recommendation and reason codes;
- confidence/freshness/verification state;
- controlled API access with agreed rate limits;
- integration support for one defined workflow;
- decision-audit evidence where implemented in the pilot path.

The customer controls execution. Geomacro keeps `execution_authorized=false`.

### Institutional Expansion

A wider institutional agreement can be discussed only after the founding pilot validates usefulness, source rights, reliability, support requirements and delivery volume.

Potential expansion may include:

- additional countries and corridors;
- deeper historical coverage;
- wider API volume;
- team workflows;
- custom exports;
- additional approved structural dimensions;
- custom monitoring cadence;
- agreed support and security review requirements.

These are not generally available promises until separately validated and contracted.

## 7. Commercial source-rights gate

A source may enter paid structural delivery only when:

- the exact dataset/API is identified;
- commercial reuse is permitted;
- attribution/reuse requirements are recorded;
- raw redistribution restrictions are understood;
- adapter operation is verified;
- the observation carries an approved commercial eligibility state;
- downstream delivery obeys derived-only/raw-data restrictions.

Unknown or review-required source rights fail closed.

Public accessibility alone is not commercial permission.

## 8. Current exclusions

The structural commercial product does not currently claim:

- complete route or logistics modelling;
- port, vessel or counterparty modelling;
- correspondent-bank or payment-path modelling;
- sanctions-screening replacement;
- a structural risk score;
- structural weighting inside GRI v1.2;
- structural weighting inside GRO v0.2;
- raw private warehouse redistribution;
- paid delivery of review-gated sources;
- a third-party security or methodology certification.

## 9. Methodology boundary

Main-product structural responses are labelled:

`EVIDENCE_ONLY_NOT_IN_GRI_V1_2`

Historical warehouse evidence remains labelled:

`EVIDENCE_ONLY_NOT_IN_GRO_V02`

If structural evidence is ever promoted into a published score, Geomacro must first introduce a new deterministic/versioned methodology, historical replay, validation, proof artifacts, documentation and deliberate activation step.

## 10. Relationship to Geomacro Agent

Geomacro Agent v1 is the public machine-readable entry point.

Today it provides grounded public intelligence queries and discovers the controlled risk-preflight capability. Structural payloads remain a Founding Pilot / Private Pilot capability until the broader source-rights and access-control contract is ready for general public API delivery.

The commercial sequence is therefore:

`public agent discovery -> grounded public intelligence -> qualified workflow -> structural profile / signed Risk Object / Risk Gate pilot -> validated paid continuation`
