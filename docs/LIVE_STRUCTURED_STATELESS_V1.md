# Geomacro stateless live structured output v1

Founder direction (2026-10-17): on-demand source fetch → Geomacro's own structured JSON. The new lane does **not** require commercial GRO signing, risk-score production, B2/D1 history or a Supabase intelligence database. It is deliberately a **NO-FUNDS / UNPRICED** public observation endpoint while genuine external production/readback acceptance remains outstanding. Other existing signed and historical products are not silently modified.

## API

`POST /api/v1/intelligence/live-structured` with exactly one JSON key: `{ "category": "geopolitics" }`, `{ "category": "macro-fx" }`, `{ "category": "critical-minerals" }`, or `{ "question": "What is the latest annual GDP growth for India?" }`. A second accepted numeric example is `{ "question": "What is the latest EUR USD exchange rate?" }`. `GET` describes the endpoint.

The runtime calls existing bounded official open-data adapters, bypasses their in-memory snapshot cache and disables D1 fallback. Numeric questions reuse existing World Bank WDI source=2 (annual GDP/CPI) and ECB (daily reference FX) adapters with their memory cache switched off. No upstream URLs, raw provider payloads, article headlines or question logs enter the response. No D1/B2/Supabase writes, no signed GRO and no attempted x402 settlement. Best-effort rate limiting uses only bounded ephemeral in-memory counters.

## Admission rules

The first narrowly reviewed response roster is:

| Category | Admitted derived type | Truthful data clock | Source-specific attribution |
| --- | --- | --- | --- |
| Geopolitics-related operational context | USGS-produced seismic hazard observation | Actual event occurrence within 24h; not geopolitical conflict | U.S. Geological Survey |
| Macro/FX | ECB daily reference FX observation | Reference day; not an executable live market tick | Source: ECB statistics |
| Macro/FX | World Bank WDI source=2 annual GDP reference period | Reference year; not a 24h GDP news release | World Bank WDI (CC BY 4.0) |
| Critical minerals | USGS Mineral Commodity Summaries publication/edition catalog | Dataset edition; not current output, supply or prices | U.S. Geological Survey |

Other public source candidates are excluded from this endpoint until their exact source-specific commercial terms and output relevance are reviewed. Publicly reachable is not synonymous with commercially reusable. The USGS-produced data public-domain status does not extend to embedded third-party works; WDI attribution and change notices remain required; ECB publicly released statistics have an explicit reuse and credit policy, and Geomacro-calculated crosses are identified as calculations. Keep attributions even when raw source identities are otherwise private. The code does **not** currently assert current royalty-free rights for all upstream journalism, corporate press releases or any 195-country source mesh.

## Response

`checked_at` is when Geomacro made the request. `observation_period` and `clock_semantics` describe the publisher's dataset/event date, and are not necessarily today's date. `original_event_time_verified` is true only for actual event-occurrence observations. Output contains own fixed-scope findings/implications, source-specific required credits, null risk score and signature, `chargeable:false`, `payment_required:false`, and `durable_storage_written:false`.

Unsupported original-news questions, data conflicts, restricted sources and unavailable sources fail closed with no-charge 422/503. The category requests return global source contexts, **not** a false 195-country current-event coverage claim. The old Ask Geomacro broad news path is separate and never becomes payable through this route.

## Commercial implementation after source/data acceptance

Founder-locked prices stay in `geomacro.capability-usdc.v1` (no new fee/tier). A future eligible structured-output sale does not need an Ed25519-signed GRO but **does** need a source-licensed derivation, checked clocks and scopes, an immutable exact JSON output hash, one quote for the approved capability, an authenticated durable payment claim, replay/idempotency and settlement-to-delivery reconciliation. Payment ledger records are not a raw-data/news warehouse: retain only minimum necessary non-sensitive payment, receipt and dedupe state in existing commerce infrastructure. Do not enable funds until separate actual no-funds and owner-authorized mainnet acceptance.

## Verification and current limits

Run Product CI, CodeQL, safety and Cloudflare Workerd route build. Independently request all three category POST examples and official numeric query against the actual deployed SHA, verify source fetches, credits, clock semantics and absence of new durable storage writes. Verify 429/422/503 adversarial paths and quota. Source-specific live availability will vary: an old WDI year is historical even when retrieved now; USGS MCS edition is a catalog, not a new mining event.

To add genuine 195-country country/commodity-specific live geopolitical and minerals news, extend the existing official source adapters with **country and topic matching**, native publication clocks, bounded issuer-specific request routes, primary/fallback coverage and commercial-rights reviews before exposing derived facts. This is separate from creating a GRO, and cannot be replaced by blindly changing a copyrighted article's wording.

Official usage policies: https://datacatalog.worldbank.org/public-licenses ; https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html ; https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits .

## 2026-10-22: Actual 195-country on-demand Macro annual values

The country-specific `POST /api/v1/intelligence/live-structured`
input `{"category":"macro-fx","country_iso3":"IND"}` previously searched
only current originating news and could return no answer **despite an
actual country CPI or GDP annual observation** at World Bank WDI.

After the current publisher-news path has no qualified recent original,
the service now fetches exactly one official World Bank source-2 query for
both annual inflation `FP.CPI.TOTL.ZG` and GDP growth
`NY.GDP.MKTP.KD.ZG` for the requested canonical ISO3 country.
An observation is admitted only if exact country, indicator, finite
statistic, year, bounded response, pagination and source scope pass. The
response contains Geomacro-authored comparative percentage-point findings
and annual period, not the raw upstream API object. Missing, future,
conflicting, wrong-country or inaccessible data cannot become a successful
invented observation. All 195 accepted query identifiers are individually
route-tested, but routing is not a promise that every country has either
official indicator. VAT/PSE remain explicitly allowed but missing values
remain missing.

`OFFICIAL_ANNUAL_REFERENCE_FETCHED` has
`coverage=COUNTRY_OFFICIAL_ANNUAL_REFERENCE_ONLY_NOT_CURRENT_NEWS`;
it is not same-day national CPI, current policy-release, tick FX,
geopolitics, mine event, or signed GRI. Exact query-time retrieval
`checked_at` cannot be used as the source's original publication date.
Existing native-dated original article answers still take precedence.
This is a **free unscored country context**, not a new paid tier, no
commercial-rights review waiver, no Supabase/B2/D1 writes and no USDC.

Official API: https://api.worldbank.org/v2/ ;
World Bank attribution CC BY 4.0 still applies. A current WDI annual
row is valuable, but the 195 x 3 live-event completeness claim remains
unverified. Main-branch CI and deployed API readback must be independently
accepted, not inferred from a merge.
