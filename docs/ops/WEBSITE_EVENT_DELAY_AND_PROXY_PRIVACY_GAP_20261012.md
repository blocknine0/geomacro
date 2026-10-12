# Website release delay / provider privacy bypass closure — 12 October 2026

## Verified gap

Merged #2099 placed a 60-minute website release cutoff in Intelligence
listing SSR and browser refresh, and in the Global Risk/indices historical
snapshot reader. However the related **individual event URL** was still
resolved by two separate server functions:

- `getPublicEventSeoDetail()` — GET SSR/SEO and social metadata.
- `getPublicEventDetail()` — browser interactive detail.

Both fetched the B2-derived intelligence row without checking the website
60-minute release clock. An under-one-hour record could therefore appear
on `/event/:eventId` even when correctly hidden in `/intelligence`.

Both now use the same `websiteEvidencePastEmbargo()` validation: actual
original `published_at` AND stored `created_at` at least 60 minutes
old. Missing, future, invalid and recently ingested records remain unavailable
until eligible. This does not change the live/unlagged paid x402 or machine
intelligence routes, original proof, scoring, store or pricing.

## Public PostgREST proxy confidentiality

A separate public legacy data proxy allowed untrusted `select=` expressions
and forwarded browser `Accept` to upstream PostgREST, then returned any
non-JSON response body **unchanged**. A caller could rename a private
`source_name` field via a PostgREST projection alias so that a response-only
key scrubber would miss it, or request CSV and avoid JSON scrubbing altogether.

This patch enforces:

1. Exact allowlisted table **path** (no extra REST subpaths).
2. Explicit simple `select=id,as_of,...` names only. No `*`, alias,
   JSON field operator, nested join or expression. Query parameters
   filtering private source/publisher/provider/rights fields are denied.
3. Only ordinary JSON or the exact PostgREST `maybeSingle()` vendor
   JSON media type is forwarded upstream.
4. Non-JSON upstream bodies fail closed with HTTP 502 instead of being streamed.
5. `source_key` is also removed in recursively redacted JSON responses.
6. Existing read-only table allowlist, no service-role key, and
   strict GET/HEAD remain unchanged.

The same-origin legacy source proxy is NOT the canonical machine x402
delivery endpoint; it remains a non-commercial public read for compatible
historical proof/legacy components. Dataset-specific permission and private
source ownership requirements remain unaffected.

## Acceptance and continued blockers

Product CI + CodeQL + website lock should pass, followed by Lovable publish
and exact SHA/visual production readback. Do not claim a code PR is a
live publish. True signed three-domain current intelligence and reliable
historical one-hour GRI snapshot availability still require the
independently verified records and trusted serving infrastructure; this PR
does not fabricate them.

Founder-supplied updated pricing is pending, no real USDC purchase
authorized by this change.
