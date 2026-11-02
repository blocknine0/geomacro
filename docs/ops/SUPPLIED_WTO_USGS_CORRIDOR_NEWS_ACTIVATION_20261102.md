# Additional active native news from supplied WTO and USGS source families

The 2026-11-02 operator-supplied directory has 37 stable source IDs and 39 URL references. Most URLs are data portals, codebooks, statistical datasets, credentialed APIs, or non-RSS document indices and cannot simply be polled as a news feed.

## Activated supplementary original-publisher feed readers

- Original registry **wto_tariffs** (trade/tariff data portal): independent institutional **WTO Latest News** RSS URL `https://www.wto.org/library/rss/latest_news_e.xml`; new feed ID `wto_official_news`. News is original WTO policy coverage, not a tariff dataset observation.
- Original registry **usgs_mcs** (periodic mineral commodity dataset): independent institutional **USGS Mineral Resources Program News** RSS `https://www.usgs.gov/news/minerals/feed`; new feed ID `usgs_official_minerals_news`. Restrict to substantive mineral-resource headlines; exclude generic geological flight updates.

These preserve all 37 submitted sources, 39 source-link occurrences and original URLs. Added feeds are supplemental native news, not duplicate financial/geopolitical evidence or independently corroborated events.

## Ingestion and confirmation

The existing **Direct Global Corridor Intake (Isolated)** GitHub workflow remains scheduled four times per hour. It now polls six existing native feeds plus two institutional feeds, each with bounded HTTP, no redirects, a 72-hour native publication clock, pinned first-party article host, title hashing and deduplicated identity. Its source-intake receipt contains `supplemental_native_feed_checks` (both providers). HTTP 403, XML rejection, wrong host, stale dates and no recent article are distinct outcomes.

The existing Worker private D1 writer recognizes the two new source IDs and retains authenticated batch PUT + exact readback, 72-hour retention, no raw title/body, and `commercial_eligible=false`. The control-plane deployment workflow must successfully deploy the updated Worker before 2 new provider IDs can be accepted remotely. No personal keys required for these two feeds.

The operator directory's credentialed endpoints are separate. ReliefWeb requires pre-approved `GEOMACRO_RELIEFWEB_APPNAME`; FRED requires `GEOMACRO_FRED_API_KEY`; CryptoCompare requires an accepted `GEOMACRO_CRYPTOCOMPARE_API_KEY`; Freightos data stays unenabled under the existing no-paid-provider requirement. These are not converted into fake live news when unavailable.

## Strict product boundaries

Neither the WTO nor USGS headline by itself certifies a CAMEO root, vessel incident, trade sanction, mineral shortage or Risk Gate decision. These are first-party link/time **candidates**, not signed GRO, paid customer responses or Website Intelligence publications. PREDGE is unchanged. Source-native publication date never automatically becomes incident occurrence time. Missing news stays missing.

**Acceptance:** check GitHub Action source-intake job and D1 PUT/GET receipts, not merely a green contracts job. Look for `supplemental_native_feed_checks` and independently observed item counts before claiming additional active provider events.
