# Three-category automatic derived-news continuity

The existing primary collector reads original-publisher feeds/indexes for
geopolitics, macro/FX and critical minerals, derives structured website Finds,
and writes only derived cards to D1. Native original dates, category matching,
fixed issuer hosts, duplicate handling and the existing 15-minute website delay
remain mandatory. Raw upstream titles/URLs/articles are not public products.
The existing country-specific on-demand engine remains separate; a global
publisher feed does not certify current evidence for every one of 585 cells.

The primary Cloudflare D1 derived-news publisher is scheduled **hourly at :07
UTC**. Its two independent **:22 and :52 UTC** backstop checks verify the last *actually successful*
primary publication and recover if its completion clock is at least **70 minutes** old. The common non-canceling writer lock prevents competing
writes when the primary is slow. Successful recent collection skips the backstop. A failed
or timed-out trusted main orchestrator can wake this same recovery; frozen
legacy tasks must not suppress independently working news ingestion. Recovery
still runs only canonical main with protected production credentials under the
same writer concurrency group. The existing two workflows now have one primary and two conditional recovery checkpoints per hour, no new service or paid API. A separate trusted completed three-domain official-source pulse also wakes this same freshness-guarded recovery if an hourly GitHub schedule is delayed. Duplicate source collection is suppressed while the last primary success remains recent.

A verified, signed, exactly read-back D1 batch is current free website delivery.
Its six-hour B2 backup has separate health: quota hold or archive failure emits
an explicit warning and archive-degraded receipt, without claiming current B2
proof or converting working D1 delivery into a failed collection run. Source,
signer, signature, D1 publication/readback failures still fail. The account
B2 governor and all commercial hot-snapshot eligibility remain unchanged.
A backstop push no longer forces duplicate collection when a primary success
is recent; explicit manual recovery can still force a run.

This is best-effort **hourly** polling, not an exact one-hour SLA or an
instantaneous feed. The original-source 15-minute website-display delay is
unchanged. GitHub schedule delays, upstream outages, quota limits and
periods without a qualifying original release remain visible. The publisher
continues to read all three categories each cycle, but official source response
rates, dates, or missing articles can legitimately produce zero new Finds. An empty current category is never filled with invented
news or refreshed original timestamps. Free unscored Finds do not establish
independent same-event verification, commercial rights or paid GRO readiness.

Verify a real protected run on the new hourly cadence with three category
read receipts, signed-batch verification, exact D1 readback, truthful original
dates and privacy-safe public readback. Check the +15-minute offset backstop skips a
recent primary and catches up a missed primary; inspect completed workflow
runs, not only YAML. A green contract/unit test alone is insufficient live
evidence. Previous 15-minute/push-triggered production successes do not prove that a
new hourly scheduled run completed successfully.

Canonical `GET /api/v1/intelligence/query?view=finds` serves the same free
signed feed. It uses public-read HMAC and burst controls like the category
GET aliases; no GET in that handler performs fulfillment or settlement.
Canonical/category POST and all x402 payment handlers retain distributed,
fail-closed security. A D1 budget outage must not turn free news GET into a
payment-class failure. This website middleware change requires normal hosting
publication; backend automatic collection is deployed by the workflow merge.

## Production schedule and controls (UTC)

| Workflow | GitHub Actions UTC schedule | Writes |
| --- | --- | --- |
| `website-derived-news-continuity.yml` | `7 * * * *` | Cloudflare D1-only derived journal and signed free Finds; quota-governed B2 backup remains six-hour cadence |
| `website-derived-news-cadence-backstop.yml` | `22,52 * * * *` | Same Cloudflare D1 publisher only when last confirmed primary completion is at least 70 minutes old or manual recovery requested |

Production uses existing `GEOMACRO_COMMERCE_LEDGER_TOKEN`, Cloudflare D1, signer
credentials and B2 account budget.

The checked-in website presentation is covered by a separate approved website
lock and may still display the previous 30-minute collection copy. This backend
cadence change intentionally does not alter that locked UI; the user-facing copy
must be corrected through its dedicated founder-approved website publication.
The Actions and D1 readback receipts, not the old UI label, determine the
observed production cadence. The legacy Supabase/Postgres `recover-news-ingest`
job inside `auto-ingest-news.yml` remains permanently disabled, while its
separate Supabase-free `ingest-supabase-free-derived-news` job runs the existing
verified D1 recovery workflow on a guarded hourly checkpoint. Prediction-market
jobs, paid GRO admission, x402 settlement and raw upstream data publication
remain disabled/unchanged. Current website delivery is free derived output,
not a substitute for independently reviewed paid Intelligence/GRI/Risk Indices.

Operator checks: GitHub Actions > Website Derived News Continuity > recent
scheduled successful run > three domain metrics and independent signed D1
readbacks. Compare against the Website Derived News Cadence Backstop skip/catch-up
result and the Cloudflare `/v1/public/automated-finds` and
`/v1/public/website-derived-news` endpoints. Failed source/signing/D1 reads
must alert through a failed Action; never convert failure to fabricated events.

## Data persistence and source completeness

**Actual persistence:** The authenticated collector writes only qualified
Geomacro-owned derived cards to the existing Cloudflare D1
`website_derived_intelligence` table, idempotently using `INSERT OR IGNORE`
with deterministic story IDs. Existing privacy-safe published journal retention
is at most **30 days** by *original release timestamp* and **600 stored rows**
and public reads return up to **250**. Do not claim that all upstream article
data is saved. Source URLs, raw titles, original bytes, and publisher IDs are not
persisted by the free website publisher. The existing signed free Finds snapshot
is read back from D1 each successful run; its separate six-hour B2 backup can be
quota-held and then must explicitly report a degraded archive, not a fake backup.
No current paid-product GRO/GRI readiness is inferred from free Finds.

**Free-source health evidence:** Each scheduled primary (and actual catch-up)
records a sanitized `artifacts/derived-news/source-health.json` receipt as a
GitHub Actions artifact for 14 days, including all three category counts, indexed
source failures, failure classes, diagnostic consistency and actual run SHA/time.
Only fixed source-lane indexes and coarse failure classes appear; no original
headlines, URLs, article bodies, keys, or source payloads are written to CI.
The hourly receipt distinguishes healthy original feed transport from actual
eligible newly published findings. Missing/failed sources remain degraded.
The collector continues using remaining healthy original sources and fails a
category if **all** original feeds fail. Source-native publication clocks,
country/category relevance, source provenance, rights and free unscored
publication restrictions remain enforced.

This hourly free newsroom is not a blanket activation of every third-party
free API or a promise that all configured endpoints will stay available. Other
source-pulse and official-series refresh workflows have distinct licensed
content, update clocks and quotas. Their approved upstream service constraints,
historical certification and free-tier budgets must be audited separately, not
silently replaced with hourly writes.

The website copy is under its own approved baseline lock; it may still say a
previous polling interval until a separately approved hosting publication.
GitHub Actions actual run evidence and D1 signed/public readbacks, not that
older UI text, determine the authoritative scheduled-news state.

## Confirmed upstream degradation and bounded first-party recovery

The first hourly post-merge D1 publisher run (2026-10-17T15:19Z) reported
11/11 healthy Geopolitics feeds, 15/18 healthy Macro feeds, and 11/13 healthy
Critical Minerals feeds. The three Macro failures correspond to BLS RSS lanes
and returned HTTP 4xx. An HTTP access refusal is NOT retried using another
identity or third-party proxy, and cannot honestly be called a working source.
Existing other official Macro feeds continue to supply eligible originals.
The three fixed BLS native Atom lanes are collected **sequentially** to avoid simultaneous same-host requests: all other official feed lanes remain parallel and their original stable diagnostic indexes are retained. This reduces simultaneous first-party 4xx failures but does not bypass a publisher refusal or guarantee uptime.
The Australian minister RSS source gets one *same-origin, fixed-URL* retry
only after a real timeout, never after HTTP 403/429/500 or a redirect. The IEA
critical-minerals index now reports HTTP refusal, invalid MIME, empty body,
timeout and other network exceptions separately, rather than silently
returning an unexplained unavailable result. All native release dates, 15-minute
website embargo, D1-only derived persistence, source rights and x402
restrictions are unchanged.

External source availability cannot be guaranteed permanently by our code.
If a first-party source requires provider authorization or rejects automated
access, obtain provider approval or activate a separately verified permitted
first-party alternative. Never silently replace the source with a scraped
copy or label an inaccessible feed as healthy.

## Schedule-delay hardening (2026-10-17)

The current Github clock cannot guarantee precisely hourly collection: primary `:07`
cron may start late or be skipped. The `:22` and `:52` backup checkpoints
run a **read-only GitHub publisher-success test first**; both use the already
verified 70-minute expiration and existing noncanceling publication lock. A
completed trusted `Three-Domain 30-Minute Original Publisher Pulse` workflow,
in addition to the original orchestrator, can wake the backstop. All wakeups
remain restricted to canonical main and protected production credentials.
Actual successful D1 publication and signed readback, not a queued cron or a
scheduled start timestamp, are the only success signals. The extra checks
cannot provide an SLA if GitHub Actions or the upstream services are down.

## Verified recovery clock across two backup checkpoints

An earlier two-checkpoint hourly backstop accepted only successful
`website-derived-news-continuity.yml` completion timestamps. If the :07
primary was missing and a protected :22 catch-up genuinely published to D1,
the :52 backup would still consider the **primary** stale and could waste
source/provider quotas by performing a second collection within 30 minutes.
Conversely, GitHub labels successful *no-op* recovery checks as green; a green
run is not a successful publisher clock.

The cadence verifier now first trusts the completed canonical primary as
before. **Only when the primary is stale**, it reads up to eight completed main
backstop runs. A backstop counts as a freshness reset solely when its actual
`catch-up-derived-only` job finished successfully with all three confirmed
steps: publish to existing D1, independently verify the signed three-category
Finds and independently read back the source-private D1 journal. The job's
completed timestamp—not the workflow's `updated_at`, scheduled timestamp or
any upstream article date—becomes the recovery clock. Missing, skipped,
failed, untrusted-branch, future-dated or unverified attempts do not count.
A GitHub job metadata lookup outage never fabricates recovery success and
does not suppress overdue primary recovery.

This reduces duplicate recovery reads while keeping the 70-minute timeout,
:07 primary/:22 and :52 recovery slots, trusted source-pulse wakeups,
non-canceling writer lock, Supabase-free D1 publication, no-funds gates and
quota-governed B2 archival unchanged. It does **not** make provider services
permanently available or verify 585 country-category current commercial
products. Exact GitHub cron timing remains best effort.

## Permanent Auto Ingest News activation (2026-10-18)

`.github/workflows/auto-ingest-news.yml` is now a real GitHub Actions
entry point, not a manual green/skipped placeholder. It has
`workflow_dispatch` (a direct bounded operator recovery) and an independent
`37 * * * *` UTC cron. A main-branch workflow-path push runs one canary
so the wiring can be accepted immediately after merging.

**Important architecture:** The active job does NOT invoke
`scripts/ingest-news.js`, the historical Postgres/Durable Object structuring
batch or Supabase Edge. Instead it calls the existing
`website-derived-news-cadence-backstop.yml` as a reusable workflow with
inherited production credentials and read-only GitHub Actions metadata access.
That existing audited backstop checks its normal last-successful-source-proof
70-minute clock, distinguishes a signed and independently read-back actual
recovery from a green/no-op run, and holds the very same
`geomacro-website-derived-news-continuity` writer mutex as the hourly
:07 publisher and :22/:52 backup. The new :37 check therefore cannot overlap
a real current writer or issue another read simply because the calendar
changed. Direct manual dispatch retains its existing deliberate force mode.

The :37 slot is a **third independent GitHub scheduling chance**, not a
guaranteed timer: if the :07 primary succeeds it normally becomes a no-op;
if the :22 backup succeeds the latest real D1 publication proof prevents a
second source poll; if either is genuinely stale the normal published
three-category D1 writer runs. Checked output remains signed unscored Finds,
15-minute delayed, source-private, free and never automatically payable.
The historical `recover-news-ingest` job still uses
`if: ${{ false }}` so dormant Supabase secrets/logic are never executed.

Acceptance is NOT a green no-op alone: verify an exact-main Auto Ingest
News workflow run with live `ingest-supabase-free-derived-news` and
`catch-up-derived-only` job contract; inspect the decision JSON.
A genuine recovery, when needed, must show successful D1 publication,
verified signed Finds and independent public D1 readback. Keep the separate
old 503 paid-product/degraded provider/B2 quota status visible.
