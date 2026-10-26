# Country-specific private OSINT source-gap expansion (2026-10-27)

## What changed

The last available live source-only run 40401670655 checked 495 endpoints, 1,343 source/category checks, and 768 bounded source-native dated items. All 585 country/category cells had some healthy source fallback, but only 100 of 585 cells had country-attributed dated items; only 84 of 195 countries had a registered country-specific publisher. These are **not** 585 independently verified events.

This change pins 16 additional, geographically distinct first-party publisher news-feed URLs in `config/private-osint-national-gap-feeds.v1.json`, representing **13 previously unrepresented publisher countries**: ARM, BHR, BHS, CHL, GEO, IRL, LUX, MYS, PRT, PRY, SAU, SRB, UKR. Registration raises the expected local-publisher inventory from 84 to 97 countries, subject to tests and redeployed execution. It does not repair the remaining 98-country local-source deficit.

Sources are drawn from the publishers' own RSS directories or published independent working RSS listings. Candidate metadata never asserts that upstream endpoints passed the currently deployed Geomacro runner, that they published a new matching story, or that any event took place in the publisher's home country. All URLs are HTTPS and are validated on every collector tick. DENIED, MALFORMED, EMPTY/QUIET and UNAVAILABLE are distinguished. Only native-dated original publisher feed items are eligible for private intake. Index publication times and global news fallback cannot substitute for original-event evidence.

## Machine invariants

- The original 446 distinct accepted/candidate private base endpoints plus 16 new candidates leave 49 discovery-index slots under the strict 512-endpoint per-tick cap. Full accounting is asserted by unit tests and by actual runtime source-count guards.
- Exactly 195 canonical country search routes rotate 49/49/49/48 on four scheduled 15-minute workflow ticks. The nominal cycle is therefore **60 minutes**, not the previously advertised 20 minutes. A delayed or skipped GitHub schedule can extend it.
- Every appended local publisher URL has one feed identity, an ISO3/continent mapping, runtime transport and source-native-date requirements, and untrusted candidate status. The private D1 sink never inherits verified event status from source registration.
- The PR triggers existing source verification tests and the read-only live network source probe. Its private D1 durable write/readback acceptance is separate.

## Open production dependency

Cloudflare D1 free-tier daily row-read cap was positively observed in failed deploy run [40407447148](https://github.com/blocknine0/geomacro/actions/runs/40407447148), error 7500. Existing private writes produced HTTP 503. Source expansion does **not** repair D1, and successful feed fetches cannot be represented as successful continuous end-to-end ingestion until protected D1 writes and independent readback succeed in new production runs.

Do not claim 195-country local publisher completion, all 585 current events, customer-visible verified structured intelligence or sub-15-minute delivery from this patch alone.
