# Commercial source-rights evidence register

**Status:** commercialization control document  
**Last reviewed:** 2026-09-16

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

## Current source-policy states

| Source ID | Dataset / product | Current engineering status | Commercial delivery rule |
|---|---|---:|---|
| `world_bank_indicators` | World Development Indicators, World Bank source `2` | `VERIFIED` | Permitted only for the exact pinned WDI contract with attribution and provenance retained |
| `world_bank_qpsd` | World Bank Quarterly Public Sector Debt (QPSD), DataBank source `3009` | `VERIFIED` | Exact QPSD dataset only. Derived sovereign-fiscal intelligence may be delivered with source attribution/provenance. General-government and central-government concepts remain separate; raw bulk redistribution is disabled |
| `world_bank_wgi_political_stability` | Worldwide Governance Indicators, 2025 Revision | `VERIFIED` | Permitted for the WGI dataset itself under its recorded CC BY 4.0 terms; underlying third-party source material does not inherit this status |
| `unhcr_refugee_statistics` | UNHCR Refugee Population Statistics Database | `VERIFIED` | Permitted for normalized/derived use under the dataset-specific CC BY 4.0 terms with required UNHCR attribution |
| `ucdp_ged` | UCDP Georeferenced Event Dataset | `VERIFIED` | Permitted for the exact current UCDP dataset/version under CC BY 4.0 with required scholarly/dataset citations retained in policy evidence |
| `usgs_mcs` | U.S. Geological Survey Mineral Commodity Summaries | `VERIFIED` | USGS-produced data/information may be used, with USGS credited; non-USGS copyrighted material must never inherit this status |
| `ucdp_candidate` | UCDP Candidate Events Dataset, current monthly release family | `VERIFIED` | Current UCDP datasets are CC BY 4.0 with required dataset/publication citations; approval is limited to the official Candidate dataset/download/API family |
| `gdelt_v2_events` | GDELT 2.0 Event Database | `VERIFIED` | GDELT explicitly permits unlimited academic, commercial and governmental dataset use and redistribution with GDELT citation; underlying publisher article text/media is excluded |
| `eurostat_government_finance` | Eurostat quarterly government debt `gov_10q_ggdebt` | `VERIFIED` | Commercial reuse is authorised with source acknowledgement under Eurostat/European Commission reuse rules, subject to dataset-specific and third-party exceptions |
| `usgs_earthquake_hazards` | USGS Earthquake Hazards GeoJSON feeds/catalog | `VERIFIED` | USGS-produced earthquake data may be used with source credit; non-USGS copyrighted site material/media does not inherit this status |
| `ucdp_dyadic` | UCDP Dyadic Dataset | `UNVERIFIED` / `REVIEW_REQUIRED` in current adapter path | Excluded from paid delivery until this specific adapter/access path is deliberately promoted after review |
| sanctions evidence | OFAC / UNSC program evidence | `UNVERIFIED` / `REVIEW_REQUIRED` | Excluded from paid delivery; no raw customer redistribution |
| ReliefWeb structured observations | ReliefWeb / OCHA-derived event evidence | `DERIVED_ONLY` where explicitly marked | Derived intelligence only; raw source payload/redistribution remains outside commercial delivery |

`VERIFIED` in this document means the specific Geomacro adapter/dataset contract has evidence supporting the current engineering eligibility decision. It does **not** mean every page, API, document, image, upstream third-party input, or future version from the same organization is commercially cleared.

The machine-readable runtime evidence register is `scripts/commercial-source-rights-evidence.mjs`. `scripts/commercial-source-policy.mjs` derives its non-default commercial approvals from that register, and regression coverage requires every runtime `VERIFIED` source to be represented here.

## Evidence-backed reviewed controls

### World Bank World Development Indicators

- Adapter source ID: `world_bank_indicators`
- Exact API source: World Bank source `2`
- Dataset: World Development Indicators (WDI)
- Recorded licence label: `CC BY 4.0`
- Official licensing reference: `https://datacatalog.worldbank.org/public-licenses`
- Dataset terms reference: `https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets`
- Official World Bank licensing guidance states that CC BY 4.0 permits copying, modification and distribution for any purpose, including commercial use, subject to attribution and the applicable additional terms.
- Runtime rule: every API request is pinned with `source=2`.
- Provenance rule: normalized observations retain dataset name, API source ID, indicator ID/name, country, licence label, terms reference and retrieval time.
- Identity rule: normalized `source_record_id` includes the World Bank API source ID so another catalogue cannot silently inherit WDI rights state.
- Current engineering eligibility: explicit `VERIFIED` only for the pinned WDI adapter contract above.

A different World Bank catalogue, endpoint, licensed third-party dataset or product must not inherit this status automatically.

### World Bank Quarterly Public Sector Debt (QPSD)

- Adapter source ID: `world_bank_qpsd`
- Exact dataset: Quarterly Public Sector Debt (QPSD), World Bank DataBank source `3009`, Data Catalog dataset `0037906`.
- Official catalogue reference: `https://datacatalog.worldbank.org/search/dataset/0037906/quarterly-public-sector-debt`.
- Recorded dataset classification: Public.
- Recorded licence: `CC BY 4.0`, subject to the World Bank's applicable dataset additional terms and attribution requirements.
- Production series are limited to `DP.DOD.DECT.CR.GG.Z1` (general-government gross debt, nominal value, percent of GDP) and `DP.DOD.DECT.CR.CG.Z1` (central-government gross debt, nominal value, percent of GDP).
- General-government and central-government debt remain separate source-specific concepts and peer universes. Geomacro does not average, pool or relabel them merely to increase country coverage.
- QPSD values are not pooled with WDI or Eurostat raw debt values. The production fallback hierarchy selects at most one independently validated sovereign-fiscal module state for a country.
- Normalized observations retain the exact series ID, label, government sector, quarter, bulk-file hash, parser version, licence, retrieval time and country mapping.
- Raw QPSD bulk redistribution is disabled in the Geomacro customer contract. Commercial customer delivery is Geomacro-derived sovereign-fiscal intelligence with permitted provenance and attribution.
- Current engineering eligibility is `VERIFIED` for the exact QPSD dataset contract above. Actual production scoring remains separately gated by source operational state, a clean release manifest, the fixed comparable-peer minimum, freshness, full required-module country readiness and the protected global production census.
- QPSD rights approval does not by itself make a country payable or activate a payment rail.

A different World Bank debt database, catalogue, third-party field or licensed product must not inherit this QPSD status automatically.

### World Bank Worldwide Governance Indicators

- Adapter source ID: `world_bank_wgi_political_stability`
- Dataset: Worldwide Governance Indicators (WGI), 2025 Revision
- Current Geomacro metric: political-stability absolute score
- Official catalogue reference: `https://datacatalog.worldbank.org/search/dataset/0038026/worldwide-governance-indicators`
- Official catalogue classification: Public
- Official dataset licence: Creative Commons Attribution 4.0
- The World Bank Data indicator surface for the WGI political-stability governance score also labels the indicator `CC BY-4.0`.
- Current engineering eligibility: `VERIFIED` for the World Bank-published WGI output used by this adapter.
- Critical boundary: WGI methodology can incorporate underlying third-party perception sources. Geomacro's `VERIFIED` status applies to the World Bank WGI dataset/output distributed under the recorded licence. It does not grant redistribution rights to any separately identifiable upstream proprietary source material.
- Current methodology status remains `EVIDENCE_ONLY_NOT_IN_GRO_V02` unless separately promoted through a versioned risk methodology change.

### UNHCR Refugee Population Statistics

- Adapter source ID: `unhcr_refugee_statistics`
- Exact API family: `https://api.unhcr.org/population/v1/`
- API documentation: `https://api.unhcr.org/docs/refugee-statistics.html`
- Dataset: UNHCR Refugee Population Statistics Database
- Dataset-specific terms reference: `https://www.unhcr.org/asia/terms-use-datasets`
- Dataset-specific terms state that, except where otherwise provided, datasets in the Refugee Population Statistics Database are licensed under Creative Commons Attribution 4.0.
- Dataset-specific terms require attribution in the form `UNHCR Refugee Population Statistics Database`.
- Important distinction: the general `unhcr.org` website terms include broader non-commercial restrictions for website content. The dataset-specific terms govern the Refugee Population Statistics datasets and prevail where they conflict with the general website terms.
- Current adapter stores Geomacro origin-country aggregates and preserves internal provenance rather than exposing the raw API payload as the commercial product.
- Current engineering eligibility: `VERIFIED` for the Refugee Population Statistics dataset/API path above, subject to attribution and any dataset-specific exceptions/footnotes.

A UNHCR webpage, publication, image, narrative article or another UNHCR database must not inherit this dataset status automatically.

### UCDP Georeferenced Event Dataset (GED)

- Adapter source ID: `ucdp_ged`
- Dataset: UCDP Georeferenced Event Dataset (GED)
- Official download centre: `https://ucdp.uu.se/downloads/`
- Current download centre states that current UCDP datasets are free of charge and licensed under `CC BY 4.0`, with use/redistribution allowed provided the relevant listed publications are cited.
- The current download centre lists GED Global version `26.1` and provides its dataset-specific citation references.
- Current adapter contract records dataset version, transport, licence, retrieval time and event-level provenance.
- Current engineering eligibility: `VERIFIED` for the exact UCDP GED dataset/version distributed under the recorded CC BY 4.0 terms.
- Required boundary: citation obligations and dataset/version provenance must remain recoverable in the source-policy evidence package even when customer delivery contains only derived Geomacro risk intelligence.

This status does not automatically apply to replication datasets, third-party-linked resources, article text, maps, graphics or a future UCDP product with different terms.

### UCDP Dyadic / interstate-tension evidence

- Adapter source ID: `ucdp_dyadic`
- Dataset contract is retained with dataset/version provenance.
- UCDP's current download centre identifies current UCDP datasets, including the Dyadic Dataset, as CC BY 4.0 with citation requirements.
- However, the current Geomacro dyadic adapter deliberately remains `REVIEW_REQUIRED` / persisted `UNVERIFIED` because the exact automated transport/access and promotion decision have not been closed as a commercial production contract.
- It must not enter paid delivery until this specific adapter's source-policy review is explicitly closed.

This is intentional fail-closed separation between **dataset rights evidence** and **adapter commercial readiness**.

### USGS Mineral Commodity Summaries

- Adapter source ID: `usgs_mcs`
- Dataset/product: U.S. Geological Survey Mineral Commodity Summaries (MCS)
- Current adapter discovers the source CSV through USGS ScienceBase metadata and restricts observations to the configured critical-mineral domain.
- Official MCS publication reference: `https://pubs.usgs.gov/publication/mcs2026`
- Official USGS copyright/credits reference: `https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits`
- USGS states that USGS-authored or produced data and information are considered to be in the U.S. public domain and can be freely used without permission, with source credit requested.
- Current engineering eligibility: `VERIFIED` for USGS-produced MCS data used by the adapter.
- Critical boundary: non-USGS photographs, illustrations, graphics or other copyrighted third-party content appearing on USGS properties must not inherit the public-domain/`VERIFIED` status.
- Customer-facing use should credit the U.S. Geological Survey in evidence/provenance where applicable.

### UCDP Candidate Events Dataset

- Adapter source ID: `ucdp_candidate`
- Exact product: UCDP Candidate Events Dataset, current monthly release family; the current adapter default is aligned to the official current release family.
- Official rights/download reference: `https://ucdp.uu.se/downloads/`
- UCDP states that all current datasets on the download centre are free of charge and licensed under CC BY 4.0, with reuse and redistribution permitted provided the relevant listed publications are cited.
- The same download centre explicitly lists the UCDP Candidate Events Dataset and its current monthly releases.
- Current engineering eligibility: `VERIFIED` for the official Candidate dataset/download/API family, with release/version and citation provenance retained.
- Boundary: linked publications, graphics, third-party resources or another UCDP product with different terms do not inherit this status automatically.

### GDELT 2.0 Event Database

- Adapter source ID: `gdelt_v2_events`
- Exact product: GDELT 2.0 Event Database, consumed from the official 15-minute release path under `https://data.gdeltproject.org/gdeltv2/`.
- Official terms reference: `https://gdeltproject.org/about.html`
- GDELT states that its released datasets are available for unlimited and unrestricted academic, commercial or governmental use without fee, and permits redistribution/rehosting/republishing/mirroring with GDELT citation and a link to the project.
- Current engineering eligibility: `VERIFIED` for GDELT-released event metadata used by the adapter.
- Critical boundary: GDELT dataset permission does not grant Geomacro a separate right to republish underlying publisher article text, photographs, video or other publisher-owned media. Customer delivery should remain GDELT event metadata/provenance plus Geomacro-derived intelligence.

### Eurostat quarterly government debt

- Adapter source ID: `eurostat_government_finance`
- Exact dataset code: `gov_10q_ggdebt` (Quarterly government debt).
- Official dataset metadata: `https://ec.europa.eu/eurostat/cache/metadata/en/gov_10q_ggdebt_esms.htm`
- Official reuse reference: `https://ec.europa.eu/eurostat/help/copyright-notice`
- Eurostat identifies itself as the compiling agency for this dataset. Its current reuse notice authorises reuse of statistical data for commercial and non-commercial purposes with source acknowledgement, subject to dataset-specific notices and listed third-party exceptions.
- Current engineering eligibility: `VERIFIED` for the exact Eurostat `gov_10q_ggdebt` statistical dataset used by the adapter.
- Customer delivery must retain Eurostat dataset citation/access-date provenance. Third-party-owned content, logos/trademarks and any individually stated exception remain excluded.

### USGS Earthquake Hazards feeds/catalog

- Adapter source ID: `usgs_earthquake_hazards`
- Exact adapter feed: official USGS Earthquake Hazards GeoJSON summary feed, including `all_day.geojson`.
- Official feed reference: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php`
- Official rights reference: `https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits`
- USGS documents the GeoJSON summary feeds as official earthquake feeds updated every minute. USGS states that USGS-authored or produced data and information are considered to be in the U.S. public domain and may be used, with source credit requested.
- Current engineering eligibility: `VERIFIED` for USGS-produced earthquake feed/catalog event data consumed by the adapter.
- Critical boundary: non-USGS photographs, illustrations, graphics, multimedia or other third-party copyrighted material on USGS properties must not inherit this status. Customer delivery remains derived hazard evidence plus USGS provenance/credit.

### OFAC / UNSC sanctions-coercion evidence

- Source-policy state remains `REVIEW_REQUIRED`.
- Raw customer redistribution remains disabled.
- Persisted observation eligibility is `UNVERIFIED`.
- Review-gated sanctions evidence must remain outside commercial structural output until the governing source registry/view explicitly permits it.
- A source being an official government or intergovernmental publication is not, by itself, enough to promote it to commercial `VERIFIED` in Geomacro.

### ReliefWeb / OCHA-derived evidence

- Current adapter paths that explicitly mark commercial eligibility `DERIVED_ONLY` may contribute only through the allowed derived-intelligence boundary.
- Raw source payload, source-document republication and unrestricted redistribution are not implied by `DERIVED_ONLY`.
- Customer-facing serialization must continue stripping raw/internal payload fields and expose only permitted Geomacro-derived intelligence plus allowed citation/provenance fields.

## Shared observation-builder safety

`scripts/lib-live-source-utils.mjs` defaults `commercialEligibilityStatus` to `UNVERIFIED`.

A new adapter therefore cannot silently become commercially eligible simply because its author omitted the field. An adapter must supply `VERIFIED` or another reviewed DB-valid status explicitly.

## Promotion rule for `VERIFIED`

A source/adapter may be promoted to `VERIFIED` only when the review evidence records all of the following:

- exact organization and dataset/product name;
- exact dataset/version or stable API contract;
- official terms/licence URL;
- commercial/derived use conclusion;
- attribution requirement;
- raw redistribution rule;
- material third-party-content exception, if any;
- Geomacro adapter/source ID;
- provenance fields retained;
- customer delivery mode;
- review date.

A code comment, public URL, free download, working API call or `quality_status=VERIFIED` is **not** sufficient evidence for commercial eligibility.

## Separate questions: rights vs operational readiness

A licence review does not prove the ingestion is production-ready, and a working ingestion does not prove commercial rights. Track these separately:

- source/dataset rights;
- provenance completeness;
- commercial eligibility state;
- adapter operational validation;
- data freshness/coverage;
- derived-only/raw-redistribution restrictions;
- customer delivery mode.

`quality_status=VERIFIED` and `commercial_eligibility_status=VERIFIED` answer different questions and must never be treated as aliases.

## Structural historical warehouse boundary

The main product may consume structural geopolitical history only through the historical warehouse view:

`commercial_structural_geopolitical_observations`

It must never use the private raw `structural_geopolitical_observations` table as a commercial interface. Structural rows remain evidence context and are labelled `EVIDENCE_ONLY_NOT_IN_GRI_V1_2` unless a future separately versioned and validated scoring methodology explicitly changes that boundary.

## Customer-delivery boundary

Commercial machine delivery must expose only fields allowed by the relevant source-policy state and Geomacro product contract.

At minimum:

- `VERIFIED` sources may support derived commercial intelligence subject to their recorded attribution/reuse conditions;
- `DERIVED_ONLY` sources may support permitted derived outputs but not raw payload redistribution;
- `UNVERIFIED`, `REVIEW_REQUIRED`, restricted, token-gated or unresolved sources must fail closed and remain outside paid machine delivery;
- internal raw payloads, service-role access and private warehouse tables are never customer-facing source interfaces.

## Re-review triggers

Re-open a source review whenever any of these change:

- dataset version or provider;
- API endpoint/access tier;
- licence/terms URL or wording;
- attribution/citation requirement;
- redistribution policy;
- use of new third-party fields/content;
- raw-vs-derived delivery mode;
- customer product surface;
- Geomacro methodology role.

## Current limitation

This register is not a claim that every source used anywhere inside Geomacro has completed final commercial-rights diligence. Sources that remain `UNVERIFIED`, `REVIEW_REQUIRED`, restricted, experimental, research-only, or technically unvalidated must stay outside paid delivery until their specific review gate is closed.

This register is an engineering commercialization control and evidence record, not a substitute for formal legal review where a source or customer contract requires one.