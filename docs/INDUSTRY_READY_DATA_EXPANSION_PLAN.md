# Geomacro Industry-Ready Global Data Expansion Plan

**Status:** implementation control document  
**Review date:** 2026-09-16

## Objective

Build the broadest defensible sovereign-country and corridor coverage without inventing data, weakening methodology thresholds, or charging for an unavailable deliverable.

Coverage is data-driven. A request is payable only when the production deliverability preflight proves that every required governed input is currently available, sufficiently fresh, legally/commercially eligible for the exact delivery mode, and able to produce the promised structured output. The final deliverability check and durable payload preparation must also succeed before settlement.

## Measured 100-country source-availability milestone

The 2026-09-16 no-write World Bank source-path census cleared the raw verified-source availability target without changing production support:

- QPSD source-specific sovereign-fiscal union: **72** countries;
- fresh World Bank PPG external-debt-pressure path: **115** countries;
- overlap: **33** countries;
- unique source-path union: **154** countries;
- target of at least 100 distinct verified source paths observed: **YES**;
- production-supported/payable countries added by this evidence pass: **0**.

The 154-country union is an availability/discovery result, not a scoring peer universe and not a supported-country claim. QPSD general-government debt, QPSD central-government debt and PPG external-debt pressure remain semantically separate source-specific paths. Their raw values and peer distributions must not be pooled to manufacture coverage.

The promotion sequence is therefore: authoritative sovereign-registry mapping -> independent source-specific shadow methodology -> source rights/freshness/quality/state checks -> required-module country census -> only then production promotion for the exact countries that pass every gate.

## Parallel workstreams

1. Run the global sovereign Risk Gate census and classify every fail-closed country by missing module, freshness, peer-universe, source-rights, adapter, verification, or Risk Object failure.
2. Expand source coverage in parallel, starting with sources that are globally broad, machine-readable, definitionally compatible, and commercially usable under an exact reviewed dataset contract.
3. Backfill historical observations where the exact source contract permits it, retaining source record identity, observation period, retrieval time, source/version, licence/terms reference, quality state, commercial eligibility, and normalized hash.
4. Re-run country/module coverage after every source promotion. Never publish a supported-country count from an allowlist or assumption.
5. Keep raw third-party resale disabled unless the exact source contract explicitly permits redistribution. Where raw redistribution is not allowed, use the source only inside governed derived products that respect its delivery boundary.

## Priority data families

| Data family | Target role | Preferred source path | Current action |
|---|---|---|---|
| macro / monetary | inflation, growth, monetary stress | World Bank WDI/Data360 exact open datasets; ADB exact open datasets for regional supplementation | expand indicator coverage and backfill |
| sovereign fiscal | debt/fiscal capacity | WDI where definition/current peers are adequate; World Bank QPSD source-specific paths; Eurostat exact eligible geographies; OECD exact datasets after metadata/third-party checks; ADB exact compatible series | QPSD shadow methodology exists; harmonize only definitionally compatible concepts; do not lower peer threshold |
| political / governance | political stability and institutional context | World Bank WGI | maximize sovereign coverage and retain release manifest |
| conflict / security | conflict intensity and current security stress | UCDP GED/Candidate; GDELT-derived event evidence | retain release/version provenance and derived-output boundary |
| displacement / humanitarian | structural displacement pressure | UNHCR Refugee Population Statistics | backfill normalized origin-country observations under dataset-specific terms |
| FX / external | reserves, external vulnerability and currency context | World Bank open indicators first; QEDS SDDS and IDS as exact rights-reviewed candidates | implement source-specific no-write coverage/shadow adapters before any promotion |
| sanctions / restrictions | sanctions and material restrictions context | exact promoted sanctions adapters only | remain fail-closed until exact source-policy promotion is complete |
| trade / supply chain | concentration and corridor exposure | World Bank open indicators first; Eurostat only eligible geographies/data; other sources only after exact rights review | do not use UN Comtrade in paid production without permission |
| energy | energy dependence, production/supply exposure | U.S. EIA international energy datasets | implement exact API-key-backed adapters and a versioned methodology before scoring promotion |
| critical minerals | mineral production/dependence context | USGS Mineral Commodity Summaries | expand governed normalized coverage; methodology promotion separately versioned |
| natural hazards | acute physical hazard evidence | USGS Earthquake Hazards; exact reviewed public-domain hazard feeds | build hazard schema/methodology before Risk Gate scoring promotion |
| banking / financial system | credit, banking and cross-border financial vulnerability | World Bank first; BIS only under a delivery model compatible with BIS commercial-use conditions | legal/product boundary before paid inclusion |
| agriculture / food | production/import dependence and food-security structural exposure | exact reviewed FAOSTAT datasets only after clearance | rights/metadata review before adapter promotion |

## Source-rights implementation rules

- World Bank-produced open datasets such as WDI are generally CC BY 4.0, but each exact dataset and third-party exception remains pinned and reviewed.
- World Bank QPSD, QEDS SDDS and IDS candidate paths are treated as exact-dataset contracts; one dataset's rights do not automatically promote another World Bank asset.
- World Bank WGI approval applies to the World Bank-published dataset output, not separately identifiable proprietary underlying inputs.
- UCDP current official datasets are versioned and citation-bound; only promoted exact adapters may enter production.
- UNHCR Refugee Population Statistics is dataset-specific and must not be generalized to restricted microdata or unrelated website content.
- OECD data may be used commercially except where additional restrictions or third-party ownership apply. Exact dataset metadata must be checked before activation.
- Eurostat reuse is generally allowed commercially with attribution, but geography, trade and third-party exceptions apply. Only eligible rows/geographies may enter paid output.
- EIA and USGS U.S.-government-produced data can be reusable with source acknowledgement/credit, while protected third-party material is excluded.
- IMF potential commercial reuse remains permission-gated in Geomacro's production register until deliberately cleared.
- BIS remains review-gated because paid-product conditions may conflict with per-call x402 monetization.
- FAO/FAOSTAT remains review-gated for paid product use until the exact dataset and additional database terms are deliberately cleared.
- UN Comtrade remains excluded from paid production without the required permission.

These are engineering governance decisions, not legal advice. Provider terms can change, so exact asset/version and review date remain part of the production contract.

## Database ingestion contract

Every new source adapter must persist, at minimum:

- canonical ISO3/corridor subject identity;
- metric ID and versioned definition;
- raw observation value/unit and normalized value where applicable;
- observation/reference period;
- `retrieved_at` and source release/version;
- source ID, exact dataset/API contract and `source_record_id`;
- provenance/citation metadata;
- licence/terms reference and review date;
- `quality_status` and commercial eligibility as separate states;
- freshness/expiry state;
- normalized/source hash;
- derived-only/raw-redistribution restrictions.

Unknown rights, unknown provenance, incompatible definitions, insufficient peer universe, stale observations, or missing required modules fail closed.

## Payment invariant

For every paid rail, including Coinbase x402 and future rails:

`request -> no-charge deliverability preflight -> payable challenge only if deliverable -> payment verification -> final deliverability re-check -> payload preparation + durable persistence -> settlement -> delivery`

If deliverability is false at either check, preparation fails, or settlement outcome is ambiguous, automatic charging/recharging is blocked according to the replay/reconciliation rules.

## Acceptance gates

Industry-ready expansion is accepted only when automated evidence shows:

1. enabled-sovereign denominator and exact accepted/fail-closed country set;
2. per-subject module coverage, confidence, freshness and commercial eligibility;
3. deterministic normalized observations and source/version provenance;
4. signed Risk Object verification and Risk Gate completion where requested;
5. negative tests for unsupported, stale, missing, unverified, commercially ineligible and definition-incompatible inputs;
6. paid preflight rejects unavailable requests before a payment challenge;
7. final pre-settlement re-check prevents charging when availability changes;
8. structured evidence is exposed only when the contributing source contract permits that delivery mode;
9. no production claim exceeds the measured census.

Base mainnet real-funds activation remains a separate owner-controlled gate.
