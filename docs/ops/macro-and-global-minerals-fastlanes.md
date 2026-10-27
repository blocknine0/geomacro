# Macro Economics and global Critical Minerals fastlanes

The existing Five-Minute Original News Fastlane owns both bundles. No second
GitHub cron, database, source-content archive, paid feed or per-country search
fan-out is introduced. The canonical derived journal remains the publication
hub for the website, permanent Finds publisher and machine projections.

Forex, gold and silver use `macro`. Gold/silver-only mining reports must not
become Rare Earth reports. Critical minerals keep `rare_earth`, the existing
storage key for the Critical Minerals product.

## Bounded collection and quota

The existing account-wide GraphQL D1 pacing/reserve preflight runs before any
source polling. One complete baseline is shared by every lane. All new cards
across categories are packed into at most 50 rows per write; the independent
journal readback is shared. Unchanged event IDs do not get rewritten by the
GitHub publisher. Conditional GETs and 15-minute denied/rate-limit cooldowns are
retained as compact metadata in one existing `control_state` row. The row holds
no original article titles, URLs or bodies. Only fixed source IDs, bounded ETags,
health, official calendar times and typed quote observations are retained.

The Macro supplement makes at most nine feed requests (shared Fed/ECB remove
two), at most two original pages per selected HTML source, two price requests,
and three calendar requests once per six hours. Four secondary sources rotate
so all pinned secondary channels are visited within three intended ticks.
The minerals mesh has six regional groups, at most 13 extra requests per run,
a run-wide URL single-flight, shared existing primary originals, one worldwide
publisher substitute and two fixed batched Google discovery queries. No 195
country query multiplication occurs. Regional publisher provenance never
establishes event-country coverage. Google observations remain unverified.

## Release-time polling

The same control-plane Worker has a one-minute Cron Trigger. Each invocation
reads one indexed state row and exits without upstream requests outside official
release windows, during an already-polled minute, or after its quota lease
expires. Only a successful existing quota-gated GitHub run can renew the
12-minute lease. Cron cannot renew it itself. Thus a delayed/missing GitHub quota
check eventually holds release polling instead of spending an unbounded budget.
The extra indexed metadata read is at most 1,440 rows/day before public caching.
Quota snapshots are observational, not atomic account-wide reservations.

Official BLS iCalendar, FOMC HTML and ECB meeting calendars are refreshed with
DST-aware timestamps. The window starts two minutes before release and closes
20 minutes afterward. Matching critical feeds are polled; FOMC/BLS also have a
bounded direct original-page fallback when the feed has not exposed the release.
An old mutable BLS page cannot be accepted merely because the release is due:
its own publication clock must match the official calendar. BLS article aliases
share a source/instant event ID; later monthly releases have a different ID.
A missing calendar retains only previously observed dated events, with visible
health degradation. No fetched-at time is invented as a publication clock.

## Prices and evidence

The free Gold API XAU/XAG endpoints supply timestamped provider spot indications.
Quotes older than five minutes, future quotes, wrong currencies, missing zones
and nonpositive values are rejected. They are not exchange-certified live ticks.
At most 40 observations over 90 minutes are retained. Measured reaction requires
same-instrument, same-unit observations bracketing the event within five minutes
on both sides. An observed movement is never asserted to be caused by the news.
News publication never waits for quotes. No live FX price feed or consensus feed
is configured: those fields remain explicitly unavailable/null.

WGC/LBMA are official research/news sources, not live spot feeds. CFTC/CME news
is release discovery, not a claim that numeric futures positioning was ingested.
Original-page and publisher-feed observations have distinct evidence semantics;
third-party alternatives never inherit official status or independent verification.

## Consumer and recovery paths

- `/v1/public/macro-fastlane`: cached source health, official release schedule,
  current bullion indications and critical-minerals regional group health.
- `/v1/public/fastlane-intelligence?domain=macro` (or `rare_earth`): cached
  attributed research projection of the same journal, preserving evidence state,
  event identity, instrument relevance and separately measured quote reaction.
- Existing source-neutral machine and website journal endpoints remain available.
- `/v1/internal/macro-fastlane`: existing strong root-derived control-plane auth;
  typed snapshot GET/PUT. An untrusted public caller cannot arm the quota lease.

The Macro Economics desk panel reads one snapshot per five minutes while open.
The existing append-only Finds archive continues distributing derived news.
Critical-minerals reports and health remain under their existing category.
A deployment revision preflight prevents a producer from polling/writing against
an old Worker. Existing deployment completion and hourly recovery workflows resume
collection. Provider, calendar and quote failures remain visible in safe receipts.
No global completeness or guaranteed 1–2 minute end-to-end latency is asserted.

## Source-only admission during discretionary pacing holds

Production exposed a pacing hold with 2.17 million daily reads still available.
The existing preflight now exposes a separate `source_intake` grant only when
remaining provider headroom fits **all remaining five-minute source bundles**
plus protected account reserves. Each held-mode bundle admits at most 50 new
cards, packed into one write. The conservative allocation is 4,000 reads and
104 writes per remaining slot (including three existing collector checkpoints),
plus 100,000 read / 2,000 write incident margins.
The protected 750,000 read / 15,000 write reserves remain. Unknown or insufficient
provider counters still deny the grant. This is observational, not atomic.

This narrow grant does not run signing, review, R2 snapshot exports or latency
audit fan-out. It shares the already-read final journal with the append-only
static archive, so website delivery continues without a second D1 fetch. Archive
publication requires the existing branch to be seeded and shares one concurrency
lock with the hourly publisher and standalone static deployer. Retention sweeps
before/after intake and after critical release insertion prevent the 601-row
readability failure. Retention-withheld rows are not claimed delivered.

After complete verified journal readback, the five-minute publisher updates the
existing per-category authenticated collector checkpoints used by Predge's
continuity monitor. An actually unreachable category retains its prior success;
a healthy quiet poll records zero releases. These are source-check receipts,
never acknowledgements from Predge's own application. Predge reads the same
72-hour journal immediately on its next authenticated request, with no extra
exact-release delay or second ingestion. Partner polling and client receipt
remain separate from endpoint availability. The existing partner contract,
token, 500/day limit and pilot expiry remain locked.
