# Three-category news JSON with 25-hour rolling D1 retention

Status: implementation intended for production. No new paid APIs, Telegram
scraper, Supabase service, laptop/desktop daemon, current signed product,
x402 price or Predge-feed contract.

## Contract

`GET https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/reusable-source-news`

Returns public, machine-extracted **factual candidate JSON**, never original
news text, publisher headline, URLs or licensed publisher media. Supported
category filters: `domain=geopolitics`, `domain=macro`,
`domain=rare_earth`. Optional `country=IND` restricts results to
exact canonical ISO3 geography found **in each news title**; 195-country
routing does not mean all 195 countries produced news.
Pages use `offset=0,200,...,3800`, maximum 200 items each and maximum
4,000 recent stored observations. `next_offset` and `has_more` allow
retrieval of remaining pages.

Retention is strictly `source.original_published_at` less than or equal
to 25 hours old; not first-seen, scraping, processing or editorial clock.
On each production write, SQLite deletes rows outside that age; GET
also filters by the original-native publication timestamp. Only original
RSS `pubDate`, Atom `published`, or supported government JSON native
`public_timestamp` can qualify. If native clock is absent, ambiguous,
undated or stale, there is **no news JSON**, not an invented clock.
A Geomacro authored factual JSON ID is a deduplication identifier,
not a verification signature. No commercial publisher licence is inferred.

## Sources and near-real-time schedule

Existing `All Registered Source Reusable JSON Production` workflow
polls on `4,19,34,49 * * * *` (best-effort 15-minute GitHub schedule).
The collector combines the existing pinned official-release, expanded
official-mesh and operator-read news inventories; its 43 registered
endpoints include unsupported/malformed/blocked sources that cannot be
reclassified as working news. It now selects up to eight sources
per category per 15-minute slot and stores up to 480 derived candidates
per run. GOV.UK Search API official JSON search results are supported
using their original `public_timestamp`, alongside RSS/Atom/RDF.
Other HTML, non-news numeric APIs and private/fee sources remain
`UNSUPPORTED_FORMAT`; a working URL does not imply a news feed.

The shared D1 batch writer validates each JSON row, then does atomic
deduplicated inserts, exact readbacks, expiry and bounded capacity
management. The GitHub workflow verifies the protected writer and
public reader and publishes `artifacts/reusable-source-news/news.json`
with the same 25h feed; no upstream full post or private token appears
in the artifact. It emits `excluded_by_collector_capacity` and
`factual_json_rows_excluded_by_capacity`, never an unsupported
claim that every global news event was captured. The free 4,000-row
limit may truncate very high-volume windows; provenance, rights and
delivery restrictions remain fail-closed.

`GET /api/v1/intelligence/query?view=reusable-news-json` follows a
25-hour projection once Lovable publishes a matching canonical-main
website build; it also keeps its **existing** derived editorial journal
separate rather than changing any partner 72-hour retention. Website
previews use three 200-row pages; when the D1 store has more, they
report `source_reader_preview_has_more:true`. Full paged D1 API
remains accessible independently of Lovable.

## Telegram sources and explicit consent boundary

The existing private `blocknine0/geomacro-telegram-signals` discovery
registry contains 152 candidate channels and no documented ACTIVE
publisher-authorized channels as of 25 Oct 2026; the 195-country
geographic routing registry is not an authorization to collect from
195 countries via Telegram. Telegram's current Content Licensing
and Bot Developer Terms prohibit bulk collection/indexing for AI
without appropriate, context-specific consent.
Thus there is **no automated scraping of public Telegram channels,
MTProto sessions or `t.me` mirrors** in this change.

Existing publisher-authorized, direct-consent Bot submissions (once
a genuine source is approved) remain hash-only private leads. Their
`GET /v1/internal/telegram-research-json` endpoint now uses the
same **25-hour native-post window**, with hourly D1 cleanup via
existing `Telegram B2 D1 Governed Consumer` workflow.
No raw Telegram content is delivered; an unverified private lead
is **not** a public article or paid customer item.
Owner-provided Telegram Desktop export files are in separate
unmerged PR #2839, pending the owner-required ADR sign-off.
This change does not quietly merge or enable it.

## Acceptance required, not inferred

1. Offline D1 JSON tests for 25h expiry, country/domain paging,
   payload boundary; collector tests for GOV.UK JSON and native dates.
2. Product CI, Website Lock, CodeQL, Telegram consumer and no-funds
   safety workflows green on exact commit.
3. Production D1 deploy and verified GET `window_hours:25`;
   actual scheduled collector write/readback. Source availability counts
   reflect observed transport, not invented news.
4. The website's version requires manual Lovable Publish if not
   already synchronized/published; don't treat mirror sync as deployment.

**Non-goal:** guaranteeing every actual news item in every country and
category; some countries issue no daily qualifying release, a source may
deny access or lack usable native timestamps, and quota/storage caps exist.
