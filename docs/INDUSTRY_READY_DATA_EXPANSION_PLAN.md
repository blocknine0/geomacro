# Geomacro Industry-Ready Global Data Expansion Plan

**Status:** implementation control document
**Review date:** 2026-09-15

## Objective

Build the broadest defensible sovereign-country Risk Gate coverage without inventing data, weakening methodology thresholds, or charging for an unavailable deliverable.

Coverage is data-driven. A country is payable only when the production deliverability preflight proves that the required governed inputs are currently available, sufficiently fresh, commercially eligible for the intended derived output, and able to produce the promised signed Risk Object and Risk Gate response.

## Parallel workstreams

1. Run the global sovereign census and classify every fail-closed country by missing module, freshness, peer-universe, source-rights, adapter, or verification failure.
2. Expand source coverage in parallel, starting with sources that are globally broad, machine-readable, definitionally compatible, and commercially usable under an exact reviewed contract.
3. Backfill historical observations where the exact source contract permits it, retaining source record identity, observation period, retrieval time, source/version, licence/terms reference, quality state, commercial eligibility, and normalized hash.
4. Re-run country/module coverage after every source promotion. Never publish a supported-country count from an allowlist or assumption.
5. Keep raw third-party payload resale disabled by default. Customer delivery is Geomacro-derived intelligence with allowed provenance and attribution.

## Priority data families

| Data family | Target Risk Gate role | Preferred source path | Current action |
|---|---|---|---|
| macro / monetary | inflation, growth, FX/external buffers, monetary stress | World Bank WDI/Data360 exact open datasets; ADB exact open datasets for regional supplementation | expand indicator coverage and backfill |
| sovereign fiscal | debt/fiscal capacity | WDI where definition/current peers are adequate; Eurostat exact eligible geographies; OECD exact datasets after metadata/third-party checks; ADB exact compatible series | harmonize only definitionally compatible concepts; do not lower peer threshold |
| political / governance | political stability and institutional context | World Bank WGI | maximize sovereign coverage and retain release manifest |
| conflict / security | conflict intensity and current security stress | UCDP GED/Candidate; GDELT-derived event evidence | maintain release/version provenance and derived-output boundary |
| displacement / humanitarian | structural displacement pressure | UNHCR Refugee Population Statistics | backfill normalized origin-country observations under dataset-specific terms |
| energy | energy dependence, production/supply exposure | U.S. EIA international energy datasets | implement exact API-key-backed adapters and a versioned methodology before scoring promotion |
| critical minerals | mineral production/dependence context | USGS Mineral Commodity Summaries | expand governed normalized coverage; methodology promotion separately versioned |
| natural hazards | acute physical hazard evidence | USGS Earthquake Hazards | build hazard schema/methodology before Risk Gate scoring promotion |
| banking / financial system | credit, banking and cross-border financial vulnerability | World Bank first; BIS only under a delivery model compatible with BIS commercial-use conditions | legal/product boundary before paid inclusion |
| trade / supply chain | external concentration and corridor exposure | World Bank open indicators first; Eurostat only eligible geographies/data; other sources only after exact rights review | do not use UN Comtrade in paid production without permission |
| agriculture / food | production/import dependence and food-security structural exposure | evaluate exact FAOSTAT datasets item-by-item | rights/metadata review before adapter promotion |

## Source-rights findings that affect implementation

- World Bank-produced open datasets such as WDI are generally CC BY 4.0, but each exact dataset and third-party exception remains pinned and reviewed.
- ADB Data Library datasets are generally CC BY 3.0 IGO unless otherwise indicated and permit commercial use with attribution; exact dataset metadata still controls.
- OECD data may be used commercially except where additional restrictions or third-party ownership apply. Exact dataset metadata must be checked before activation.
- Eurostat statistical reuse is generally allowed commercially with attribution, but important geography, trade and third-party exceptions apply. Only eligible rows/geographies may enter paid output.
- EIA U.S.-government-produced data is reusable with source acknowledgement; protected third-party material is excluded.
- IMF statistical data has special reuse terms but the IMF explicitly directs potential commercial reuse to request permission. Keep paid-product activation permission-gated until deliberately cleared.
- BIS statistics have a special commercial condition: inclusion in a commercial product must not result in an additional charge to subscribers/users. Do not activate BIS as a paid Geomacro input until product/legal review confirms compatibility with the x402/subscription delivery model.
- FAO statistical databases are generally CC BY 4.0 subject to additional terms and third-party exceptions. Because the terms also restrict use in conjunction with promotion of a commercial enterprise/product, require deliberate legal/product review before paid activation.
- UN Comtrade remains excluded from paid production without the required permission.

## Database ingestion contract

Every new source adapter must persist, at minimum:

- canonical ISO3 subject identity;
- metric ID and versioned definition;
- raw observation value/unit and normalized value where applicable;
- observation/reference period;
- retrieved_at and source release/version;
- source ID, exact dataset/API contract and source_record_id;
- provenance/citation metadata;
- licence/terms reference and review date;
- quality_status and commercial_eligibility_status as separate fields;
- freshness/expiry state;
- normalized/source hash;
- derived-only/raw-redistribution restrictions.

Unknown rights, unknown provenance, incompatible definitions, insufficient peer universe, stale observations, or missing required modules fail closed.

## Payment invariant

For every paid rail, including Coinbase x402 and future rails:

`request -> no-charge deliverability preflight -> payable challenge only if deliverable -> payment verification -> final deliverability re-check and payload preparation -> settlement -> delivery`

If deliverability is false at either check, do not settle and do not charge.

## Acceptance gates

Industry-ready country expansion is accepted only when automated evidence shows:

1. enabled-sovereign denominator and exact accepted/fail-closed country set;
2. per-country module coverage, confidence, freshness and commercial eligibility;
3. deterministic normalized observations and source/version provenance;
4. signed Risk Object verification and Risk Gate completion for accepted countries;
5. negative tests for unsupported, stale, missing, unverified and definition-incompatible inputs;
6. paid preflight rejects unavailable countries before a payment challenge;
7. final pre-settlement re-check prevents charging when availability changes;
8. no production claim exceeds the measured census.

Base mainnet real-funds activation remains a separate owner-controlled gate.