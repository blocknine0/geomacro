# GeoMacro: Global 120 MD → governed production ingestion

## Scope and authoritative architecture

The uploaded `global_120_ingestion_system_guide.md` is a **proposal**, not proof of 123 working national original publishers. It refers to `config/GLOBAL_120_COUNTRIES_ACTIVATED_FEEDS.json` (123 countries / 369 streams) but that JSON was not included. Its listed regions sum to 117 entries, with cross-region overlaps (e.g. Mexico); do **not** fabricate missing countries or 369 verified URLs.

GeoMacro already has a canonical 195-country / three-category discovery grid, source-native RSS/Atom observation, private 15-minute scheduler and canonical D1 quota-admitted raw-original path. The uploaded script's direct unrestricted Supabase `raw_observations` upsert, fake fallback publication timestamp and global "85" credibility score are **not production-compatible** with the current D1/rights/provenance architecture.

## Mapping the guide's six proposed hubs

| Hub | Production mapping | Handling |
|---|---|---|
| BIS speeches | `private_hub_bis_central_bank_speeches` | New pinned private candidate; original speeches remain independent-issuer unverified |
| ReliefWeb | Existing `scripts/ingest-reliefweb-live.mjs` V2 adapter and approval-gated source paths | Appname approval mandatory; v1 URL in guide not used; not a guaranteed D1 producer |
| OFAC sanctions | `private_hub_us_ofac_sanctions_actions` | New pinned private RSS candidate; actual HTTP and pubDate determine observation |
| UN News | `private_hub_un_global_news` | New pinned private aggregator candidate; UN-reported story not treated as official source action without proof |
| Mining.com | `private_expansion_mining_dot_com` | **Retired** from active polling: DENIED in four read-only public-feed probes |
| USGS minerals | Existing `usgs_minerals_original_news_rss_review` | Already observed as healthy/empty, not evidence of a new original story |

Every added endpoint is subject to the existing 25-hour native-clock window, category keywords, per-host and global bounded concurrency, no duplicate URLs, no unapproved source-body retention or commercial claims.

## Verified four-probe retirement

Independently captured counts-only, non-mutating source-status artifacts:
- https://github.com/blocknine0/geomacro/actions/runs/41106820853
- https://github.com/blocknine0/geomacro/actions/runs/41124471216
- https://github.com/blocknine0/geomacro/actions/runs/41124882797
- https://github.com/blocknine0/geomacro/actions/runs/41125059189

Across those receipts, 76 source identifiers were `DENIED`, `UNAVAILABLE`, `MALFORMED` or `UNSUPPORTED_FORMAT` in at least three distinct probes, with no healthy states. Their exact IDs are in `scripts/lib/private-osint-retired-sources.mjs`. These are **removed from active private polling** and from runtime source coverage counts. Existing publisher provenance definitions, historical receipts and D1-derived evidence are not deleted.

A temporary transport block does not prove a publisher ceased to exist. This is an operator-authorized, durable *GeoMacro polling retirement*, reversible only by a reviewed code change; it does not assert the publisher is permanently offline.

## Bounded runtime acceptance

- Three new pinned feed candidates, with all source rights false until independently checked.
- 76 retired IDs excluded from the active runtime; seven of these are local gaplane endpoints, automatically replaced from the surviving local-source catalogue without extra fetch slots.
- The exact same per-tick **25 canonical country discovery index queries** are retained. The 195 country index routes remain covered in eight nominal delivered 15-minute slots (120 minutes, not an arrival SLA).
- Total HTTP feed GET ceiling remains **512** and all production D1 writes remain subject to the existing provider quota gate. No new database, paid provider, payment rail, B2 or separate cron schedule.
- PREDGE, historical Supabase/repository and x402 remain untouched.

## Production acceptance status

Merging a PR and passing static tests is not itself proof of new live source output. Require independent scheduled Actions readback, per-source HTTP/native-clock receipts, real canonical D1 acknowledgements and B2 archive evidence where applicable. Do not mark 123×3 or 195×3 genuine original-news coverage completed on discovery-route configuration alone.
