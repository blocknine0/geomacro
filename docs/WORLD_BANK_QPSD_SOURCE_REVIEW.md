# World Bank QPSD source review

**Status:** governed production-promotion candidate. Not active for paid Risk Gate scoring until migration, ingest and global census gates pass.  
**Reviewed:** 2026-09-16

## Exact source

- Geomacro adapter source ID: `world_bank_qpsd`
- Provider: World Bank
- Database: Quarterly Public Sector Debt (QPSD)
- DataBank source ID: `3009`
- Data Catalog dataset: `0037906`
- Production transport: official World Bank DataBank bulk CSV
- Bulk contract: `https://databank.worldbank.org/data/download/QPSD_CSV.zip`
- Preferred series: `DP.DOD.DECT.CR.GG.Z1`
- Exact label: `Gross PSD, General Gov., All maturities, All instruments, Nominal Value, % of GDP`
- Secondary source-specific series: `DP.DOD.DECT.CR.CG.Z1`
- Exact label: `Gross PSD, Central Gov., All maturities, All instruments, Nominal Value, % of GDP`

The production adapter uses the official World Bank bulk dataset, records the bulk-file SHA-256, exact series ID and label, government sector, period, parser version and source provenance. It does not scrape the DataBank portal.

## Rights boundary

The World Bank Data Catalog identifies QPSD as a public dataset under CC BY 4.0, subject to the World Bank's additional dataset terms. The Geomacro commercial source-rights manifest therefore permits the exact QPSD dataset contract for derived commercial intelligence with attribution/provenance.

This approval is deliberately dataset-specific. It does **not** transfer rights from World Bank-published QPSD data to unrelated third-party material and does not authorise blanket raw bulk-file resale. Customer delivery remains Geomacro-derived sovereign-fiscal intelligence with QPSD provenance and attribution.

Official references:

- `https://datacatalog.worldbank.org/search/dataset/0037906/quarterly-public-sector-debt`
- `https://datacatalog.worldbank.org/public-licenses`
- `https://www.worldbank.org/ext/en/legal/terms-conditions/datasets`

## Methodology boundary

QPSD general-government and central-government debt are separate source concepts. They are never merged into one raw-value set or one peer distribution merely to increase country coverage. The production fallback tries them independently, with general government preferred before central government.

Production eligibility requires all of the following:

1. deterministic parsing preserving QPSD series ID, exact label, government sector, unit, period and file hash;
2. exact-country mapping against Geomacro's enabled sovereign registry;
3. an independent source-specific peer universe meeting the fixed minimum of 20 comparable countries;
4. freshness, quality and confidence gates unchanged;
5. no raw-value or peer-universe pooling with WDI, Eurostat or PPG;
6. `quality_status=VERIFIED` and `commercial_eligibility_status=VERIFIED` on accepted observations;
7. a clean QPSD release manifest with write completion and provenance checks;
8. source registration in `live_external_sources` with commercial and ingestion gates enabled;
9. a full global production country census after ingest;
10. `execution_authorized=false` preserved; and
11. no paid request becoming chargeable until every required module for that exact request passes final deliverability.

## Production precedence

For sovereign-fiscal coverage, Geomacro keeps the following source-specific order:

1. World Bank WDI central-government debt, where the existing primary method is available;
2. Eurostat general-government debt, where its governed production release is available;
3. World Bank QPSD general-government debt, then QPSD central-government debt, each using its own peer universe;
4. World Bank PPG external-debt-stock pressure, where the clean PPG/GNI production manifest is available.

These are fallback methodologies, not a combined debt dataset.

## Activation state

`production_activation_allowed=false` until the production migration is applied, the governed QPSD ingest succeeds, and the exact-main global country census passes the >=100 accepted-country gate with all fail-closed assertions intact.

The presence of a QPSD observation alone does not make a country supported or payable. The authoritative support number comes only from the full production Risk Gate census.
