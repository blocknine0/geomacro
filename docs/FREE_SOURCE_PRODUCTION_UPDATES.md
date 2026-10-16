# Free source production update collection

The existing free-source workflow now targets 30-minute feed polls and daily reference snapshots. GitHub schedules can be delayed. This is private source-change collection, not a real-time customer delivery SLA or signed intelligence publication.

The original 19 readers below use one bounded request when due, four concurrent workers, and at most 40 records per source. Three category checkpoints in the existing control-plane D1 keep only hashes and coarse clocks/status; each source retains at most 96 hashes. All three writes must round-trip exactly. First successful observation establishes a baseline, including recovery after initial denial; it never counts as a new update. A same-slot rerun makes no upstream requests. Healthy reads use UTC half-hour/day slots so a few seconds of cron start jitter cannot silently double the feed interval; denial backoffs still use full elapsed time. After 401/403/429 the source is backed off at least six hours, with no alternate credential or host. Other sources continue collecting.

Only explicit originating feed publication clocks can contribute to the native publication count. Feed updated clocks, date-only fields, reference periods, dataset versions and fetch times cannot become original publication. Full sanctions XML is a byte-version observation, not a new designation count. Annual USGS MCS HTML remains context only. DOE and other broad feeds are not automatically classified as minerals or conflict events. Hash changes are observations and can include source corrections. Changes older than the bounded fingerprint window can be observed again; this is not an unbounded event store.

Production requires protected main and the existing Cloudflare checkpoint credentials. No schema migration, raw publisher storage, customer source disclosure, B2 request, Supabase request, payment, signing or automatic commercial eligibility is introduced. A source-free aggregate receipt is retained for three days. Operator logs contain only pinned source IDs and coarse outcome/status. Retained degraded sources keep the workflow degraded even while their next attempt is not due.

## Complete family accounting

Registry entries and access classifications are inventory, not evidence that all 67 families are live. The table separates this update reader from existing collection lanes and unresolved access/connector work. Existing lanes are not re-certified by this change. No credentialed, registration-only, terms-review or quarantined source is force-enabled.

| Category | Family | Access | Collection / remaining dependency |
| --- | --- | --- | --- |
| geopolitics | gdelt_events | NO_KEY | Existing GDELT lane; publication still requires evidence |
| geopolitics | ucdp_ged | OPEN_DATA | OPEN_DATA: source-specific access and dataset/rights connector required |
| geopolitics | nasa_firms | FREE_KEY | FREE_KEY: source-specific access and dataset/rights connector required |
| geopolitics | usgs_earthquakes | NO_KEY | 30-minute bounded reader |
| geopolitics | noaa_nhc | NO_KEY | 30-minute bounded reader |
| geopolitics | copernicus_sentinel | REGISTRATION | REGISTRATION: source-specific access and dataset/rights connector required |
| geopolitics | state_dept_advisories | NO_KEY | Official advisory endpoints unavailable in direct test |
| geopolitics | marad_advisories | NO_KEY | Official index reachable; no validated update parser in this lane |
| geopolitics | cisa_kev | NO_KEY | 30-minute bounded reader |
| geopolitics | uk_fcdo_advisories | NO_KEY | 30-minute bounded reader |
| geopolitics | abuse_ch | DATASET_REVIEW | DATASET_REVIEW: source-specific access and dataset/rights connector required |
| geopolitics | unhcr_refugee_statistics | NO_KEY | Official API unavailable in direct test |
| geopolitics | ocha_hdx_hapi | DATASET_REVIEW | DATASET_REVIEW: source-specific access and dataset/rights connector required |
| geopolitics | wikimedia_pageviews | NO_KEY | 1440-minute bounded reader |
| geopolitics | wikimedia_eventstreams | STREAM_ACCESS | STREAM_ACCESS: source-specific access and dataset/rights connector required |
| geopolitics | ofac_sdn | NO_KEY | Official full-list endpoint unavailable; RSS retired by publisher |
| geopolitics | un_security_council_sanctions | NO_KEY | 1440-minute bounded reader |
| geopolitics | eu_consolidated_sanctions | DATASET_REVIEW | Existing daily P0 parsed dataset lane |
| geopolitics | uk_ofsi_sanctions | NO_KEY | Existing daily P0 parsed dataset lane |
| geopolitics | federal_register | NO_KEY | 30-minute bounded reader |
| geopolitics | us_bis_export_controls | NO_KEY | 30-minute bounded reader |
| geopolitics | eur_lex | NO_KEY | Daily endpoint returned empty HTTP 202 |
| macro | bls | NO_KEY | 1440-minute bounded reader |
| macro | bea | FREE_KEY | Existing credentialed runtime |
| macro | census | NO_KEY | Endpoint redirected to missing-key page; access required |
| macro | treasury_fiscaldata | NO_KEY | 1440-minute bounded reader |
| macro | treasury_tic | DATASET_REVIEW | DATASET_REVIEW: source-specific access and dataset/rights connector required |
| macro | treasury_yield_curve | NO_KEY | Attempted official endpoint returned 404 |
| macro | ofr_financial_stress | NO_KEY | Attempted API query returned 400; connector repair required |
| macro | eia | FREE_KEY | Existing credentialed runtime |
| macro | cftc_cot | NO_KEY | Attempted official data endpoint unavailable |
| macro | sec_edgar | NO_KEY | Existing public adapter; current update extraction not added |
| macro | federal_reserve | NO_KEY | 30-minute bounded reader |
| macro | ny_fed | NO_KEY | 1440-minute bounded reader |
| macro | world_bank_wdi | NO_KEY | 1440-minute bounded reader |
| macro | world_bank_pink_sheet | DATASET_REVIEW | Existing daily P0 XLSX transport; not parsed updates |
| macro | oecd | NO_KEY | Existing public adapter; metadata is not new statistical observations |
| macro | eurostat | NO_KEY | Existing public adapter and official release review |
| macro | eurostat_comext | DATASET_REVIEW | DATASET_REVIEW: source-specific access and dataset/rights connector required |
| macro | ecb_data_portal | NO_KEY | Existing public adapter; historical sample is not real-time |
| macro | ecb_fx | NO_KEY | 1440-minute bounded reader |
| macro | ons | NO_KEY | 30-minute bounded reader |
| macro | abs | NO_KEY | Attempted RSS returned 404; current API connector required |
| macro | statcan | NO_KEY | Existing private alternate review; general feed attempt unavailable |
| macro | destatis | NO_KEY | Attempted RSS returned 404 |
| macro | japan_estat | REGISTRATION | REGISTRATION: source-specific access and dataset/rights connector required |
| macro | entsoe | FREE_KEY | FREE_KEY: source-specific access and dataset/rights connector required |
| macro | entsog | DATASET_REVIEW | DATASET_REVIEW: source-specific access and dataset/rights connector required |
| macro | ember | DATASET_REVIEW | DATASET_REVIEW: source-specific access and dataset/rights connector required |
| macro | aemo | DATASET_REVIEW | DATASET_REVIEW: source-specific access and dataset/rights connector required |
| macro | caiso | DATASET_REVIEW | DATASET_REVIEW: source-specific access and dataset/rights connector required |
| macro | ercot | DATASET_REVIEW | DATASET_REVIEW: source-specific access and dataset/rights connector required |
| macro | defillama | TERMS_REVIEW | TERMS_REVIEW: source-specific access and dataset/rights connector required |
| macro | pyth_hermes | TERMS_REVIEW | TERMS_REVIEW: source-specific access and dataset/rights connector required |
| macro | chainlink_onchain | TERMS_REVIEW | TERMS_REVIEW: source-specific access and dataset/rights connector required |
| macro | circle_usdc_transparency | DATASET_REVIEW | DATASET_REVIEW: source-specific access and dataset/rights connector required |
| rare_earth | usgs_mcs | NO_KEY | 1440-minute bounded reader (context only) |
| rare_earth | usitc_dataweb | REGISTRATION | REGISTRATION: source-specific access and dataset/rights connector required |
| rare_earth | usaspending | NO_KEY | Validated record connector required |
| rare_earth | sam_gov | FREE_KEY | FREE_KEY: source-specific access and dataset/rights connector required |
| rare_earth | geoscience_australia | NO_KEY | Attempted RSS returned 404 |
| rare_earth | nrcan | NO_KEY | 30-minute bounded reader |
| rare_earth | bgs_world_minerals | DATASET_REVIEW | Existing public adapter; annual dataset |
| rare_earth | us_doe | NO_KEY | 30-minute bounded reader |
| rare_earth | us_dod | NO_KEY | Official RSS denied HTTP 403 |
| rare_earth | eu_crma | NO_KEY | Validated record connector required |
| rare_earth | uk_desnz | NO_KEY | 30-minute bounded reader |

## Verification

Run `node --test scripts/tests/operator-commercial-free-source-lineup.test.mjs scripts/tests/free-source-production-updates.test.mjs scripts/tests/global-official-release-feeds.test.mjs`. The protected production workflow executes `node scripts/ops/probe-commercial-free-source-lineup.mjs --production-updates` after resolving the existing D1 database. Exit 3 means at least one retained reader is degraded; exit 2 means the protected/state operation failed closed. A successful feed read alone never clears the separate signed-publication or category-certification gates.

## UN distribution recovery

The official UN XML endpoint now redirects to a short-lived, anonymous Azure download. Only the exact observed `unsolprodfiles.blob.core.windows.net/publiclegacyxmlfiles/EN/consolidatedLegacyByPRN.xml` destination is accepted, with read-only blob scope and a currently valid short expiry. One redirect is allowed for this source alone; every other source still rejects redirects. Signed query strings are neither persisted nor logged. The XML size/schema checks still apply. A pinned reader revision allows this connector repair to be attempted immediately once, without resetting unrelated sources or their last-success state.

Production verification on 2026-10-16: initial run 38867285231 read 17 of 19 sources and verified all three D1 checkpoint writes exactly. The immediate repeat made zero upstream requests and retained both degraded states honestly. UN redirect recovery and the USGS annual baseline are tracked separately; annual context is never a current event.

## International release connectors

Six pinned international release readers extend the original 19-reader collector to 25: UN Press (Geopolitics), UN News economic development, BIS press and Bank of Japan (Macro/FX), and UN News mineral-topic filtering plus the IEA critical-minerals news index (Critical Minerals). UN's topic feeds belong to the same publisher and never count as independent corroboration. These definitions are shared by the existing category source readers, the canonical on-demand discovery engine, and the bounded production update collector. Existing BIS website reads are reused rather than duplicated. The original 67-family inventory remains unchanged; additional international reader counts are reported separately.

The target is one half-hour slot per news reader, with daily statistical baselines unchanged. Category checkpoints are bounded to 96 KiB, retaining the existing maximum 96 hashes per source; no raw content or original article URLs enter D1. IEA index changes are discovery observations only. Its exact original News header, matching H1, explicit timezone and consistent original metadata must be verified before a website observation is derived. The latest IEA mineral release observed in research was July 2026, so it is not current news.

BIS RSS 1.0/RDF uses its exact publisher-issued dc:date, not dc:modified or the request clock. BOJ's observed legacy HTTP permalinks are upgraded only for the exact issuer's approved English original-article paths, without following redirects. Date-only, timezone-less, future and stale originals remain ineligible for precise current-news claims.

All existing category endpoints use these readers for their no-charge `?view=latest` observations after the application deployment converges. The existing half-hour derived-news publisher independently writes only Geomacro-derived structured observations into the already deployed public D1 journal, keeping the existing 15-minute display delay. No new engine, paid API, Supabase reactivation, signature or commercial approval is introduced. Explicit current three-category country requests reserve an international issuer per category within the same twelve-request budget, while national preferred issuers and historical/unscoped routing are preserved. Global discovery remains country/subject-bound; transport availability does not certify a current event in every one of the 195 countries.
