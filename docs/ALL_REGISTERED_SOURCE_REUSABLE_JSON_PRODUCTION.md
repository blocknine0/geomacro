# All registered-source reusable JSON production

Status: implementation and offline tests. A real production D1 deploy, scheduled
GitHub source job and D1 readback are separate required runtime proofs.

## Canonical flow

Existing registered official and public operator RSS/Atom source endpoints
(registered in global-official-release-feeds, expanded official-source mesh
and operator feed rotation) -> fixed 15-minute fair rotation -> strict
source-native item publication timestamp -> bounded, finite machine fact
tags -> unified geomacro.reusable-news-json.v1 -> D1 72-hour bounded store
-> public verified-shape D1 JSON GET -> the EXISTING Geomacro API.

No article body, headline, URL, source name or raw publisher HTML/XML is
stored. No source URL is accepted from the public API to trigger backend
requests; scheduled network requests are restricted to existing pinned HTTPS
source registry endpoints. 192 KiB source response maximum, seven-second
read timeout, at most four source endpoints per domain every rotation, at
most 40 factual JSON records per job and per-source private aggregate statuses.

A first-party government API source that does not publish safe RSS/Atom with
an original item clock remains UNSUPPORTED_FORMAT in this collector; it is
not falsely reported as live news. Other existing source data collectors
remain unchanged. Media/noncommercial discovery can be fact-tagged for
research only. Publication from a news feed is not original-page byte
verification or confirmed article-scoped copyright permission.

## D1 endpoints

Public read (no credential):
GET https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/reusable-source-news
Optional bounded pagination: ?offset=200 or ?offset=400; category:
?domain=geopolitics / macro / rare_earth.

Only the existing protected control-plane credential may call:
PUT /v1/reusable-source-news (JSON schema
geomacro.reusable-source-news-batch.v1).
A D1 batch is checked atomically then independently read back before a
successful receipt. Existing owner-signed GRO/x402 payment paths are not
modified. D1 tables are reusable_news_items and reusable_source_checks,
with a rolling 72-hour item window and 24-hour latest source-state receipts.

Canonical website API (after a new Lovable publication):
GET /api/v1/intelligence/query?view=reusable-news-json
This merges the already-admitted editorial derived journal with the
registered-source factual JSON. It labels both and distinguishes failed
source lanes from actual zero-news windows. The existing API request prices
and category product routes do not change.

## Automation

.github/workflows/all-source-reusable-news-json.yml

- Best-effort scheduled checks every 15 minutes, source roster rotation.
- Additional wake-up after successful main Deploy D1 Control Plane.
- Uses already configured protected GEOMACRO_COMMERCE_LEDGER_TOKEN,
  with the same existing HMAC-derived control-plane bearer.
- No new paid source, API key, Supabase, background laptop, real-money
  transaction, risk scoring or automatic commercial source authorization.
- Three categories: geopolitics, macro and rare_earth.
- The independent production producer emits only aggregate status counters
  to GitHub logs; it does not log source content or URLs.
- Failed/blocked/unsupported sources retain a failure reason so no registry
  registration is equated to an actual working live publisher.
- GitHub scheduled runs can be delayed or missed; runtime receipts and
  source-native observations, not the schedule file, determine readiness.

Testing/acceptance: verify workflow offline-contract success, product app
tests, CodeQL, site lock, production remote D1 migration and Worker deployment,
then a real collect-and-publish success (authenticated D1 readback), public
endpoint shape and canonical website view after publish. Until those happen,
production live is NOT claimed. This does not assert all world publishers,
195-country verified fresh coverage, commercial rights over all upstream
content or independently reviewed paid intelligence.
