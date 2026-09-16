# World Bank IDS source review

**Status:** rights-verified external-sovereign candidate. Not active for paid Risk Gate scoring.  
**Reviewed:** 2026-09-16

## Exact source

- Provider: World Bank
- Database: International Debt Statistics (IDS)
- Frequency: annual
- Primary Geomacro use: public and publicly guaranteed external debt, debt-service pressure, creditor structure and external sovereign vulnerability for eligible reporting economies
- Intended modules: `fx_external_risk` and later a versioned external-sovereign vulnerability module

IDS is valuable for external debt sustainability and debt-service context. It is not a substitute for total public-sector, general-government or central-government gross debt.

Official references:

- `https://datacatalog.worldbank.org/search/dataset/0038015/international-debt-statistics`
- `https://www.worldbank.org/en/programs/debt-statistics/ids`
- `https://api.worldbank.org/v2/country/all/indicator/DT.DOD.DPPG.CD?format=json&source=6`

## Rights boundary

The reviewed World Bank Data Catalog entry identifies IDS as Public and licensed under CC BY 4.0, subject to the World Bank dataset terms and dataset-specific third-party restrictions. Commercial adaptation requires attribution and exact-source provenance.

This review is narrow. It does not grant commercial status to unrelated World Bank catalogue items or third-party material. Geomacro paid delivery remains derived structured intelligence; raw source redistribution is separately governed.

## Methodology boundary

Production eligibility requires:

1. exact IDS series identifiers and source pinning;
2. deterministic same-country/same-period joins when ratios are derived;
3. preservation of currency/unit, borrower class, creditor class, maturity and period where applicable;
4. response/bulk hashes, retrieval timestamps and parser versions;
5. exact ISO3 mapping against the authoritative Geomacro registry;
6. source-specific peer universes with the existing fixed minimum;
7. unchanged freshness and confidence gates;
8. no relabelling of PPG external debt as total government debt;
9. no raw-value pooling with QPSD/WDI/Eurostat fiscal concepts;
10. shadow scoring, attribution checks and a full country census before promotion.

## Activation state

`production_activation_allowed=false`

`commercial_rights_candidate=VERIFIED_EXACT_DATASET_CC_BY_4_0`

Existing World Bank PPG shadow methodology can be used as a semantic reference, but any broader IDS adapter must preserve its own exact series definitions and provenance.
