# Three-category automatic derived-news continuity

The existing primary collector reads original-publisher feeds/indexes for
geopolitics, macro/FX and critical minerals, derives structured website Finds,
and writes only derived cards to D1. Native original dates, category matching,
fixed issuer hosts, duplicate handling and the existing 15-minute website delay
remain mandatory. Raw upstream titles/URLs/articles are not public products.
The existing country-specific on-demand engine remains separate; a global
publisher feed does not certify current evidence for every one of 585 cells.

The primary Cloudflare D1 derived-news publisher is scheduled at :07/:22/:37/:52
UTC (15-minute polling). The offset :14/:29/:44/:59 backstop checks the
last *successfully completed* primary publisher run and recovers when that clock
has reached 22 minutes. The common non-canceling writer lock prevents competing
writes when the primary is slow. Successful recent collection skips the backstop. A failed
or timed-out trusted main orchestrator can wake this same recovery; frozen
legacy tasks must not suppress independently working news ingestion. Recovery
still runs only canonical main with protected production credentials under the
same writer concurrency group. The existing two workflows have more 15-minute slots; no new service or paid API.

A verified, signed, exactly read-back D1 batch is current free website delivery.
Its six-hour B2 backup has separate health: quota hold or archive failure emits
an explicit warning and archive-degraded receipt, without claiming current B2
proof or converting working D1 delivery into a failed collection run. Source,
signer, signature, D1 publication/readback failures still fail. The account
B2 governor and all commercial hot-snapshot eligibility remain unchanged.
A backstop push no longer forces duplicate collection when a primary success
is recent; explicit manual recovery can still force a run.

This is 15-minute best-effort near-real-time polling, not an exact SLA or an
instantaneous feed. GitHub schedule delays, upstream outages, quota limits and
periods without a qualifying original release remain visible. The publisher
continues to read all three categories each cycle, but official source response
rates, dates, or missing articles can legitimately produce zero new Finds. An empty current category is never filled with invented
news or refreshed original timestamps. Free unscored Finds do not establish
independent same-event verification, commercial rights or paid GRO readiness.

Verify a real protected run on the new 15-minute cadence with three category
read receipts, signed-batch verification, exact D1 readback, truthful original
dates and privacy-safe public readback. Check the +7-minute backstop skips a
recent primary and catches up a missed primary; inspect completed workflow
runs, not only YAML. A green contract/unit test alone is insufficient live
evidence. Previous 30-minute production successes do not prove the new cadence.

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
| `website-derived-news-continuity.yml` | `7,22,37,52 * * * *` | Cloudflare D1-only derived journal and signed free Finds; quota-governed B2 backup remains six-hour cadence |
| `website-derived-news-cadence-backstop.yml` | `14,29,44,59 * * * *` | Same Cloudflare D1 publisher only when last confirmed primary completion is at least 22 minutes old or manual recovery requested |

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
