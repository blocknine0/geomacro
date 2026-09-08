# Commercial source-rights evidence register

**Status:** commercialization control document  
**Last reviewed:** 2026-09-08

This document records the evidence basis and runtime restrictions used when Geomacro marks an external source eligible for paid Risk API / Risk Gate delivery.

It is an engineering/commercialization control, not legal advice. Dataset terms can change and may contain item-specific exceptions. A source must be re-reviewed when its dataset, API contract, licence, access tier or intended delivery mode changes.

## Core rule

Public accessibility is **not** commercial permission.

A source may enter paid delivery only when all of the following are true:

1. the exact dataset/API asset is identified;
2. commercial or business reuse is permitted for the intended use;
3. attribution/reuse requirements are recorded;
4. raw redistribution restrictions are known;
5. the automated adapter is operationally verified;
6. observations retain enough provenance to identify the reviewed source contract;
7. no more restrictive item-specific term overrides the recorded policy.

Unknown or missing status fails closed.

```text
source discovered
      ↓
exact dataset identified
      ↓
rights + attribution reviewed
      ↓
adapter/provenance verified
      ↓
commercial signal enabled

Anything unresolved -> UNVERIFIED / REVIEW_REQUIRED / disabled
```

## Current automated commercial-signal sources

Migration `025_external_source_operational_status.sql` currently enables automated commercial signals only for:

- `world_bank_indicators`
- `unhcr_refugee_statistics`
- `usgs_mcs`

That operational enablement is separate from the source-rights evidence below.

---

## 1. World Bank Indicators / World Development Indicators

**Geomacro source id:** `world_bank_indicators`  
**Exact API source:** World Development Indicators, World Bank API source `2`  
**Current adapter:** `scripts/ingest-world-bank-live.mjs`  
**Commercial status:** `VERIFIED` for the explicitly pinned WDI adapter only

### Evidence basis

World Bank Dataset Terms state that World Bank-produced open data are made available under Creative Commons Attribution 4.0 unless another licence is specified for a particular dataset. The World Bank Indicators API also supports selecting a specific data source, and World Development Indicators is source `2`.

References:

- World Bank Dataset Terms: https://www.worldbank.org/ext/en/legal/terms-conditions/datasets
- World Bank Indicators API: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392-about-the-indicators-api-documentation
- World Development Indicators catalogue: https://datacatalog.worldbank.org/search/dataset/0037712/World-Development-Indicators

### Geomacro control

The live adapter must pin every indicator query to:

```text
source=2
```

Each normalized observation retains:

- dataset name;
- World Bank API source id;
- indicator id/name;
- source URL;
- licence label;
- dataset-terms reference;
- retrieval timestamp.

Do **not** generalize WDI approval to Data360 or another World Bank dataset. Those require their own dataset-level metadata/licence review.

---

## 2. UNHCR Refugee Population Statistics

**Geomacro source id:** `unhcr_refugee_statistics`  
**Dataset:** UNHCR Refugee Population Statistics Database  
**Current adapter:** `scripts/ingest-unhcr-live.mjs`  
**Commercial status:** `VERIFIED`, subject to dataset-level exceptions described by UNHCR

### Evidence basis

UNHCR's Refugee Data Finder methodology states that, except where otherwise indicated, datasets made available in the UNHCR Refugee Population Statistics Database are licensed under Creative Commons Attribution 4.0 International.

References:

- UNHCR methodology and data terms: https://www.unhcr.org/refugee-statistics/methodology
- UNHCR data content/structure: https://www.unhcr.org/refugee-statistics/methodology/data-content

### Geomacro control

The adapter produces country-level derived aggregates and retains dataset, year, aggregation and licence provenance.

Important limitation: UNHCR documentation notes that the wider Refugee Data Finder can contain data originating from other organizations. Dataset/item-specific exceptions must therefore override the default licence where indicated. If a future adapter begins ingesting a separately governed third-party dataset, that dataset requires its own source id and rights review rather than inheriting this status.

---

## 3. USGS Mineral Commodity Summaries 2026 data release

**Geomacro source id:** `usgs_mcs`  
**Dataset:** Mineral Commodity Summaries 2026 data release  
**DOI:** `10.5066/P1WKQ63T`  
**Current adapter:** `scripts/ingest-usgs-mcs-live.mjs`  
**Commercial status:** `VERIFIED` for the identified USGS data release

### Evidence basis

The USGS Science Data Catalog identifies the MCS 2026 data release as public access and lists the licence as the U.S. Government public-domain label. The associated MCS report also states that the USGS report is in the public domain, while noting that separately copyrighted material can require permission.

References:

- USGS MCS 2026 data catalogue: https://data.usgs.gov/datacatalog/data/USGS%3A69837e43b66b01367d7ec7c7
- MCS 2026 publication: https://pubs.usgs.gov/publication/mcs2026
- U.S. Government public-domain label: https://www.usa.gov/government-copyright

### Geomacro control

The automated adapter uses the identified ScienceBase data-release asset and stores release/file provenance. Future USGS material must not inherit this approval merely because it is hosted on a USGS domain; third-party/copyright notices remain item-specific.

---

## Commercially reusable but operationally disabled

Commercial reuse permission and ingestion readiness are different controls.

### IEA Critical Minerals Dataset

The IEA Critical Minerals Dataset page identifies the dataset as CC BY 4.0, but the current automated access path is disabled because the direct adapter path returned HTTP 403 during operational testing.

- Source id: `iea_critical_minerals`
- Rights state: recorded as commercially reusable for the identified dataset
- Operational state: disabled
- Commercial-signal state: disabled
- Reference: https://www.iea.org/data-and-statistics/data-product/critical-minerals-dataset

Do not enable paid delivery until a stable permitted machine-readable access path is implemented and provenance is preserved.

### JRC / European Commission supply-chain dataset

Specific European Commission/JRC data assets can be reusable under the Commission reuse notice or an item-specific open licence, but the current automated source is disabled until a stable machine-readable asset is explicitly identified and mapped.

- Source id: `jrc_rmis_supply_chain`
- Operational state: disabled
- Commercial-signal state: disabled
- Reference: https://data.jrc.ec.europa.eu/

---

## Review-required / restricted sources

The following examples remain intentionally outside automated paid Risk Gate/Risk API delivery unless their exact terms and access model are cleared:

- GDELT: `REVIEW_REQUIRED`
- UN Comtrade: `DERIVED_ONLY`, exact API tier/terms required
- British Geological Survey World Mineral Statistics: `PERMISSION_REQUIRED`
- WTO Timeseries: `REVIEW_REQUIRED`
- IMF data: `REVIEW_REQUIRED`
- ReliefWeb: `REVIEW_REQUIRED`
- GDACS: `REVIEW_REQUIRED`
- ACLED: `PERMISSION_REQUIRED`
- OECD: `REVIEW_REQUIRED`
- BIS: `REVIEW_REQUIRED`
- FAOSTAT: `REVIEW_REQUIRED`
- umbrella RMIS source: `REVIEW_REQUIRED`

Registration in `live_external_sources` is not approval.

---

## Required provenance for a VERIFIED observation

A commercially verified observation should preserve, as applicable:

```text
source_id
exact dataset/release identity
source_record_id
source URL/API request
provider
licence or rights basis
licence/terms reference
retrieval timestamp
raw hash
normalized hash
quality status
commercial eligibility status
```

Where a dataset has version/DOI/source identifiers, preserve them.

## Runtime enforcement

Commercial eligibility must be checked before a source can influence a commercial Risk Object.

Current country-risk commercial paths query observations with:

```text
quality_status = VERIFIED
commercial_eligibility_status = VERIFIED
```

Risk Gate policy can additionally require the resulting Risk Object itself to carry commercial eligibility `VERIFIED` before `CONTINUE` is possible.

The shared observation builder must default omitted commercial status to `UNVERIFIED`, never `VERIFIED`.

## Change-control rule

A source must be re-reviewed before commercial use when any of the following changes:

- dataset/release;
- provider;
- API source/catalogue;
- access tier;
- licence/terms;
- raw redistribution behavior;
- customer-facing evidence behavior;
- machine-readable redistribution/delivery;
- adapter begins consuming third-party material not covered by the recorded policy.

No code change, payment rail or customer request can override a more restrictive source licence.
