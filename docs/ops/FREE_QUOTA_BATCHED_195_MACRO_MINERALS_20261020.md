# Free-tier quota: batched Macro/FX + Critical Minerals + 195-country source coverage

Status: source-observation change, not a full paid-product activation.

## Capacity, not artificial limit increases

- Cloudflare Workers Free publishes 100,000 requests/day, 50 external subrequests/invocation and 5 cron triggers per account. D1 Free allowance includes 5 million rows read/day and 100,000 rows written/day. Backblaze B2 class A/B allowances are provider/account-specific; Geomacro's separate **80-operation daily D1 governor** is self-imposed safety headroom, not provider entitlement.
- This PR does **not** raise these caps, create other accounts, rotate secrets or move usage to paid APIs. The least-risk way to increase usable headroom is to **avoid calls**: aggregate country requests, reuse registered source families and keep proven denials in persistent cooldown.
- After the protected-main MARAD 403 and IEA denial, the existing 3-row D1 checkpoint now enforces a full **24h backoff** for those two families (other providers' existing bounded backoffs remain unchanged). This reduces these two denied sources from potentially 4 requests/day each to at most 1/day each, best-effort.
- UKMTO remains its own explicit daily denial hold. No free API access was acquired for UKMTO or MARAD. Use permitted official subscription/distribution where available; no bypass.

## Three-call daily original-source reference census

Reuses the existing `gdacs-native-country.yml` once-daily UTC 03:51 scheduled slot and its static tests. No additional cron triggers, D1/B2 write, Supabase reactivation or USDC spend:

1. **World Bank WDI**, **one** official bulk query: `FP.CPI.TOTL.ZG` inflation and `NY.GDP.MKTP.KD.ZG` real GDP growth, across `country/all`, 2 calendar years, source 2. The response is matched **only** to the existing canonical 193 UN members plus PSE/VAT 195 ISO3 country registry. A missing/NULL series remains missing. The audit does not export numeric raw observations. Annual reference observations are not same-day releases or streaming FX quotes.
2. **Peru MINEM** monthly mining statistical bulletin official index, **one** GET. Index presence proves only the listed bulletin landing exists, not complete current output, publisher item clock or national mining production.
3. **Canada NRCan GEOSCAN** official new-publications RSS, **one** GET. Strict native publication dates, dedup and topical matching; no raw title or article bytes in receipt. This is a distinct publication lane under existing Canadian government family, not a new independent fact certifier.

Each response has size/time/redirect and date guards. Explicit 401/403/429 stays red and does not trigger proxy rotation or extra attempts. Each source has its own degraded result, and the underlying data are not persisted; a 3-day private artifact contains counts and exact per-country presence/absence metadata only. **This is one bounded daily source survey, not 585 independent high-frequency country polls**.

## Production verification

- `node --test scripts/tests/wdi-195-batch-reference.test.mjs`
- `node --test scripts/tests/two-official-mineral-release-indices.test.mjs`
- `node --test scripts/tests/free-source-production-updates.test.mjs`
- After merge inspect exact-main `free-macro-mineral-global-daily` job and private short-lived receipt; the job fails red if WDI is absent or all minerals indices unavailable.
- Different World Bank series may not exist for Holy See, Palestine or smaller economies. Do not substitute 250-geography directory rows for 195 verified country data. No direct production website/Predge publication, signed GRI or x402 rights grant is implied.

## Next sources: dependent on exact legal transport

- **Macro**: reuse ECB daily FX (already registered), BIS/BoJ/BoC original releases, then central-bank-local ISO3 publishers. WDI is a historical structural baseline, not realtime.
- **Minerals**: reuse existing USGS 2026 MCS CC0 and NRCan release feeds, now probe Peru MINEM and GEOSCAN. Later add verified Chile COCHILCO, Indonesia ESDM, China customs/MOFCOM, DRC/Zambia mining releases *after exact URL/rights/clock tests*.
- **Maritime**: UKMTO/MARAD current automated access blocked (403), even though website listings are public. Consider government-authorized email subscriptions or first-party authorized feeds; USCG NAVCEN offers public free RSS by district, but cannot be represented as UKMTO/MARAD incident coverage or globally identical provenance.

Commercial derived output permission, current 195x3 paid country evidence, complete 58-route mapping, actual website display, current signed objects and deep-health HTTP 200 require separate truthful acceptance.

## October 20 live-source correction

The exact-main WDI country-wide batch subsequently succeeded after its 25-second time allowance: **166 of 195** registered countries had annual CPI-reference values; **181 of 195** had annual real GDP growth values for the last completed calendar year. This is annual 2025 reference availability only, not live currency prices or globally certified intelligence.

The same run correctly reported both optional MINEM and Canada GEOSCAN transports as unavailable; provider incidents must **not retroactively invalidate already verified independent WDI reference coverage**. The follow-on category-aware operator verdict now records distinct Macro success and Minerals degraded status; the job returns success when genuine WDI country reference coverage is observed and the bounded request budget is respected, but the failed Mineral transports remain explicitly red in the same receipt.

On a *network failure only* at Canada GEOSCAN, the observer may perform one additional bounded GET to the **existing catalogued Natural Resources Canada news Atom feed** (`nrcan` family). The fallback is from the same Canadian government publisher family, never independent corroboration, and is neither current mine production, confirmed incident nor new commercial rights. Exactly 3 routine calls/day, at most 4 when the Canadian network fallback is eligible. Do not use it after any explicit 401/403/429 denial. A blocked fallback remains red.
