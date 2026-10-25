# Private OSINT source intake and bundle reader

Eight owner-supplied GitHub repositories were inspected as source discovery
references. No source code or publisher articles were imported. The audit in
`config/private-osint-eight-repository-intake.v1.json` records inspected tree
and file hashes, every distinct candidate endpoint and its outcome.

419 distinct candidates yielded 217 new accepted HTTPS news-feed/index
endpoints and 57 already registered endpoints, including one canonical alias.
The accepted private inventory has 369 distinct URLs. These are endpoints,
not 369 independent publishers: overlapping Google News RSS searches share
one index-item identity for an identical category, title and source-feed time.
Existing source access holds, denied/empty/malformed feeds, missing native
clocks, oversized responses and stale archives are not newly admitted.
OSINT-WatchDog contains only a README; Argus documents an existing GDELT
integration and contributes no additional implemented RSS endpoint.

Every private tick rechecks the accepted inventory. At most eight feed
requests run concurrently, with two slots per host. A large search-index
catalogue cannot occupy all slots while unrelated publishers are pending.
Index reads have a bounded 3.5-second timeout. Transport and parsing failures
produce no news records and are excluded from working endpoint counts.
Three-category selection, a bounded 768-record tick ceiling, 4,000-row private
ring and 25-hour source-clock retention remain explicit. No universal
195-country breaking-news latency guarantee is asserted by this intake.

## One request, all three categories

`GET /v1/internal/private-osint-15m?view=bundle`

Use the existing purpose-scoped private OSINT Bearer credential. Root/admin,
public and partner credentials are not accepted. The response is
`geomacro.private-osint-news-bundle.v1`, with:

- `categories.geopolitics.items`, `categories.macro.items`,
  `categories.rare_earth.items`;
- up to 100 records per category, at most 300 records in one bundle;
- one D1 batch transaction for all categories;
- `has_more` and `next_cursor` for keyset pagination;
- an optional `country=IND` filter, bound to the cursor;
- a fixed first-page `snapshot_at` so later arrivals do not appear midway
  through the same paginated bundle.

For another page, repeat the request with `cursor=<next_cursor>`, retaining
the same country filter. A null cursor ends the bundle. Completed categories
are not reread on subsequent pages. The category/native-clock index makes
these reads bounded without scanning successive OFFSET pages.

Only the existing sanitized factual projections are returned. Source article
text, titles and original URLs are not added. Independent event verification
is not an ingestion prerequisite; bundle reads do not authorize public,
signed, partner or paid publication.

## Free-tier write pressure and rollout

Actual new ids retain immediate immutable database `first_seen_at`. Identical
news polls refresh `last_seen_at` at most every six hours; unchanged source
check timestamps refresh at most hourly. State changes are persisted at once.
Duplicate-only batches avoid the full ring-pruning scan. Existing rows use
UPDATE, so a concurrent capacity eviction cannot be resurrected without the
atomic hard-cap pruning used by a new-id insert. These measures reduce
repeated writes; they do not certify an account-wide provider quota.

Existence checks and exact readback use one parameterized IN query each.
Source-state upserts are grouped into at most 16 rows per SQL statement.
The maximum valid write (20 news records and 32 source checks) uses 27 D1
queries and at most 65 bindings in one statement, under the published Free
limits of 50 queries per invocation and 100 parameters per query:
https://developers.cloudflare.com/d1/platform/limits/
Production receipts report whether these bundled writer reads were observed.

The publisher now prefers one three-category bundle readback. During a
rolling deployment only an older reader's unknown-query HTTP 400 permits
one legacy-page fallback. Authentication, storage, malformed HTTP 200 and
projection failures are never bypassed. Only an actual new bundle response
sets `private_three_category_bundle_readback_verified:true`.

Release acceptance requires the D1 migration/deployment and a real protected
private scan/write/readback. Offline tests cover source admission, index
deduplication, expanded per-host scheduling, real SQLite write coalescing,
bundle pagination, country cursor scope, private credentials and corrupted
projection rejection. Production receipts contain counts only.
