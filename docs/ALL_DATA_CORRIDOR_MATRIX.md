# All Data Corridor Matrix

This workflow is the evidence aggregator for Geomacro's country and corridor Private Pilot readiness. It is designed to use every currently governed commercial source that can be consumed without silently changing the frozen GRI/GRO scoring methodology.

## What is used

The matrix combines:

- current `live_structured_events` commercial-rights state from the authoritative Geomacro product database;
- dry-run country Risk Objects from the current signed GRO country methodology;
- the historical warehouse's governed `commercial_structural_country_profiles` and `commercial_structural_country_coverage_latest` serving relations;
- `commercial_structural_corridor_latest` for direct bilateral evidence availability and endpoint-composition metadata;
- the current corridor pilot engine for every directed pair of accepted country candidates.

The historical warehouse remains server-only. Raw/private historical tables are not read by this workflow.

## Methodology boundary

Structural evidence is useful context and coverage evidence, but remains `EVIDENCE_ONLY_NOT_IN_GRI_V1_2`. It is not added to the GRI or signed country GRO score unless a future deterministic, versioned methodology is separately validated and activated.

The current corridor methodology remains `corridor-endpoint-max-v0.1.0-pilot`. A matrix row is useful pilot evidence, not an independently verified route-risk model. No maritime path, chokepoint, vessel, counterparty, correspondent-bank or sanctions-screening capability is implied.

## Current source program

Commercially usable where the governed contract permits it:

- GDELT-derived live event signals inside the derived-only customer-delivery boundary;
- World Bank WGI structural political-stability evidence;
- UNHCR Refugee Population Statistics structural displacement evidence;
- UCDP GED conflict exposure;
- UCDP Dyadic interstate evidence where coverage exists;
- USGS public-domain rare-earth evidence when relevant to a subject/use case.

Not silently promoted:

- Guardian Open Platform data in the current automated commercial/AI path;
- GDACS until commercial-use review closes;
- OFAC/UNSC until the explicit commercial/reuse review gate closes;
- BGS World Mineral Statistics until its license review closes;
- FRED as commercial canonical macro data;
- Coin Metrics Community as commercial data.

## Missing-data program

The JSON artifact contains `missing_data_actions` per country. It distinguishes current-live blockers from missing structural dimensions. Missing structural dimensions map to governed acquisition/backfill actions for WGI, UCDP GED, UCDP Dyadic and UNHCR rather than being filled with zeros or synthetic values.

For macro expansion, replace research-only FRED dependencies with direct official sources before those values are treated as canonical commercial output. For sanctions, close legal/reuse review separately and preserve attribution semantics. For route-specific corridor claims, build and independently validate a new corridor methodology rather than relabeling endpoint composition.

## Safety

The matrix is read-only evidence. It does not publish Risk Objects, move funds, perform GOAT/x402 payments, or authorize downstream execution. `execution_authorized=false` is asserted in the workflow artifact.
