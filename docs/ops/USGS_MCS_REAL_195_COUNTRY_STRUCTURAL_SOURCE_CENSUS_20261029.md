# Real USGS MCS 2026 → 195-country critical-minerals structural source census
2026-10-29

## Source acquisition (existing exact bytes, not a new unlicensed feed)

GeoMacro already obtains a single pinned **USGS Mineral Commodity Summaries 2026** dataset from the original ScienceBase issuer. The existing loader independently verifies DOI `10.5066/P1WKQ63T` DataCite publisher metadata and dataset-specific CC0-1.0 rights and insists on the exact pinned MCS CSV SHA256. It refuses a revised file, unverified dataset rights, denied transport, duplicate country/year rows, ambiguous units or a missing source period. This is one narrowly scoped public-domain derived-data route, NOT a blanket waiver for government news.

The existing `First qualified country digest (no funds)` daily live source job already downloads and verifies the dataset to prepare CHN structural country digest customer JSON. This change reuses **that very same cached SHA-pinned CSV data in-process** to enumerate the *real* 195 ISO3 country routing universe and measure exact matched 2024-versus-2025 production comparisons. No extra upstream fetch, new daily cron, D1/B2 write, source licence, checkout, PREDGE change or direct raw data resale.

## What is measured

`mcs_195_source_census` in the existing restricted, 3-day GH source-only receipt contains precisely 195 ISO3 rows with one of:
- `COMPARABLE_2024_2025_SOURCE`: the already rights-checked original dataset contains at least one critical-mineral production series with numeric, unit- and section-comparable 2024 and 2025 periods. Only the **count** of derived country commodity comparisons is exposed; no raw values, upstream source URLs, records or copyrighted publisher texts.
- `NO_COMPARABLE_2024_2025_SOURCE`: the dataset does not establish one such series. Country routes are not evidence.
- `UNVERIFIED_DUPLICATE_OR_AMBIGUOUS_ROWS`: upstream repeated/ambiguous year in a source series. It is explicitly quarantined, not marked eligible.

Only an exact canonical 195-country name match is used; unofficial/fuzzy country aliases, territories and missing sovereign observations are not guessed. Every annual row is marked **historical structural**, never current mine supply, mine closure, commodity price, geopolitical development or 2026 news event.

The census proves *publisher-source data eligibility candidates* after a verified exact original fetch. It does **not** run 195 paid Store availability preflights or issue 195 x402 quotes. Each buyer-country query must still pass the **existing canonical Store's** per-country observation, scoped source rights, eligible plan and payable JSON verification. A CHN success never certifies a different country, and a country without comparable rows is never invoiced.

## Reproducible acceptance

The PR workflow runs actual `qualified-mcs-country-digest.server.test.ts` negative tests for precise source-year/ISO3, duplicate rows, wrong CSV and CC0. The real-source no-funds job fetches the official CC0 and CSV; the existing real CHN canonical product byte SHA acceptance must succeed. New assert verifies all 195 census rows, source-scoped rights proof, zero news/signing/payment and canonical product preflight **not assessed** for other countries.

After merge, verify a **new protected-main real daily run** and retain the exact signed/hashed original source report, per-country counts, and real D1/B2 archive readback only through existing separately governed workflows. A green offline unit test alone is NOT the live-source acceptance.

## Remaining commercial P0

1. Check the census: how many exact 195 ISO3 countries have *real USGS annual structural evidence* and which have gaps. Combine these country codes with the existing `geomacro.revenue-source-demand-195x3.v1` source acquisition priority, without treating structural data as current news.
2. For selected qualified countries, run canonical `/api/v1/intelligence/availability` and buyer JSON preparation, with separate source rights receipt and original byte hashes.
3. Verify real Cloudflare D1/B2 persisted data and hash-based readback. A PR-only source receipt is not a canonical D1 write or SLA.
4. Only then pursue actual merchant mainnet USDC x402 quote/settlement for a buyer-authorized $0.02 structural country digest. Merchant activation, payment/custody and signed risk objects remain completely unchanged.

PREDGE (including locked code, quota, credentials, deployments and customer contract) remains untouched.

## Country-scoped real original no-funds preparation (manual existing workflow)

The previously hardcoded `USA`/`CHN` operator script now accepts any **exact canonical ISO3** but **only after** the actual country has at least one unambiguous, comparable 2024/2025 row from this exact original CSV. The existing paid Store plan/rights/source-eligibility checker must independently return AVAILABLE for that exact ISO3, and exact customer bytes must pass the existing candidate-vault signature and SHA binding before a private archive can be written. Invalid ISO3, absent country rows, unverified rights, mixed years or failed Store preflight abort without paying, signing or publishing.

The existing `First qualified country digest (no funds)` manual `workflow_dispatch` now accepts a `country_iso3` input. Protected main nightly/PR source verification continues testing real CHN, so the prior stable scheduled acceptance does not change. An operator may run the manual workflow for a selected one of the 76 measured source candidates (or any later country with genuine qualifying data). That run uses the already-governed D1/B2 quota and protected environment and must be independently inspected; it is **not a payment** and must not be used to claim all 76 canonical Store products have been preflighted.
