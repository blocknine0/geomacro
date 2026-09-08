# Commercial source-rights evidence register

**Status:** commercialization control document  
**Last reviewed:** 2026-09-09

This register records the engineering evidence and delivery restrictions used when Geomacro marks an external source eligible for paid Risk API / Risk Gate delivery.

It is not legal advice. Dataset/API terms can change and can contain item-specific exceptions. Re-review a source whenever the exact dataset, API contract, access tier, licence, attribution requirement, raw-redistribution rule, or intended customer-delivery mode changes.

## Core rule

Public accessibility is **not** commercial permission.

A source may enter paid delivery only when all of the following are true:

1. the exact dataset/API asset is identified;
2. the intended commercial/business reuse is permitted;
3. attribution and reuse requirements are recorded;
4. raw redistribution restrictions are understood;
5. the automated adapter is operationally verified;
6. the observation is explicitly marked with a DB-valid commercial eligibility state;
7. downstream delivery obeys any derived-only/raw-data restriction.

Unknown or omitted eligibility fails closed as `UNVERIFIED`.

## Current reviewed controls

### World Bank World Development Indicators

- Adapter source ID: `world_bank_indicators`
- Exact API source: World Bank source `2`
- Dataset: World Development Indicators (WDI)
- Recorded licence label: `CC BY 4.0`
- Dataset terms reference: `https://www.worldbank.org/ext/en/legal/terms-conditions/datasets`
- Runtime rule: every API request is pinned with `source=2`
- Provenance rule: normalized observations retain dataset name, API source ID, indicator ID/name, country, licence label, terms reference and retrieval time
- Identity rule: normalized `source_record_id` includes the World Bank API source ID so another catalogue cannot silently inherit WDI rights state
- Current engineering eligibility: explicit `VERIFIED` only for the pinned WDI adapter contract above

A different World Bank catalogue, endpoint or product must not inherit this status automatically.

### UCDP Dyadic / interstate-tension evidence

- Dataset contract is retained with dataset/version provenance
- Transport may require authenticated UCDP API access
- Source-policy state remains `REVIEW_REQUIRED`
- Persisted `live_external_observations.commercial_eligibility_status` is therefore `UNVERIFIED`
- It must not enter paid delivery until the source-policy review is explicitly closed

### OFAC / UNSC sanctions-coercion evidence

- Source-policy state remains `REVIEW_REQUIRED`
- Raw customer redistribution remains disabled
- Persisted observation eligibility is `UNVERIFIED`
- Review-gated sanctions evidence must remain outside commercial structural output until the governing source registry/view explicitly permits it

## Shared observation-builder safety

`scripts/lib-live-source-utils.mjs` defaults `commercialEligibilityStatus` to `UNVERIFIED`.

A new adapter therefore cannot silently become commercially eligible simply because its author omitted the field. An adapter must supply `VERIFIED` or another reviewed DB-valid status explicitly.

## Separate questions: rights vs operational readiness

A licence review does not prove the ingestion is production-ready, and a working ingestion does not prove commercial rights. Track these separately:

- source/dataset rights;
- provenance completeness;
- commercial eligibility state;
- adapter operational validation;
- data freshness/coverage;
- derived-only/raw-redistribution restrictions;
- customer delivery mode.

## Structural historical warehouse boundary

The main product may consume structural geopolitical history only through the historical warehouse view:

`commercial_structural_geopolitical_observations`

It must never use the private raw `structural_geopolitical_observations` table as a commercial interface. Structural rows remain evidence context and are labelled `EVIDENCE_ONLY_NOT_IN_GRI_V1_2` unless a future separately versioned and validated scoring methodology explicitly changes that boundary.

## Current limitation

This register is not a claim that every source used anywhere inside Geomacro has completed final commercial-rights diligence. Sources that remain `UNVERIFIED`, `REVIEW_REQUIRED`, restricted, experimental, research-only, or technically unvalidated must stay outside paid delivery until their specific review gate is closed.