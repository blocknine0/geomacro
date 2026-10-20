# Indonesia Ministry ESDM official mineral-release index

First-party public URL: https://www.esdm.go.id/en/

The existing national mining authority registry identifies Indonesia Ministry ESDM. This bounded observer checks the official Press Release section for date-only leads with nearby mineral-sector terms. The homepage also contains older rare-earth reference documents and operational dashboards; these are never new mine events.

One HTTPS GET (12-second timeout, 512 KiB body cap, no redirects, fail-closed access denial). Reuses existing once-daily source cron; no extra scheduling.

Requires exact ministry identity and Press Release section; up to 20 non-future last-30-day display dates with mineral topic terms in immediate title context. A site index date is not a verified article-page publication clock. A reachable index with zero topics reports OFFICIAL_PRESS_INDEX_READABLE_NO_MINERAL_LEADS.

Metadata-only counts and IDN/category, short-lived three-day GH artifact; no raw titles, HTML or source URLs retained, no B2/D1/Supabase writes or funds.

No source rights grant, signed GEO/GRI, mine disruption, full 195x3 coverage or customer/Predge paid delivery. Any event qualification requires article original, source-native clock and rights checks in canonical engine.

Static acceptance: node --test scripts/tests/indonesia-esdm-official-index.test.mjs. After merge, exact-main GitHub job indonesia-esdm-official-mineral-index must prove first-party real upstream transport.