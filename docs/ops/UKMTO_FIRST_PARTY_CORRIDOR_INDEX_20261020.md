# UKMTO first-party maritime incident index observation

**Source:** https://www.ukmto.org/recent-incidents

This observer uses the existing source observation GitHub workflow (best-effort 90-minute schedule). It performs a single HTTPS GET, rejects redirects and access denials, uses a 384 KiB total-response hard cap and 10-second timeout, and retains no raw HTML, headline, upstream URL, vessel details or published incident text.

## Truth boundary

- The public UKMTO Recent Incidents website is not an established open machine-readable API. An HTTP 200 or its page heading **is not** proof of recent operational incidents.
- The index can render `0 reports` or depend on dynamic content; the parser must return `NO_PARSEABLE_PUBLIC_REPORTS` and the production job fails closed rather than manufacturing observations.
- Index card display day is not necessarily incident timestamp; reported events may be time-late, updated, reclassified, withdrawn or corrected.
- The output contains only counts and **candidate canonical corridor IDs**. It neither confirms the incident nor the region of impact, route-geometry overlap, severity or flow disruption.
- No unreviewed third-party mirror, scraped logged-in user data or unknown JSON endpoint is used. Never retry a 401/403/429 by rotating identities.
- UKMTO is distinct from MARAD (blocked with HTTP 403). No attempted UKMTO access unlocks MARAD or substitutes for a second independent publisher.
- 195 countries, 58 named corridors and three-domain paid production coverage are not certified by this index.
- Existing country and corridor discovery registries are reused; **no new source family or commercial tier** is introduced.

## Acceptance

Offline CI: `node --test scripts/tests/ukmto-official-corridor-index.test.mjs`.

Protected-main runtime: `ukmto-first-party-private-context` must demonstrate real readable and parseable reports with a nonfuture index display day; otherwise the receipt truthfully reports `NO_PARSEABLE_PUBLIC_REPORTS` or `UPSTREAM_OR_SHAPE_UNVERIFIED`.

The first deployment should be measured against genuine current live HTML. If server-side incident cards are absent, the source cannot safely graduate to event delivery without first-party API/feed permission or an independently verifiable publisher format.

No Supabase, B2, D1, AI scoring, signing, payment or partner delivery is activated by this change.
