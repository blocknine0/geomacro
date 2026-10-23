# Geomacro Material News → GRI Evidence Review (three domains)

**Owner directive:** ingest market-moving and resolution-like developments similar to
the event types once useful for prediction-market questions. **Do not create a
prediction market, implied probabilities, market prices or made-up index scores.**

## Three original-publisher categories

| Category | High-impact original release triggers | Follow-up materiality review |
| --- | --- | --- |
| Geopolitics | Armed/security changes; sanctions/export restrictions; cross-border policy; diplomatic agreement; official security alerts | Independent fact/country, implementation, escalation or reversal |
| Macro/FX | Central-bank policy, official price/inflation release, tariffs/trade restrictions, financial-stability warning | Verify official numeric period/value or implementation (never infer CPI or FX value from title) |
| Critical Minerals | Production/processing milestones, mineral export controls, mine permits, strategic financing, offtake/supply agreements | Independently verify commissioning, permit, financing, shipment or enforceable restriction |

Ordinary "announcement", "research", "official update", unqualified raw posts
and syndication are **not enough** for a material GRI event. A category with
no genuinely qualifying original can legitimately produce zero candidates.

## How ingestion and GRI review are separated

1. The **primary** `website-derived-news-continuity.yml` runs at the
   existing best-effort hourly :07 UTC schedule. The `auto-ingest-news.yml`
   backstop runs at :37 and only rereads original feeds through the **same**
   canonical D1 writer if the previous verified publisher is stale. This
   avoids a second round of redundant original scraping and extra B2 GETs.
2. Both the canonical publisher and its genuine recovery path build a
   `geomacro.material-original-gri-review-queue.v1` from only **Geomacro
   derived** events that already passed original-clock and 15-minute publishing
   windows. The candidate JSON retains three categories, original timestamps,
   safe event kinds and review focus, opaque derived IDs, no raw text/URL,
   no probability, severity or impact score.
3. **Auto Ingest News** also generates a read-only candidate shortlist from
   the existing **72-hour Geomacro-derived Cloudflare D1 journal on every run**,
   including when recovery correctly skips because the primary writer is
   current. Such a readback explicitly declares
   `original_source_reverified_in_this_run=false`; it cannot become a new
   source qualification or update a GRI value.
4. GitHub Actions exports only derived private-review JSON as a separate
   **three-day-retained** artifact. The public D1-derived newsroom remains
   strictly 72-hour retention and no raw source storage. The automatic
   review queue contains `gri_scoring_authorized=false` and
   `risk_indices_update_authorized=false` until valid independent
   country/category evidence, rights approval and GRO/GRI certification
   pass existing protected workflows.
5. A future authorised private reviewer may use these opaque event IDs to
   independently verify the exact original article/evidence, native clock,
   country/category, permission, signature and methodology. **Only after**
   successful reviewed current GRI and B2/D1 readback may real Risk Indices
   reflect a change. Quiet news periods do not imply zero risk and do not
   refresh old event clocks.

**No Supabase, real-money x402, raw publisher content, source credential
leakage or silent new prediction-market product.** Fixed capability prices
and the founder-owned structured-output commercial license are unchanged.

To verify: run `node --test scripts/tests/material-gri-news-review.test.mjs`,
then inspect `material-gri-original-review-<run>.json` or
`auto-ingest-material-gri-review-<run>.json` among GitHub Actions artifacts.
A pass means source-free material *triage* was produced, not commercial GRI 200.

## 195-country source-to-GRI review worklist (2026-10-18)

Primary hourly publisher, secondary catch-up and `Auto Ingest News` now convert
their current 72-hour **Geomacro-derived-only** material queue into
`geomacro.material-gri-country-evidence-worklist.v1`. The worklist uses an
**exact** canonical 195-country name/ISO lookup read from the existing
`src/lib/canonical-country-registry-195.ts`, never substring inference.
Unresolved cross-border/geographic wording is retained with `country_iso3:null`
and requires proper country-level certification rather than guessing.

For every candidate the worklist records only opaque Geomacro-derived ID,
category, event kind, native source date, optional exact ISO3 and explicit
requirements: reread the genuine first-party original bytes, verify issuer
clock and independent same-event sources when the chosen product methodology
requires them, establish actual lawful source use and separately sign both
the country/category certificate and canonical GRI scored review. A ≤6h
`candidate_within_6h_original_recheck_window` flag is **only** an
operational check hint, NOT a GRI freshness/rights/impact certificate.
No original URL, article body/title, publisher source identity or estimated
risk score is included. Retention is **three days** in Actions private artifacts.

The only numerical GRI v1.2 publication path remains the existing protected
`gri-v12-supabase-free-reviewed-current.yml`. Its
`gri_reviewed_current_ready` event requires genuine independently pinned
signed B2 reviewed evidence and independently signed country-category
certificates; the GRI workflow independently verifies original native time,
rights, scoring, GRI v1.2 methodology, B2 historical continuity and live
B2/D1 hash/readback. Its successful `workflow_run` then wakes the existing
verified-parent Risk Indices workflow. The **news workflow never issues that
trusted ready event**, signs authority grants, writes GRI/Indices, or pays.

**Remaining external dependencies:** Genuine source-specific rights (an
owner's Geomacro-output licence cannot confer upstream article permission),
independent facts/reviewed-GRI and signed country certificates, previously
pinned verified historical B2 anchor, current production source SHA and free
B2 quota. Quiet news periods must keep source-native clocks and last verified
scores truthful, rather than producing invented numerical changes or
extending old snapshot freshness.

Acceptance: `node --test scripts/tests/material-gri-news-review.test.mjs
scripts/tests/material-gri-country-evidence-worklist.test.mjs`. GitHub
artifacts: `primary-gri-country-review-*`,
`recovered-gri-country-review-*`, and `auto-ingest-gri-country-review-*`.

## One shared 72-hour Intelligence journal → all GRI materiality review (2026-10-24)

The public website's three categories and **the private GRI review queue**
now read the exact same bounded Cloudflare D1 derived-news journal. Under
already-enrolled, revocable Pallab/Suman standing derived consent, the
`Standing Delegated Derived Contract No Funds` hourly/wakeup job reads
the verified, paginated 72h D1 source-neutral journal (at most 600
retained IDs) and routes **ALL** retained cards, including nonmaterial
context, through 25-source-record-per-category deterministic review batches.
This fixes the previous first-page/first-25 implicit omission. No extra
upstream publisher GET, second source collection, new B2 write, Supabase,
new cron, human private key or USDC settlement is introduced. The
`complete-intelligence-gri-review-<run_id>` artifact is source-free
and retained for 3 days. It contains country/category review *hints*
for legitimate material events plus counted nonmaterial context; no raw
original article body, URL, credential, independent human signature or
new commercial licence.

The **product distinction** remains mandatory:
* Geomacro creates and can license its own original structured analysis
  subject to underlying rights; the public newsroom is derived-only and
  its no-raw policy does not itself prohibit offering original analysis.
* A blanket *per-article external commercialization certificate* is not
  inherently a legal prerequisite for an independently written report.
  Instead record/reuse genuine applicable source-use terms and attribution
  obligations at the **source/dataset/API scope**; item-specific exceptions
  still need handling. A publisher's raw-article copyright, contractual
  restrictions, database rights or legally required credit do not
  disappear merely because Geomacro rewrites/summarizes facts.
* All newsroom items route to **materiality review**, not all materialize
  numeric GRI changes. The separate existing *human-reviewed GRI v1.2*
  publisher requires real first-party proof, independent same-event
  corroboration, lawful source use, exact signed numerical review,
  country/category certification and B2-history continuity.
  An independently reviewed **automated** scored GRI product, if
  introduced, must have its own accurate authority/profile; one-time
  policy consent cannot silently manufacture Suman's future human
  signatures. No arbitrary website card is chargeable by default.
* Genuine review input and accepted current signed Intelligence/GRI/Risk
  Indices must still receive immutable B2/D1 readback before the paid
  endpoint or Deep Health can claim readiness. There is no promotion from
  `official_feed_candidate_unscored` to `CERTIFIED` without actual evidence.

Verification:
`node --test scripts/lib/complete-intelligence-gri-review.test.mjs`
and source path
`scripts/ops/triage-all-website-intelligence-for-gri.ts`.
A successful *review-batch* job is not 3/3 signed hot acceptance.
