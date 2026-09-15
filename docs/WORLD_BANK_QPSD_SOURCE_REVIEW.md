# World Bank QPSD source review

**Status:** coverage / methodology candidate only. Not active for paid Risk Gate scoring.  
**Reviewed:** 2026-09-16

## Exact source

- Provider: World Bank
- Database: Quarterly Public Sector Debt (QPSD)
- World Bank Indicators API source ID: `3009`
- API: World Bank Indicators API v2
- Preferred discovery series: `DP.DOD.DECT.CR.GG.Z1`
- Exact label: `Gross PSD, General Gov., All maturities, All instruments, Nominal Value, % of GDP`
- Comparator series: `DP.DOD.DECT.CR.CG.Z1`
- Exact label: `Gross PSD, Central Gov., All maturities, All instruments, Nominal Value, % of GDP`

The audit uses the official World Bank API and records response hashes, latest reporting periods and country coverage. No portal scraping is used.

## Rights boundary

The World Bank dataset terms state that datasets are provided under CC BY 4.0 unless specifically labelled otherwise, subject to the World Bank's additional dataset terms. Commercial use is allowed by CC BY 4.0 with attribution. Before any production activation, Geomacro must retain evidence that the exact QPSD dataset/series is not marked with a different restriction and must preserve the required attribution in source governance.

This review does **not** transfer rights from World Bank-published data to unrelated third-party material and does not authorise raw source-payload resale. Paid Geomacro output remains derived structured intelligence with provenance.

Official references:

- `https://www.worldbank.org/ext/en/legal/terms-conditions/datasets`
- `https://datacatalog.worldbank.org/public-licenses`
- `https://datahelpdesk.worldbank.org/knowledgebase/articles/889392`
- `https://datahelpdesk.worldbank.org/knowledgebase/articles/898581`

## Methodology boundary

QPSD general-government and central-government debt are separate concepts. They must never be merged into the same raw-value or peer distribution merely to increase country coverage.

Production eligibility requires all of the following:

1. a deterministic adapter preserving QPSD series ID, government sector, valuation, unit, period and source timestamp;
2. exact-country mapping against Geomacro's authoritative sovereign registry;
3. a source-specific peer universe meeting the existing fixed peer minimum;
4. unchanged quality, freshness and confidence gates;
5. no cross-concept value pooling with WDI or Eurostat;
6. shadow scoring and change-attribution tests;
7. source-state and commercial-eligibility gating in production;
8. a full global country census after ingest;
9. `execution_authorized=false` preserved; and
10. no paid request becoming chargeable until every required module for that exact request passes final deliverability.

## Activation state

`production_activation_allowed=false`

The live coverage audit is evidence gathering only. A high country count alone is insufficient for activation.
