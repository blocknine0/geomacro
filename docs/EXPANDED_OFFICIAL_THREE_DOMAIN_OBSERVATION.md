# Expanded original official sources — bounded observation (2026-10-10)

**Status: discovery/transport only. NOT commercially admitted. NOT 195-country current intelligence.**

The live Geomacro three-domain original-publisher probe already observes up to 3
source families per category on its existing cadence. This separate, additive
six-hourly monitor observes **nine official observation endpoints across three domains** without
consuming B2, D1, frozen Supabase, paid AI/model or USDC quotas. All source
data remains PRIVATE. It does not score events or edit risk objects.

| Domain | Additional source | Fixed official endpoint | What it can actually establish | What it CANNOT establish |
|---|---|---|---|---|
| Geopolitics | European Commission sanctions guidance updates | https://finance.ec.europa.eu/node/1296/rss_en | Publisher RSS reachable; optionally source-native item release `pubDate` in 24h | A new legal sanctions designation, worldwide coverage or scored conflict event |
| Macro/FX | ECB statistical press releases | https://www.ecb.europa.eu/rss/statpress.html | Publisher RSS reachable; source-native release clock when present | Live global FX ticks, full national balance sheets or a verified macro-shock |
| Macro/FX | Eurostat official dataset-update RSS | https://ec.europa.eu/eurostat/api/dissemination/catalogue/rss/en/statistics-update.rss (fallback, same publisher: https://ec.europa.eu/eurostat/api/dissemination/catalogue/rss/de/statistics-update.rss) | Original dataset publication updates, released about twice per day | Actual macro conditions, economic calendar surprise or instant FX price |
| Critical Minerals | EITI country metadata API | https://eiti.org/api/v2.0/implementing_country | Test whether official extractives-country listing JSON is accessible; initial GitHub probe returned 403 | Real-time extraction, prices, supply shock or 195-country coverage |
| Critical Minerals | Natural Resources Canada Simply Science RSS | https://natural-resources.canada.ca/simply-science/rss.xml | Source-native government science publication release time when present | An independently confirmed rare-earth export shock, mineral event or global supply coverage |
| Critical Minerals | EU official featured-news RSS | https://european-union.europa.eu/node/309/rss_en | EU official news-discovery metadata, count of 24h mineral-related titles only | Direct originating publisher, exact original article publication time, source rights or corroboration |
| Geopolitics | UN News original peace/security RSS | https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml | Dated UN-originated article links, topic-matched 24h counts | Global country coverage, commercial rights, verified geopolitical risk scoring |
| Macro/FX | Statistics Canada Daily price releases | https://www150.statcan.gc.ca/n1/rss/dai-quo/18-eng.atom | Native Atom `entry/published` + strict original government article origin; topical 24h counts | Live global FX rates, corroborated inflation surprise, country coverage |
| Critical Minerals | NRCan official government news-release Atom | https://api.io.canada.ca/io-server/gc/news/en/v2?dept=naturalresourcescanada&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=50&format=atom&atomtitle=Natural%20Resources%20Canada | Native Atom `entry/published` + strict first-party original article host; mineral topical 24h counts | Real-time global mineral supply, independent same-event verification, commercial rights |

Supporting official references:
- https://www.ecb.europa.eu/home/html/rss.en.html
- https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-detailed-guidelines/catalogue-api/rss
- https://european-union.europa.eu/news-and-events/featured-news_en
- https://finance.ec.europa.eu/eu-and-world/sanctions-restrictive-measures/sanctions-adopted-following-russias-military-aggression-against-ukraine/guidance-documents_en
- https://eiti.org/api
- https://eiti.org/open-data
- https://natural-resources.canada.ca/corporate/rss-feeds
- https://www.statcan.gc.ca/en/sc/rss
- https://www.ungeneva.org/en/news-media

### Three domain production acceptance contract

1. **Discovery**: fixed HTTPS publisher, bounded response, MIME, no redirect,
   exact native publication when available; source availability != event.
2. **Official original event**: article-level original publisher date and
   attribution; GDELT index time, feed update time and HTTP retrieval are NOT
   event times. For EITI, fiscal reporting year is structural context.
3. **Commercial rights**: signed/citable permission for exact dataset/endpoint
   and derived answer redistribution, not implied by public URLs. Keep
   `commercial_eligible:false` until legal/owner evidence is entered.
4. **Same-event corroboration**: independent publishers, not two mirrors or
   multiple URLs on one publisher family.
5. **Scoring and evidence**: canonical signed GRO, permitted source selection,
   country/event attribution and severity. No fabricated story or time.
6. **Quota-governed publication**: only accepted scored data flows through B2
   full PUT/GET SHA256/gzip restore and verified D1 checkpoints. Frozen
   Supabase remains unwritten; missing current hot snapshot stays HTTP 503.
7. **Paid endpoint**: unverified, stale or unsupported country returns no
   payment challenge/charge; x402 no-funds acceptance before owner ACK.

### Cadence, geography and honesty

- Existing official event feeds: continue their established hourly sampling.
- Additional official release/structural probes: **4 times per UTC day**,
  nine feed GET requests per cycle, plus at most four bounded original article date GETs (two per Atom source), plus at most one documented same-publisher
  Eurostat German-language alternative following primary HTTP 404/5xx only
  (~36–56 total GETs/day). No locale retry on 401/403/429, redirect/network
  errors or wrong MIME/body/schema. Each attempt has a 5s timeout and 192-KiB
  maximum body for the other eight sources; Eurostat catalogue RSS alone
  has a 1 MiB hard cap (both primary and conditional same-publisher
  alternative). Bodies above either cap fail closed without parsing or
  recording data. No other retries and no paid credentials.
  This is low-cost, not instantaneous distribution, and may be held by
  upstream rate limits. Event-specific frequency must match actual publishers.
- ECB is euro-area-focused; EU sanctions is Europe-issued/global-designation
  scope; EITI has a limited implementing-country membership. Even a healthy
  three-source observation is **zero proof** of 195 countries current.
- Global country coverage requires national central banks, stats offices,
  sanctions and government outlets, mineral regulators and customs/trade
  administrations; event correlation across distinct publisher families and
  actual site/D1 serving must be independently verified.
- **Status criteria:** an external 403/429, MIME or schema mismatch yields
  `SOURCE_TRANSPORT_DEGRADED`, not fake source freshness. The sanitized
  response may record numeric primary/fallback HTTP status without headers,
  publisher body, response URL, article text or secrets. The observed 2026-10-10
  HTTP **406 Not Acceptable** is addressed with a single Eurostat-only
  `Accept: */*` request: broad transport negotiation never bypasses mandatory
  XML MIME, native RSS shape, finite per-source size, original-time, rights or scoring gates.
  Any Eurostat fallback is one publisher family, **not** independent corroboration; even a valid translated RSS is not a risk event. PR tests validate
  safe fail-closed behavior even during publisher outage; real main/scheduled
  production fails RED and preserves a sanitized three-day receipt.

### Precise Eurostat data-update evidence (2026-10-10)

Eurostat's official documentation separates data changes (`UPDATED_DATASET_DATA`,
`UPDATED_DATASET_STRUCTURE_DATA`) from catalogue metadata changes
(`UPDATED_DATASET_STRUCTURE`, code-list creation/removal and deletion).
The monitoring receipt now reports `eurostat_native_dataset_data_updates_24h`
and `eurostat_other_catalogue_changes_24h` as **distinct bounded
counts of items with actual past 24h original item pubDate**. Both are
private counts, not derived economic values, country risk, surprise or
severity. None can renew a D1 risk snapshot or activate x402.
Only exact Eurostat source ID can populate those fields, and the
sum must equal the existing 24h RSS item count; this is a source taxonomy
proof and not a corroboration or rights grant.

Official feed category semantics:
https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-detailed-guidelines/catalogue-api/rss

No redistributable raw source articles or bulk EITI data are produced by this
workflow. It is a staging increment, not launch acceptance.

### 2026-10-10 observed mineral-policy gap

On 9 October 2026 the European Commission officially announced 46 additional
strategic critical raw materials projects in 16 EU Member States. The existing
strict same-original-publisher precise-date mineral discovery lane observed
zero qualifying current candidates. An EU official *news-aggregation* RSS is
therefore sampled for topical native-dated release **counts only**, but the
aggregator is not a second original-publisher family and its RSS timestamps
cannot be substituted for the press release's own exact time. The official
announcement and project list are available at:

- https://single-market-economy.ec.europa.eu/sectors/raw-materials/areas-specific-interest/critical-raw-materials/strategic-projects-under-crma/selected-projects_en
- https://european-union.europa.eu/news-and-events/featured-news_en

No mineral risk object or commercial right is activated until a source-origin
precise publication time, independent corroboration and rights evidence pass.

### Added original-publisher native-article observation lanes (2026-10-10)

The additional 3 fixed native article feeds **do not remove or hide** EITI HTTP 403 or NRCan Simply Science transport failure. All 9 official sources are independently sampled, and any unavailable source leaves the producer `SOURCE_TRANSPORT_DEGRADED`. For the 3 newly added originating publisher feeds, an in-window topical article is counted only if the **RSS `item/pubDate`**, **Atom `entry/published`**, or narrowly verified same-original-article HTML `datePublished` (two-page maximum per Atom publisher) is a real precise past clock (within 24h) AND its link has an exact allowlisted publisher host. Atom `updated`, channel clock, feed retrieval, topic-only aggregation and third-party hosts are rejected. A count is private original discovery, **not scored Geomacro risk, commercial license proof or 195-country coverage**. The sanitized observation has `original_publisher_native_24h_topic_counts` by domain; zero may mean a quiet publisher, not absence of news globally. No source RSS body or article title is re-served to customers. Production cannot pass a stale D1 hot-snapshot requirement from observation alone.

### Real-time admission age buckets (2026-10-10)

The source receipt also exposes `original_publisher_freshness_windows` for all three domains, separately counting **90 minutes**, **6 hours**, and **24 hours**. Each item retains its ORIGINAL first-party article publish date. The only allowed rescue for undated Atom is an exact publisher article `datePublished` clock (at most two pages/publisher), never the feed `updated`, crawler time, GDELT indexing time, or a synthetic clock. Numeric buckets must satisfy `within_90m <= within_6h <= within_24h`. Publisher transport failure stays explicit and means zero counts are *unknown coverage*, not global news absence. These proof windows are aligned to existing D1 90-minute GRI/Risk Indices and 6-hour Intelligence freshness requirements, but are **NOT an authority to republish** stale B2 rows: rights, same-event independent corroboration, canonical severity scoring, signature, B2 full readback/hash/restore, and D1 publication remain separately required. No additional network requests, paid API calls, or B2/Supabase/D1 writes are introduced.
