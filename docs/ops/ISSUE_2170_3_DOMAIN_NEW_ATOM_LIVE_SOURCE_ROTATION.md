# #2170 — Activate three real original government Atom intake lanes

Scope: expand the *existing* official bounded transport mesh and scheduled
30-minute first-party source rotation across all three domains. This is
not a new ingestion engine or source-license override.

New pinned first-party candidate routes (existing GOV.UK Atom publication
format): UK Ministry of Defence for geopolitics; HM Treasury for macro/FX;
Department for Energy Security and Net Zero for critical minerals/energy
materials. Each has its own department-scoped RSS/Atom endpoint and is
validated against original first-party article paths and explicit
`<published>` source-native timestamps. A feed `<updated>` alone is
not original publication. An RSS/Atom HTTP 200 alone is not proof
that a topical event happened recently.

Existing official mesh goes from 15 rows (12 unquarantined + 3 retained
quarantines) to 18 rows (15 unquarantined + 3 retained quarantines).
No blocked EITI/USGS/NRCan Simply Science routes are unquarantined.
The same code continues to fail closed on 401/403/429, wrong MIME,
malformed feed, redirected content and unapproved original article host/path.

The 30-minute pulse continues exactly two original publisher GETs
per category per slot (6 overall), rotating over 3 geopolitics, 4
macro and 4 minerals first-party issuer lanes. Each issuer appears
regularly without an increased *per-slot* endpoint budget.
These are distinct departmental publication streams, **not proof**
of an independently corroborated same-event claim or per-article rights.

Private first-party evidence candidates are SHA-only; source article
URLs, HTML, raw RSS and headlines are not returned to the public
query source-status endpoint or via paid x402 POST.
No D1/B2/Supabase mutation occurs in the new source definitions.
Existing 30-minute source D1 writer may continue its audited
source-health metadata readback, not risk publication.

## Acceptance

1. Exact PR-head Product CI and source static/negative tests
2. Genuine GitHub Actions live official mesh response from all three new
   pinned sources, including true Atom MIME+shape validation and timestamps
3. First production 30-minute private source pulse selects new lanes
   without violating two-per-category GET/quota limits
4. Live unified `GET /api/v1/intelligence/query?view=source-status`
   remains observation-only and exact deployed acceptance must be proved
5. Keep issue OPEN until all other registered eligible feeds are individually
   accepted; do not claim 80% or 1,079 active physical feeds.

**Inventory precision:** The currently validated `assemblePrivateIntakeSnapshot`
count from issue #2170 is 1,059 category/lane references, not
1,079 verified feed transports. These additional three official source
observation lanes do not silently re-label those 1,059 references as
working actual RSS feeds. Adding a confirmed new physical feed
and reclassifying 1,059 catalog references are separate migrations.

No user funds and no commercial rights approval are part of source
transport activation.
