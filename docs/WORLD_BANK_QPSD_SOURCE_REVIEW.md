# World Bank QPSD source review

**Status:** rights-verified coverage candidate with deterministic source-specific shadow module. Not active for paid Risk Gate scoring.  
**Reviewed:** 2026-09-16

## Exact source

- Provider: World Bank
- Database: Quarterly Public Sector Debt (QPSD)
- Official production-discovery transport: DataBank QPSD bulk CSV archive
- Bulk archive: `https://databank.worldbank.org/data/download/QPSD_CSV.zip`
- World Bank Indicators API source ID (metadata/discovery reference): `3009`
- Preferred source-specific series: `DP.DOD.DECT.CR.GG.Z1`
- Exact label: `Gross PSD, General Gov., All maturities, All instruments, Nominal Value, % of GDP`
- Comparator source-specific series: `DP.DOD.DECT.CR.CG.Z1`
- Exact label: `Gross PSD, Central Gov., All maturities, All instruments, Nominal Value, % of GDP`

The governed coverage audit reads the official bulk CSV, verifies the exact file structure and labels, hashes the downloaded bytes, preserves quarterly periods and emits the fresh country rows for each concept. It performs no production writes.

## Rights boundary

The reviewed World Bank Data Catalog identifies the exact QPSD dataset as Public and licensed under CC BY 4.0, subject to the World Bank dataset terms and any dataset-specific third-party restrictions. Commercial adaptation requires attribution and preservation of exact-source provenance.

This review does **not** transfer rights from World Bank-published data to unrelated third-party material and does not authorise raw source-payload resale. Paid Geomacro output remains governed derived structured intelligence with provenance.

Official references:

- `https://datacatalog.worldbank.org/search/dataset/0037906/quarterly-public-sector-debt`
- `https://www.worldbank.org/ext/en/legal/terms-conditions/datasets`
- `https://datacatalog.worldbank.org/public-licenses`
- `https://datahelpdesk.worldbank.org/knowledgebase/articles/889392`
- `https://datahelpdesk.worldbank.org/knowledgebase/articles/898581`

## Methodology boundary

QPSD general-government and central-government debt are separate concepts. They must never be merged into the same raw-value or peer distribution merely to increase country coverage.

The repository now contains a deterministic source-proof-bound shadow builder for each QPSD concept. The builder requires the exact series ID, label, government sector, parser version, CC BY 4.0 dataset state, bulk-file SHA-256 and a source-specific peer universe with the unchanged fixed minimum of 20. It returns a `LIMITED` sovereign-fiscal module state for shadow evaluation only and cannot activate a production fallback by itself.

Production eligibility still requires all of the following:

1. wire audited QPSD country rows into deterministic normalization snapshots without cross-concept pooling;
2. exact-country mapping against Geomacro's authoritative sovereign registry;
3. separate general-government and central-government peer universes meeting the existing fixed peer minimum;
4. unchanged quality, freshness and confidence gates;
5. no cross-concept value pooling with WDI, Eurostat or another provider;
6. shadow scoring, change-attribution and replay tests against the current fiscal path;
7. source-state and commercial-eligibility gating in production;
8. a full production country census after ingest;
9. `execution_authorized=false` preserved; and
10. no paid request becoming chargeable until every required module for that exact request passes final deliverability.

## Activation state

`production_activation_allowed=false`

`shadow_module_implemented=true`

`country_payability_changed=false`

The live coverage audit is evidence gathering only. A high country count alone is insufficient for activation. Promotion requires the production census to identify the exact newly supported ISO3 set with no threshold relaxation.
