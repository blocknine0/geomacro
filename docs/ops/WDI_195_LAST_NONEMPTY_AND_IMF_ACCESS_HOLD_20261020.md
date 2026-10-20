# World Bank WDI 195-country backfill: targeted missing ISO3 only

**Verified initial annual reference:** 2025 WDI CPI availability 166/195, GDP growth 181/195 countries. The remainder may have earlier official values; that is not equivalent to current live evidence.

## Fixed after first real production failure

The first post-merge 195-country `country/all?mrnev=1` transport timed out or otherwise failed the official API. The duplicate separate job was removed. New code reuses the **already working current-year WDI 195-country single GET** and inspects its per-country presence metadata.

Only canonical ISO3 codes actually missing either 2025 annual indicator are selected, up to 50 countries (worst-case upper bound from 166/195 CPI + 181/195 GDP country gaps is 43). Make exactly **one** follow-up `country/ISO3;ISO3/indicator/CPI;GDP?mrnev=1` request, validated against all 195 canonical codes. Reject duplicates, fake ISO3s, aggregates, future years, invalid provider clocks and pagination. No wider scan or HTTP 403 bypass.

Reference years for missing countries are labeled **historical**, not current native publication times, FX prices, mineral disruptions or verified high-impact geopolitical events. Nothing is promoted to signed GRI/Intelligence or x402. If the follow-up fails, the already verified annual WDI data remains green independently.

The conditional follow-up raises the normal daily source-budget from 3 to 4 calls on days when valid missing ISO3s exist, with a maximum of 5 only when the existing Canadian official news fallback also fires. No extra cron, D1/B2/Supabase writer, payment, account or proxy.

IMF DataMapper access remains genuinely HTTP 403 (both official series) on the GitHub runner. The same publisher is no longer probed a second time after its first hard denial; no alternative identity is used.

## Acceptance

Offline checks:
`node --test scripts/tests/wdi-195-last-nonempty.test.mjs scripts/tests/imf-195-country-reference-gap.test.mjs`.

Exact-main existing `free-macro-mineral-global-daily` job must show the official WDI source request, actual missing-ISO3 count, targeted lookup status and source calls within bounds. No retrospective "195 complete" label is permitted. Provider reference availability, native publication time, current event evidence, commercial rights and signed product readiness are independent dimensions.

Official query documentation: https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures
