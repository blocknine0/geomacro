# Three-category automatic derived-news continuity

The existing primary collector reads original-publisher feeds/indexes for
geopolitics, macro/FX and critical minerals, derives structured website Finds,
and writes only derived cards to D1. Native original dates, category matching,
fixed issuer hosts, duplicate handling and the existing 15-minute website delay
remain mandatory. Raw upstream titles/URLs/articles are not public products.
The existing country-specific on-demand engine remains separate; a global
publisher feed does not certify current evidence for every one of 585 cells.

The primary Cloudflare D1 derived-news publisher is scheduled **hourly at :07
UTC**. Its independent hourly :22 backstop checks the last *actually successful*
primary publication and recovers if the completion clock is at least **70 minutes** old. The common non-canceling writer lock prevents competing
writes when the primary is slow. Successful recent collection skips the backstop. A failed
or timed-out trusted main orchestrator can wake this same recovery; frozen
legacy tasks must not suppress independently working news ingestion. Recovery
still runs only canonical main with protected production credentials under the
same writer concurrency group. The existing two workflows now have one primary and one conditional recovery slot per hour, no new service or paid API.

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
| `website-derived-news-cadence-backstop.yml` | `22 * * * *` | Same Cloudflare D1 publisher only when last confirmed primary completion is at least 70 minutes old or manual recovery requested |

Production uses existing `GEOMACRO_COMMERCE_LEDGER_TOKEN`, Cloudflare D1, signer
credentials and B2 account budget.

The checked-in website presentation is covered by a separate approved website
lock and may still display the previous 30-minute collection copy. This backend
cadence change intentionally does not alter that locked UI; the user-facing copy
must be corrected through its dedicated founder-approved website publication.
The Actions and D1 readback receipts, not the old UI label, determine the
observed production cadence. Legacy `auto-ingest-news.yml` stays
disabled because it depends on the frozen Supabase pipeline. Prediction-market
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
