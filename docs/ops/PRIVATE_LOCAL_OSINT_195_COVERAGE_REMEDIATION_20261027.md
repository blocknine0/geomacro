# Private country-local news feed gap lane — verified probe and pending coverage

Date: 27 October 2026
Status: source-fetch change validated in independent GitHub Actions PR job; protected production D1 durability not yet accepted.

## Baseline denominator

Canonical source registry has 195 countries and three categories = 585 country/category route slots.
Before this branch, only 99 countries had a registered country-specific publisher.
The main OSINT collector used 511/512 maximum endpoint slots, including 49 index discovery queries on each nominal 15-minute run; adding additional country feeds there would fail the collector configuration.

Last main-only read-only probe had 585/585 country/category cells backed by at least one healthy source feed fallback, **not 585 actual independently attributed events**. Only 109 of 585 cells had a matching native-dated source item in that tick (476 unobserved). Because a country can have no original published geopolitical/macro/mineral news during one tick, **no truthful mechanism can guarantee 585/585 fresh news cells at every interval**. Freshness, source existence, event attribution and verified D1 persistence are four separate evidentiary states.

## Independent supplemental lane

- Pinned 54 optional first-party local publisher RSS URLs for **52 previously underrepresented countries** in `config/private-osint-local-gaplane.v1.json`.
- The separate existing protected `collect-unverified-private` job now attempts those RSS candidates without disturbing the primary collector. Its source ceiling is **25 existing + 54 supplemental = 79 (<=80)**.
- Each URL must pass real HTTPS HTTP response, feed parser and native publisher publication clock. Search-index time, publisher geographic location, local editorial sections or a catalogue listing alone never establish an actual event country.
- Quota-bound private D1 data persistence remains fail-closed. No story text, title or URL is publicly emitted, and no candidate is automatically promoted to a signed or paid claim.
- The PR includes a separate read-only GitHub network probe returning per-feed status and source-clock item counts without keys or database writes. Local-source inventory includes candidates; operational healthy local sources are counted **only** from current checks.

## Actual network source proof

| GitHub run | Source candidates | Countries targeted | Readable native feeds | Countries with readable feeds | Native-dated topic items | Attributed event-country/category cells |
|---|---:|---:|---:|---:|---:|---:|
| [40415329586](https://github.com/blocknine0/geomacro/actions/runs/40415329586) | 46 | 44 | 22 | 21 | 32 | 6 |
| [40415954500](https://github.com/blocknine0/geomacro/actions/runs/40415954500) | 54 | 52 | 39 | 38 | 42 | 7 |
| [40416469452](https://github.com/blocknine0/geomacro/actions/runs/40416469452) | 54 | 52 | **46** | **45** | **50** | **8** |

In the latest trial: 46 healthy endpoints, 45 countries with at least one readable native feed. Of the 162 source/category checks: 29 `OBSERVED`, 109 `EMPTY_OR_OUTSIDE_WINDOW`, 3 `DENIED`, 9 `MALFORMED`, 12 `UNAVAILABLE`. `EMPTY_OR_OUTSIDE_WINDOW` proves a readable feed, **not** a current event.

The 7 countries among the new 52 **still lacking a healthy local publisher feed** on that physical trial were AGO, BLR, CIV, GMB, MDV, SLV and TGO. One additional backup feed in SVK failed, but its primary was healthy. The 45 newly healthy countries are distinct from the former 99 registered publisher countries, so there is an **aggregate 144-country source-health potential**, but not a simultaneous joined 195-country live acceptance since the two lanes are checked by separate jobs.

## Remaining missing local source inventory

Registration after this change reaches **151/195** countries (includes 7 newly unresponsive publishers). The **44 remaining with NO registered country-specific publisher** are:

ATG, BDI, BLZ, BRN, BTN, CAF, CMR, COG, COM, CPV, DJI, ERI, FSM, GNB, GNQ, GRD, HND, IRQ, KIR, KNA, LBY, LCA, LIE, LSO, MCO, MDG, MHL, MLT, MRT, NRU, PRK, STP, SUR, SWZ, SYC, TJK, TKM, TLS, TON, TTO, TUV, VAT, VUT, WSM.

Do not mark these 44 as local-feed covered from a regional Benin Web TV country-section RSS, UN feed or a global news search index: those are useful external regional/global evidence sources, not locally headquartered publisher feeds.

## Production acceptance still missing

The production control-plane had previously returned D1 free-tier daily read limit error 7500, followed by protected D1 HTTP 503. This code branch does not prove full end-to-end continuous durable ingestion, 15-minute freshness, all 585 fresh event-country/category cells, customer delivery or original-page independent corroboration. Those require passing production writer/readback receipts and independent source event evidence, not an RSS registry count.

Source discovery references: published official publisher news directories, public country-specific RSS source catalogues, first-party publisher pages. Their historical catalog links are *candidates only*, and every configured feed is checked against the real live network before being called healthy.
