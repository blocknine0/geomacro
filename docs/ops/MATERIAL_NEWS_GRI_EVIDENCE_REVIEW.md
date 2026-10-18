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
