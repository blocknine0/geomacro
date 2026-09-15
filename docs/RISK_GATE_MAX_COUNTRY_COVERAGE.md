# Risk Gate maximum country coverage

Status: production expansion contract, fail closed.

## Objective

Geomacro Risk Gate country coverage is data-driven, not a hard-coded country allowlist. The target denominator is every enabled sovereign ISO3 country in `live_country_registry`. A country is commercially available only when the complete governed evidence chain required by the active methodology is deliverable at request time.

Maximum coverage never means fabricated coverage, lowered evidence thresholds, silently extended freshness windows, or inheritance of commercial rights from an organisation name to an unreviewed dataset.

## Country eligibility invariant

A country may be advertised, offered for payment, or returned as commercially supported only when all of these conditions pass:

1. ISO3 resolves to an enabled sovereign country in the production country registry.
2. Every module required by the active Risk Gate country action profile is present.
3. Every required module meets its existing freshness, peer-universe, coverage and confidence rules.
4. Every contributing observation has an allowed commercial eligibility state for its exact adapter/dataset contract.
5. A compatible signed Risk Object exists and its signature verifies.
6. The Risk Gate evaluation completes with `execution_authorized=false` and no missing required modules.
7. Customer serialization obeys each source's raw-redistribution / derived-only boundary and retains required provenance and attribution.

If any condition fails, the country is `FAIL_CLOSED` / `COUNTRY_NOT_AVAILABLE`. Paid rails must not request or settle payment for that request.

## Current production country modules

The global country census is the source of truth for country-review readiness. It evaluates every enabled sovereign country against:

- `geopolitical_security`
- `political_governance`
- `sovereign_fiscal`
- `macro_monetary`

The census must report the exact accepted count, fail-closed count, percentage and per-country reasons. Do not replace this measured denominator with a marketing country count.

## Source cross-check, 2026-09-15

The source-rights register and activation matrix were cross-checked against current official provider terms before this coverage contract was recorded.

### Eligible/active or verified exact contracts

- World Bank WDI source 2: World Bank dataset terms default Bank-produced datasets to CC BY 4.0, including commercial reuse with attribution, while warning that third-party datasets/indicators can carry different restrictions. Geomacro approval remains pinned to the exact WDI source-2 adapter.
- World Bank WGI 2025 Revision: the World Bank catalogue labels the published WGI dataset Public / CC BY 4.0. Approval applies to the World Bank-published WGI output, not separately identifiable proprietary underlying inputs.
- UCDP current official datasets: the UCDP Download Center states current datasets are CC BY 4.0 and may be used/redistributed with the listed citations. Geomacro still requires exact adapter/version promotion; `ucdp_ged` and `ucdp_candidate` are verified, while an unpromoted adapter such as the current dyadic path remains excluded.
- UNHCR Refugee Population Statistics Database: dataset-specific terms state CC BY 4.0 except where otherwise provided, require UNHCR/data-provider attribution, and preserve third-party exceptions. This dataset-specific contract must not be generalized to UNHCR website content or restricted microdata.
- Eurostat: statistical-data commercial reuse is generally authorised with acknowledgement, but explicit exceptions include third-party material and specified non-EU/EFTA/candidate-country and trade-data cases. Geomacro approval remains pinned to the exact reviewed `gov_10q_ggdebt` dataset/geography contract.
- U.S. EIA: EIA states its U.S.-government data/information products are public domain and may be used/distributed with acknowledgement, while third-party protected material is excluded. EIA remains a candidate until a versioned Risk Gate energy methodology and production adapter are promoted.
- USGS: USGS-produced data/information are generally U.S. public domain with source credit requested, while third-party copyrighted material is excluded. Existing Geomacro approvals remain dataset/adapter-specific.

### Must remain excluded from paid coverage until separately cleared

- UN Comtrade: current licence agreement prohibits commercial exploitation/automated redistribution without prior written UN permission. Do not use it to claim paid global trade coverage until permission is recorded.
- IMF data: keep disabled under the current Geomacro source register until the exact commercial reuse contract is deliberately cleared.
- BIS statistics: keep review-required until the exact paid-product reuse conditions are cleared.
- V-Dem: keep disabled until share-alike implications are deliberately accepted and implemented.
- Any OFAC/UNSC sanctions adapter currently marked `REVIEW_REQUIRED` / `UNVERIFIED`: no paid delivery until exact source-policy promotion.
- Any source that is merely public/free/API-accessible but lacks exact rights, adapter, freshness and methodology evidence.

## Payment boundary

For Coinbase x402, GOAT, credits, subscriptions and every future paid rail, use the same invariant:

`request -> no-charge deliverability/eligibility check -> payment challenge only if deliverable -> payment verification -> final deliverability re-check + response preparation -> settlement -> delivery`

If the pre-check or final re-check fails, no settlement is allowed. A payment rail must never turn an unsupported country into a supported country.

## Expansion procedure

To increase the accepted-country count:

1. run `scripts/global-risk-gate-country-census.ts` against production data and preserve the report;
2. group fail-closed countries by missing/unverified module and source reason;
3. improve coverage only with definition-compatible, commercially cleared sources;
4. never lower peer/freshness/confidence thresholds merely to increase the count;
5. ingest/backfill normalized observations with source/version/provenance hashes;
6. generate/refresh compatible signed Risk Objects;
7. rerun the full census and Risk Gate tests;
8. publish only the newly measured accepted set/count;
9. paid availability/discovery must be generated from the same eligibility result, not a manually maintained country list.

## Marketing boundary

Geomacro may say it targets broad/global sovereign coverage and can publish the exact measured supported-country count from the latest production census. It must not say "all countries" unless the current production census actually accepts the entire enabled-sovereign denominator.
