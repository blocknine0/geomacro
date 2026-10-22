# Actual upstream data delivery: 195 countries x 3 categories (2026-10-22)

This change repairs a **real machine-data transport defect**: the legacy UN
Comtrade adapter addressed `/public/v1/C/A/HS` and `/data/v1/C/A/HS`.
Official documented routes are `/public/v1/preview/C/A/HS` (no key) and
`/data/v1/get/C/A/HS` (registered key). Existing tests previously asserted
only fabricated mocked rows and did not test the paths.

## New bounded actual-data acceptance

On the existing daily GDACS/source cron, the separate
`comtrade-195-actual-mineral-reference` job now:

1. Reads **one** live current UN Comtrade `Reporters.json` catalogue.
   It intersects exact valid official ISO3 reporter identities with the
   canonical 195 (193 UN members + PSE + VAT), preserving each missing country.
   A reporter code is NOT evidence of current imports, exports, a new article,
   a value, or 195 successful source observations.
2. Uses no-key public preview for **three specifically scoped annual commodity
   observations**: China cobalt ores HS 260500, Indonesia nickel ores HS
   260400, Chile copper ores HS 260300, world-partner exports, last completed
   calendar year. One GET per sample; never claim these proxy every mineral or
   global exports. One and only one returned scope-matching finite numeric row
   counts as a verified *annual numerical reference* (zero is an actual possible
   reported value). Multiple rows, missing rows, wrong code/flow/period,
   transport restrictions and ambiguous responses stay NOT VERIFIED.
3. Writes a **private three-day artifact** with normalized reported numerical
   references, exact observation year, individual status and 195 reporter
   presence/missing list, not publisher response bodies. Logs only counts and
   bounded status codes. The artifact is not exposed to buyers or the public
   news feed.
4. Makes zero commercial-rights, mine-disruption, same-day/20-minute news,
   signed score, GRO, x402 or 585-country-cell claims. Does not call B2/D1
   or the frozen Supabase. Up to four public upstream GETs; no subscription
   or paid source required.

The existing unrelated local 21-entry curated Comtrade mapping JSON is **not**
the live reporter resolver. The adapter already resolves codes from the current
official catalogue at query-time; it needed the transport route fixed.

## Data already known versus remaining acceptance

- Last observed WDI 2025 annual reference: CPI 166/195 and GDP growth
  181/195 (source: WDI protected daily job). These are data *reference
  observations*, not 195 fresh national macro release streams.
- Country original-source on-demand audit: 2 countries/day, 98 planned
  days/cycle, not 195-country low-latency independent event verification.
- The public 72h Geomacro D1 derived news and production signed/GRO hot
  serving have **different authority and uptime requirements**.
- On 2026-10-22 the actual deep health was HTTP 503 and signed hot products
  0/3. This mineral reference observer does not change that.

Next production work must prove (a) exact live original national/regional
issuers for each country's geopolitical releases, (b) central bank/statistics
release-native macro series, (c) actual mineral production/trade flow points
and HS vintages across producers and importing countries, then (d) verified
derived event delivery and rights/signature/paid-product acceptance. A fixed
source directory or catalogue is not the numerator.

Official API endpoints: https://uncomtrade.org/docs/un-comtrade-api/
Country reference: https://uncomtrade.org/docs/country-codes/
