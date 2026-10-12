# Public operator-source rotation — 12 October 2026

## What is actually turned on

This is an **additional, bounded, read-only GitHub Actions private
discovery/availability check** for 14 previously unactivated IDs in the
operator's attached 76-source inventory. It does not replace, duplicate, or
turn off the existing canonical source readers:

- GDELT GKG static 15-minute private discovery; GDELT DOC may respond 429.
- ReliefWeb **V2** once per official 90-minute observation slot, using the
  approved `RELIEFWEB_APPROVED_APPNAME` provider identifier.
- Existing 12 working official publisher transports (3 quarantined).
- Existing USGS Earthquake, Federal Register, Treasury FiscalData
  one-request official contextual monitoring.

Read-only candidates added here, with exact supplier name in operator
registry: `news_bbc`, `news_aljazeera`, `news_dw`,
`news_nikkei`, `news_scmp`, `news_france24`,
`news_kyivindependent`, `news_toi`,
`state_tass`, `state_globaltimes`,
`fed_press`, `bls`, `re_news_mining`,
`ofac_recent_actions`.

**The same already-existing 90-minute workflow** now runs a single group
(0/1/2), 4–5 sources per slot, 14 sources in ~4.5 hours if no scheduled
slot is skipped. GitHub scheduling has no uninterrupted real-time SLA.
On a merge to main the three groups are each tested once in separate
jobs to obtain full initial acceptance, without polluting a normal
scheduled slot. A source returning 401/403/429 is labelled
`DENIED_OR_RATE_LIMIT` and is **not retried** or circumvented. HTTP 404,
bad content, HTML instead of RSS, oversized response and network outage
each retain a distinct fail-closed receipt. No response body, RSS title,
original URLs, or source posts are stored. Only aggregate counts and
provider names remain in a 3-day private artifact.

Feed items, publisher feed item dates, topic *word* counts and BLS
monthly period references are **not** cross-verified evidence, fresh
country coverage, scored risk, signed GRO or product payment acceptance.

## Provider corrections and eligibility

- The operator list identifies several products as **paid** (e.g.
  ADS-B Exchange, Reuters/AP licensed wire, OpenSanctions, commodity
  price vendors) and others as `partial` or `check`. They are NOT
  commercially free just because a text generator included them in a list.
- BBC public feed URL has been upgraded from HTTP to HTTPS.
- BLS no-key request goes to its *public Version 1 API*:
  `/publicAPI/v1/timeseries/data/CUUR0000SA0`; the registered
  Version 2 API and higher quotas **cannot be assumed** without a key.
- News agency RSS availability does **not** grant article reprinting
  permission or unconditional derived-commercial eligibility. Names
  are recorded for provenance and required credits; original source
  licensing remains a separate dataset-specific decision.
- `ofac_recent_actions` is a *web page, not an RSS feed*. Successful
  HTTP/HTML parsing is only `HTML_HEALTH_ONLY`; zero event count
  never implies OFAC published no sanctions.
- `gdacs`, `reliefweb`, `gdelt_events`, other already mapped
  source IDs are not scheduled for duplicate HTTP polling.
- Each request is HTTPS-only, bound to a static configured URL, blocks
  redirects, times out after 8s, and has a 768 KiB absolute response cap.
- Group status fails if any candidate cannot return valid metadata;
  never a silent green for 403/429/404/HTML-masquerading-as-feed.
- At most 5 new GET requests each 90-minute slot, no B2/D1/Supabase,
  no external AI model, no purchases, no customer raw data.

## End-to-end acceptance still separate

A production transport receipt does **not** activate the verified
intelligence → rights → dedup/corroboration → signing → x402 pipeline.
A commercial source may require named credit plus licence and dataset
version attribution. The existing `mandatoryDerivedSourceCredits()`
helper has not been wired to a signed customer response schema.

See operator mapping:
[`config/operator-76-source-attribution-intake.v1.json`](../../config/operator-76-source-attribution-intake.v1.json)
and provider rights register [`docs/COMMERCIAL_SOURCE_RIGHTS.md`](../COMMERCIAL_SOURCE_RIGHTS.md).
