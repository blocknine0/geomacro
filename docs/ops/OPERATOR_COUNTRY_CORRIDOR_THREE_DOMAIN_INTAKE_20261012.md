# Country, corridor and three-domain source intake — 12 October 2026

## Scope, input preservation, and deployment boundary

The user provided two separate companion inventories described as Claude-generated:

1. `country_sources.yaml`: **37 global-country-dimension sources** plus
   **71 national-primary rows** in **23 country/region groups**;
2. `corridor_sources.yaml`: **20 corridor-specific source proposals** and
   **58 named corridors** (maritime, oil/gas pipeline, rail, economic routes,
   critical-mineral logistics, subsea cables and airspace).

All 186 records (108 country sources + 20 corridor sources + 58 geographic
corridors) are preserved and cross-linked in source-safe machine-readable
registries:

- `config/operator-country-source-crosswalk.v1.json`
- `config/operator-corridor-source-crosswalk.v1.json`

This is an **overlay**, not a replacement for the canonical source registry,
the existing 76-source intake, the 195+ country universe, or the current
commercial corridor country-pair descriptor. Do **not** turn on another
GDELT, ReliefWeb, Comtrade, USGS, Eurostat or Federal Register poll when the
existing canonical source reader already serves that exact family.

## Three commercial categories

User-provided labels are preserved, while Geomacro labels are normalized:

- `geopolitics` — sanctions, conflict, diplomatic policy, outages, maritime
  security, chokepoints and subsea/airspace disruption context
- `macro_fx` — sovereign/country macro, rates, energy/commodity trade,
  freight/transport and financial risk proxies; annual/monthly baselines
  must never masquerade as minute-level releases
- `critical_minerals` — rare-earth production, export controls, mining,
  supply chains, customs/trade and critical-mineral routes

Named corridors may match multiple categories. **Cross-category relevance
is not three independent observations.** An input publisher counted for
two topics remains **one** original source for corroboration/dedup.

The 58 routes use the user's approximate centroid, named countries, commodity,
signal and monitor IDs as **analyst candidates only**. Named geographies
are not certified route polygons, flow telemetry, a `flow_index`, current
`disruption_flag`, a paid route risk score or signed GRO. Current
`COUNTRY_PAIR_STRUCTURAL_V1` commercial boundary remains unchanged.

## Country identity and duplication

- Country-specific nodes use ISO 3166-1 alpha-3 IDs.
- Regional `EU` entries stay EU/institution-wide; they are **not** assigned
  to a fake country `EU` or automatically copied to all EU member states.
- The user's multi-country clusters are expanded into *declared* ISO3 members
  for candidate discovery, not claimed to prove coverage.
- GDELT FIPS and country-code conventions, ACLED identifiers, official country
  data definitions, and source-specific corrections require an explicit
  tested conversion table before a publisher event can be certified to ISO3.
  A source URL is not proof a specific country is currently covered.
- Preserve `TWN` as a geographic ISO3 input without implying a political
  or sovereignty position; keep source/territory definitions independent.

## Provider rights and source naming

- The uploaded file's `license_flag: free` is a *claim* from the provided
  registry and is not approval to bulk redistribute or use a premium API.
- Paid, partial, `check`, credentialed, scraper-dependent, placeholder
  and HTTP-only candidates are **held** until exact dataset/API rights,
  transport, attribution, quotas and verified runtime acceptance.
- Country `reliefweb_country` proposes deprecated `v1/reports`; the
  existing approved `ReliefWeb V2` reader is the only activated route.
- `ucdp_country` may be a different API/version from the licensed `UCDP GED`
  dataset. Sharing a provider name never extends dataset-specific rights.
- Official attribution must use the exact source names from the upstream
  institution when the datum actually contributes. Keep the user-requested
  publisher credit in provenance, not as a list of unused sources.
- `MARAD` **hosts** U.S. Maritime Alerts and Advisories jointly issued
  through an interagency U.S. government system; don't misattribute authorship
  to MARAD alone.

## Three new production transport-only observations

Existing GitHub Actions `Expanded Official Three-Domain Source Observation`
cron is reused, **no new schedule**. At most 3 HTTPS GETs per regular slot,
nine-second timeout per request, hard 512-KiB body cap, no redirect,
no 401/403/429 bypass or retries, zero B2/D1/Supabase writes and no spending:

1. **Geopolitics / corridor:** MARAD-hosted U.S. Maritime Alert and Advisory
   System. Verifies official HTML page transport; does not parse or reproduce
   original alerts or establish a present-day incident.
2. **Macro/FX / Ukraine:** National Bank of Ukraine's official USD FX
   reference `exchangeNew?json&valcode=USD` endpoint; checks data shape
   and nonnegative official rates. No price/time series distributed or
   claimed real-time FX stream.
3. **Critical minerals / Japan:** Japan Organization for Metals and Energy
   Security (JOGMEC)'s `2026` official news release index. Checks
   first-party HTML transport only; does not infer a new current mineral
   event or copy release text.

All checks generate private numeric/availability receipts; if any fails, that
job is red and source health is not fabricated. Failure of these new
supplementary observers does not disable the pre-existing working
ReliefWeb/12 official/10 public rotating source jobs.

## Remaining activation gates

The overlay contains **candidates and references**, not universal feeds
newly made live. `scripts/lib/operator-country-corridor-reference.mjs`
provides explicit country-domain and named-route lookups with fail-closed
`NOT_MODELED` risk status.

Real commercial activation still needs actual provider permission and
publisher-native evidence dates, multi-source same-event verification,
dataset-specific attribution, robust deduplication, signed GRO payloads and
x402 no-funds/real-money acceptance. A global-country source that returns
200 does not qualify 195 country×3 current cells.

Source docs crosschecked:
- USG MARAD alert/advisory portal:
  https://www.maritime.dot.gov/msci/maritime-security-communications-industry-msci-web-portal
- National Bank of Ukraine exchange API developer description:
  https://bank.gov.ua/admin_uploads/article/Instr_API_KURS_VAL_Full_eng.pdf
- JOGMEC first-party 2026 releases:
  https://www.jogmec.go.jp/english/news/release/2026.html

Refer to the master tracker [#1827](https://github.com/blocknine0/geomacro/issues/1827)
for production acceptance and blockers.
