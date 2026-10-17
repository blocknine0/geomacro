# 30-minute original-first-party verification recovery (12 October 2026)

## Actual production failure addressed

Observed in scheduled [Actions run #38220858705](https://github.com/blocknine0/geomacro/actions/runs/38220858705):

- All three official original-publisher source pairs were reachable, but
  **zero new topical current qualified originals** across geopolitics, macro
  and critical minerals. The D1 cross-poll fingerprint checkpoint reported
  zero newly observed originals and the private scoring workflow was skipped.
- FCDO/GOV.UK Atom: 20/20 lacked `<published>`; 10 had accepted original
  links; 2 article GETs and 0 precise 24-hour dates; one page failed the
  previous **128-KiB hard cap**, one was correctly stale.
- Statistics Canada: 60/60 Atom entries lacked `<published>`; bounded
  same-publisher page readbacks returned missing original metadata (do not
  replace with feed `<updated>`).
- Natural Resources Canada: 50/50 Atom entries lacked `<published>`;
  2 original pages had invalid publication-time grammar (must remain
  unverified).
- UK DBT: 20/20 lacked `<published>`; both sampled article publication
  dates were stale (correctly fail).
- Original publisher sampling repeatedly spent one of two article GETs per
  source on the *same first accepted link* every 30-minute cycle, even if
  that link was stale. That halved novel review opportunities in many feeds.

## Permanent limited changes

1. `selectRotatingFirstPartyPages()` now rotates both page-selection slots
   deterministically through the accepted, deduplicated first-party URL pool.
   At most **two same-publisher article GETs/source** per cycle, no redirects,
   no credentials, no 401/403/429 circumvention. For large lists, a full
   round-robin eventually samples every validated link without repeatedly
   consuming 50% of the budget on one old first article.
2. `official-original-article-date.mjs` increases first-party *HTML only*
   bounded hard byte limit from 128 KiB to **384 KiB** to permit real
   GOV.UK pages that previously failed `BODY_TOO_LARGE`. Both the
   Content-Length preflight and actual streaming byte-count guard remain.
   The four-second per-page timeout, exact host/article-path allowlist,
   max two probes/source, strict publication timestamp with explicit zone,
   contradictory-date rejection, and no persistence of HTML/article title
   remain in effect. No alternate domain, RSS timestamp fallback or synthetic
   publication time was added.
3. Tests exercise all page slots (even/odd list sizes), fresh versus stale
   first-party article clocks, oversized pages, missing metadata, and
   prevention of private-to-commercial automatic promotion.
4. Existing automatic 30-minute source pulse on `main` triggers for these
   changes, and operator can inspect only safe aggregate verification
   diagnostics. Zero additional D1/B2/Supabase writer or AI call budget.

## Honest remaining barriers

This expands verified original-page **discovery**, but cannot manufacture a
fresh relevant event if the government publishers truly did not publish one.
A new candidate is still `eligible_for_scoring:false` until the existing
review path independently verifies exact country/commodity and article
relevance. The separate signed same-event reviewer requires independently
authored same-event evidence, valid commercial-derived rights receipts and
reviewer signature. Existing signed GRO/B2/canonical x402 gates still apply;
no automatic payment, no raw publisher material in customer output.

Production acceptance: the post-merge 30-minute pulse should report a
higher actual page acceptance count **if source pages carry valid precise
recent dates**; otherwise the receipt must truthfully continue reporting
0 new verified originals and no private scoring, rather than a fabricated
success.