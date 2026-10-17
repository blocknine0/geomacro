# Query-time GOV.UK undated Atom → first-party original proof recovery

## Production evidence / bottleneck (2026-10-12)

Post #2095 live no-funds [run #38224838375](https://github.com/blocknine0/geomacro/actions/runs/38224838375)
queried CHN lithium across **all three commercial categories**:
12 bounded HTTP attempts; direct first-party GOV.UK/UN News publishers reachable;
World Bank annual observations available; **0 private original candidates / 0
original article-page attempts**; GDELT DOC 3 network failures; no payment,
raw B2/Supabase or current signed result. Reading article HTML better in #2095
did not help because the existing on-demand Atom parser discarded an entry
BEFORE it could reach first-party article verification if Atom <published>
was absent. The separately deployed 30-minute pipeline already uses an
allowlisted exact article-page first-published clock for such feeds.

## Fix

On demand, ONLY the two pinned GOV.UK FCDO and UK DBT Atom issuers may
forward country/topic-relevant, HTTPS first-party article links into a
private verification queue when their entry lacks <published>. This is an
**undated lead**, not a dated or scored record. Its metadata explicitly has:

- `feed_item_published_at: null`
- `source_native_feed_publication_date_verified: false`
- `undated_atom_original_page_pending: true`
- original Article URL validated against the issuer family and pinned path
- `publisher_article_page_date_verified: false`, independent claim/rights/
  signing/payment all `false`.

The existing same-request verifier (maximum four distinct publisher-family
article GETs, strict HTTPS host/path, no redirects, 5-second request timeout,
384KiB original HTML cap) may then authenticate a **precise, real, recent
`govuk:first-published-at`** or other shared strict original-clock metadata.
An `<updated>` date, stale/future <published>, missing clock, page with only
modified time, two contradictory publication times or an undated non-GOV.UK
RSS publisher never qualifies. Headline duplicates without proven timestamps
are not merged into same event; different first-party authors remain distinct.

No new batch cron, source/provider entitlement, signer, B2/D1/Supabase write,
customer payment or partner call is introduced. Source feed observation itself
does **not** become a score when this recovery path finds a candidate.

## Future acceptance

The production on-demand no-funds job exercises CHN lithium. It may still
find **zero** China/lithium GOV.UK articles if the two actual recent feeds
have no such item, and it may still report 0 verified signed events because
commercial independently reviewed same-event bundles are missing. That is a
true no-charge result, not a failed test of this deterministic source-specific
fallback.

This closes a concrete query-time *missing Atom clock → never check original*
software gap. Genuine live signed/purchasable intelligence remains gated on
actual relevant evidence, independently signed reviewer results, source
rights and cryptographically verified GRO delivery.
