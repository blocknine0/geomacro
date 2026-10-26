# Geomacro OSINT source coverage: 195×3 categories + 58 corridors

Date: 26 October 2026

## What this audit measures

The private OSINT pipeline reports different facts separately:

- **Registered category sources:** source endpoints configured for geopolitics, macro/FX, or critical minerals / rare earths.
- **Live feed health this tick:** only source checks in `OBSERVED` or `EMPTY_OR_OUTSIDE_WINDOW` count as healthy. The collector records `DENIED`, `UNAVAILABLE`, `UNSUPPORTED_FORMAT`, `MALFORMED`, and `NOT_DUE` separately.
- **Dated items observed:** feed health alone does not mean the source published a new story. Item counts require a publisher-native date that passes the existing bounded 25-hour intake window.
- **Country-source tiers:** local publisher metadata, same-continent fallback, and global fallback are reported separately. A publisher's location is never treated as the event country.
- **Corridor acquisition coverage:** canonical monitor references, discovery-only overlays, and actual private feed checks are distinct. A corridor being in the registry is not proof of live physical-flow or disruption evidence.

The new per-tick `category_live_source_coverage` field is a specific health view of all three OSINT categories. It states whether each category has at least one healthy feed this tick, and separately counts dated items. A quiet category is not fabricated into a story; a category with no healthy source is not reported as healthy.

## Inventory and explicit country gaps

The global accepted manifest contains 369 endpoints. The collector merges the 7 India PIB official-feed candidates, 7 macro/minerals candidates, and 32 regional candidates, for a 415-endpoint registry before any future source changes. Candidate endpoints are read and status-checked on each protected-main tick; registration itself is not health evidence.

The latest registry tests expect local publisher-country metadata for **65 of 195 countries**. **130 countries still have no country-specific publisher source recorded**. Global or regional sources provide fallbacks, but do not erase that local-source gap and do not imply that every country produces a news item on every tick.

## Category source coverage

The inventory now has an explicit diversity guard: at least 12 registered endpoints for each of `geopolitics`, `macro`, and `rare_earth`. This catches accidental configuration regressions, not an upstream outage. Production results still depend on successful source checks and native-clock parsing.

Additional live-feed candidates verified against official publisher RSS/Atom listing pages include:

| ID | Scope | Category lane | Publisher feed | Documentation / source listing |
|---|---|---|---|---|
| `private_expansion_ungeneva_press_rss` | Global multilateral | Geopolitics | https://www.ungeneva.org/news-media/press-releases-list/rss.xml | [UN Geneva RSS list](https://www.ungeneva.org/en/news-media/rss) |
| `private_expansion_uk_fcdo_atom` | United Kingdom | Geopolitics | https://www.gov.uk/government/organisations/foreign-commonwealth-development-office.atom | [FCDO organisation feed page](https://www.gov.uk/government/organisations/foreign-commonwealth-development-office) |
| `private_expansion_bw_bankofbotswana_press` | Botswana | Geopolitics / macro | https://www.bankofbotswana.bw/rss/press_releases | [Bank of Botswana RSS feeds](https://www.bankofbotswana.bw/content/rss-feeds) |
| `private_expansion_bw_bankofbotswana_fx` | Botswana | Macro / FX | https://www.bankofbotswana.bw/rss/exchanges | [Bank of Botswana RSS feeds](https://www.bankofbotswana.bw/content/rss-feeds) |
| `private_expansion_statcan_trade_atom` | Canada | Macro / trade | https://www150.statcan.gc.ca/n1/rss/dai-quo/12-eng.atom | [Statistics Canada feed directory](https://www.statcan.gc.ca/en/sc/rss) |
| `private_expansion_statcan_business_atom` | Canada | Macro / business | https://www150.statcan.gc.ca/n1/rss/dai-quo/33-eng.atom | [Statistics Canada feed directory](https://www.statcan.gc.ca/en/sc/rss) |
| `private_expansion_eurostat_economy_atom` | Europe-wide | Macro / economy | Eurostat's official RSS/Atom search feed for economy and finance releases | [Eurostat RSS directory](https://ec.europa.eu/eurostat/web/rss) |
| `private_expansion_eurostat_trade_atom` | Europe-wide | Macro / international trade | Eurostat's official RSS/Atom search feed for international trade releases | [Eurostat RSS directory](https://ec.europa.eu/eurostat/web/rss) |
| `private_expansion_nrcan_atom` | Canada | Macro / critical minerals | https://api.io.canada.ca/io-server/gc/news/en/v2?dept=naturalresourcescanada&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=50&format=atom&atomtitle=Natural%20Resources%20Canada | [Natural Resources Canada RSS feeds](https://natural-resources.canada.ca/corporate/rss-feeds) |
| `private_expansion_uk_dbt_atom` | United Kingdom | Macro / industrial and mineral policy | https://www.gov.uk/government/organisations/department-for-business-and-trade.atom | [Department for Business and Trade feed page](https://www.gov.uk/government/organisations/department-for-business-and-trade) |
| `private_expansion_adb_asia_pacific` | Asia-Pacific | Macro / critical minerals | https://www.adb.org/rss.xml | [Asian Development Bank RSS directory](https://www.adb.org/rss) |

UN Geneva's feed is represented in the regional candidate manifest for source coverage, then merged with the existing canonical entry in `scripts/lib/global-official-release-feeds.mjs`. The collector polls that URL once under canonical ID `ungeneva_press_global`; the alias does not cause a duplicate fetch. Other regional candidates remain registered for Australia Department of Industry, South Africa DSTI and SARS, South Korea MSIT, India Income Tax, Thailand MDES, and Philippine News Agency. PNA remains a third-party-discovered feed candidate, not a publisher-documented URL.

Two earlier candidates were removed from this set because direct audit probes returned HTTP 402 (AfDB) and HTTP 403 (Pacific Community) in the available retrieval path. They should only be restored when the production collector proves a usable response and native dates. Petromindo remains excluded: its terms prohibit using its content to construct a database and the proposed feed had returned 404.

All new entries remain `RUNTIME_PROBE_REQUIRED`, `provider_rights_verified=false`, `commercial_eligible=false`, `access_verified_in_production=false`, and `publicly_deliverable=false`. The collector still probes them automatically; no candidate gets a pass merely from being listed in this document.

## Coverage audit commands

Run:

```sh
node scripts/ops/audit-private-osint-publisher-coverage.mjs
```

The offline report prints the country-source inventory, all 585 country-category cells, category endpoint counts, and 58 corridor rows. It is explicitly marked as an offline inventory report, not a live health snapshot. The scheduled protected-main tick adds current source states, the three-category live-feed status, native-clock dated-item counts, and verified private D1 readback counts.

## Acceptance and limits

PR tests simulate feed responses to verify RSS/Atom parsing, native-date selection, category routing, per-tick health accounting, local/regional/global priority, deduplication, and privacy/rights guardrails. CI success proves the code contract, not that every real feed currently responds.

After merge, the trusted `main` collector must show healthy feeds for geopolitics, macro/FX, and critical minerals in the same tick, with private D1 persistence/readback verified. If a lane has no healthy feed, it is reported as degraded rather than marked complete. No new source here enables public raw-source delivery, signing, partner delivery, or x402.
