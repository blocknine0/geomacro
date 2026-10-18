# Three-domain news → structural output bridge (2026-10-18)

## Source of truth and scope

This is a bounded, **Supabase-free** extension of the EXISTING
`website-derived-news-continuity.yml` canonical first-party collector.
No additional scraping fleet, raw-feed database, paid API or duplicate engine.

- Every **qualifying distinct original release within the admitted collector
  budget** can become a Geomacro-owned 72-hour **unscored derived observation**.
  The publisher now classifies up to **200 items/category/collection** (was 50),
  sends 40-observation authenticated/idempotent D1 batches, and retains the
  existing 600-row cross-category D1 maximum and original/first-seen 72-hour TTL.
- The existing website/Find Cards and signed archival publication remain
  compatible, and the canonical original-native time and 15-minute delay (or
  conservative next-day 12:15 UTC for day-only releases) are unchanged.
- The control plane exposes strictly bounded D1 journal pages at offsets 0,
  250 and 500. A fail-closed consumer combines all pages, rejecting missing
  pagination metadata, incomplete cursors and duplicate IDs. **No new storage**.
- `GET /api/v1/intelligence/query?view=structural-72h` returns one deterministic
  record per currently retained, safely shareable derived release in the three
  categories, with optional `&domain=geopolitics|macro|rare_earth`.
  Records have event ID, domain/event family, native publication time,
  date precision, development kind, observed geography mention, normalized
  theme, Geomacro-authored observed-change and potential-relevance prose,
  and **explicit false verification/payment flags**. No source names, URLs,
  article titles, raw feed, numeric impact or invented facts.
- Existing POST on-demand intelligence now reads every bounded D1 page for
  country/category research hints (64 per query maximum), with safe previous
  reader fallback during a staggered Worker deployment. Hints never make a
  customer response payable or waive separate genuine qualification,
  commercial rights, signed product/readback and x402 delivery checks.

## Honest coverage and exclusions

"All sources" means **all accessible, actually admitted, source-native-dated,
classifiable new original releases within the bounded run/journal**. It does
NOT turn a source-inventory reference into an active feed, guarantee that an
unavailable/429 publisher has new releases, or certify 195 × 3 current cells.

Unreachable feeds, unclassified reports, release events outside the 72-hour
window, bad clocks and records that cannot satisfy the 15-minute delay remain
excluded. Where upstream attribution is obligatory, the no-source public
structural view *does not* present it as attribution-free licensed content.
Such cases need a separately approved presentation/licence contract.
The single-release signal is observation, **not** an independently
corroborated same-event commercial claim, exact metric, risk score, GRO
or Risk Indices event. Existing independent signed-product contracts remain
unaltered. A country name in a header remains a discovery hint.

The source collector and D1 are **best effort**; the max 200/category/run,
40/batch, 600 retained and 64 private query hint ceilings deliberately protect
free provider rates, Cloudflare writes, payload sizing and x402 operations.
High-volume sustained periods can still exceed these bounds: record truncation,
category/source diagnostics and provider failures, then revisit quotas rather
than claiming infinite coverage.

## Release / acceptance sequence

1. Review and pass `src/__tests__/derived-news-structural-bridge.test.ts`,
   existing `auto-ingest-72h-structured-output`, `website-derived-news-continuity`,
   `find-card-v1`, privacy, pricing, signing and Product CI.
2. Merge through protected PR. Verify **Deploy D1 Control Plane** on exact
   main SHA before publishing the new website/API reader (else the new
   structural GET correctly reports 503 for old unpaged Worker).
3. Check an actual source-collection GitHub run: each category source-health
   receipt, qualified accepted counts, no raw material, successful D1 write
   ACK for *each* bounded batch, and independent complete page readback.
4. Verify `GET https://geomacro.live/api/v1/intelligence/query?view=structural-72h`,
   three counts, distinct IDs, original timestamps, no source identity and
   explicit non-payable status. Check domain filtering.
5. Independently test paid POST still fails closed without genuine commercial
   proofs; avoid live settlement/funds. Monitor D1 row cap and 72-hour expiry.

A green test or PR merge alone is not proof of a new live event, exactly
complete active-source inventory, paid readiness or website deploy parity.
