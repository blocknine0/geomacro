# GDACS same-publisher 24-hour earthquake RSS fallback

## Why

The protected `gdacs-native-country` observer continued failing with `GDACS_BODY_LIMIT` after three iterations of official GeoJSON SEARCH pagination. The upstream response exceeded the existing 512 KiB streaming safety cap. We do not raise the cap or pretend live coverage.

## Strict single fallback

1. Attempt the existing, seven-day official SEARCH GeoJSON once.
2. **Only** when its body exceeds the 512 KiB cap, make **one** extra read to the GDACS/JRC official `https://data.gdacs.org/xml/rss_eq_24h.xml` feed. This source is linked from GDACS's official [Feed Reference](https://data.gdacs.org/feed_reference.aspx).
3. Limit RSS to 256 KiB and at most 80 item blocks. Parse only `EQ` type with first-party `gdacs:eventid`, optional `gdacs:iso3`, `gdacs:country` and strictly timezone-bearing `gdacs:fromdate` or `pubDate`. No guessed ISO3 from event title, country labels or geo-coordinates.
4. First-party RSS contains at most the recent official time window; fallback does **not** claim the original SEARCH's seven-day completeness. If no valid country/event pair is obtained, protected-main remains RED.
5. Never use fallback to overcome 401/403/429, invalid GeoJSON schemas, redirects, missing rights, signing or payments.

The two interfaces belong to the **same publisher**. RSS does not provide independent corroboration, a complete affected-country list, confirmed geopolitical event or commercial-rights grant. No B2, Supabase, D1, x402 or raw item storage is introduced. The final receipt always retains `all_affected_countries_verified=false`, `native_release_clock_verified=false` and `commercial_paid_eligible=false`.

Tests: `node --test scripts/tests/gdacs-native-country.test.mjs scripts/tests/gdacs-official-eq-rss.test.mjs`.

Production success requires the existing exact-main `live-upstream` check to read real official native country IDs after merge, not only pass fixture tests.
