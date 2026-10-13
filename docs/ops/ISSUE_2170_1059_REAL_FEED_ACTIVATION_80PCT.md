# Issue #2170 — 80% of 1,059 source-reference activation: honest measurement

The requested target is **848 physically usable, independently connected
RSS/API feed transports**, not 848 appearances of existing catalogue
references across three categories.

## Actual baseline (13 October 2026)

Production source catalog [run #38385952870](https://github.com/blocknine0/geomacro/actions/runs/38385952870)
contained 1,059 **domain/lane** references: 467 geopolitics, 459 macro/FX,
133 critical minerals. This includes at least 419 refs that cannot be
converted into standalone current feeds without a change in rights/
authorization or meaning:

- 152 Telegram candidate refs not authorized for automated message ingestion
- 15 historical-only source refs
- 66 existing-family aliases, not 66 extra physical providers
- 186 held/unverified operator candidates

That leaves **at most 640 other references** even if each of the 535
discovery roots were somehow usable as an actual RSS/API feed. Most roots
are HTML websites, not documented machine feed endpoints. Thus the
current catalogue's 1,059-reference denominator cannot honestly show
80% *distinct physical active feeds* under current registrations.
Reaching 848 distinct feeds would require identifying and authorizing
hundreds of **new actual publishers/feed endpoints**, not renaming aliases
or bypassing Telegram/private licensing.

## Real transport ledger (code newly added)

The private `geomacro-feed-activation-ledger.mjs` joins the existing
operator-reviewed and quota-limited HTTP/RSS probe receipts to the
1059-reference SHA-only source queue. It accepts only an exact, currently
observed registered source ID with an explicitly scheduled read-only
transport and a parsed RSS/Atom XML feed with actual observed items.
HTML pages and BLS monthly numeric API may provide useful separate
context but do not become "live news feeds".

The new audit runs **after** existing 90-minute operator source probes
without additional network calls. It outputs only aggregate 80% gap,
distinct physical RSS feeds, category-reference reuse counts, native
feed-item freshness hints, and safe non-reversible commitment; never
provider names, URLs, raw article content, Telegram identities,
commercial rights, verified country-risk scores or payment flags.

Audit accepts 3 distinct probe groups across at most 12 hours. A
single scheduled group remains visibly partial, and a 401/403/429,
empty/malformed feed, missing group, raw HTML page, or stale receipt
does not falsely promote the source.

Customer-facing canonical endpoint remains
`GET /api/v1/intelligence/query?view=source-status`, which shows
only observed three-domain source pulse. This operational 1059 audit
stays in a short-lived PRIVATE Actions artifact.

## To actually expand the number

1. Run a full 14-window 535-root HTTP census (PR #2172), do not equate
   a healthy homepage with an RSS or article producer.
2. Register provider-approved exact HTTPS RSS/Atom/JSON API endpoints
   as NEW genuine physical feed transports with source-specific allowed
   automated access; quarantine providers denying extraction.
3. Add bounded GET/format/native-date tests per provider to the existing
   90-minute source rotations, plus one-run-on-main proof.
4. Reuse existing provider transport across relevant three categories
   but count it only **once** in the unique 80%-of-feed goal.
5. Maintain transport freshness, 401/403/429 backoff, and provider
   original-publication verification separately from score/payment.

An 80% target is not attained by this audit and should never be
presented as attained without real, category-aware, repeatable
provider GET/format/date receipts. x402 remains separately charge-gated.
