# Country-specific private OSINT source-gap expansion (2026-10-27)

## What changed

The last available live source-only run 40401670655 checked 495 endpoints, 1,343 source/category checks, and 768 bounded source-native dated items. All 585 country/category cells had some healthy source fallback, but only 100 of 585 cells had country-attributed dated items; only 84 of 195 countries had a registered country-specific publisher. These are **not** 585 independently verified events.

This change pins 16 additional, geographically distinct first-party publisher news-feed URLs in `config/private-osint-national-gap-feeds.v1.json`, representing **14 newly registered publisher countries plus Georgian provenance correction**: ARM, BHR, BHS, CHL, IRL, JOR, LUX, MYS, PRT, PRY, QAT, SAU, SRB, UKR; the existing Georgia-headquartered OC Media source is independently counted for GEO. Registration raises the expected local-publisher inventory from 84 to 99 countries, subject to tests and redeployed execution. It does not repair the remaining 96-country local-source deficit.

Sources are drawn from the publishers' own RSS directories or published independent working RSS listings. Candidate metadata never asserts that upstream endpoints passed the currently deployed Geomacro runner, that they published a new matching story, or that any event took place in the publisher's home country. All URLs are HTTPS and are validated on every collector tick. DENIED, MALFORMED, EMPTY/QUIET and UNAVAILABLE are distinguished. Only native-dated original publisher feed items are eligible for private intake. Index publication times and global news fallback cannot substitute for original-event evidence.

## Machine invariants

- The original 446 distinct accepted/candidate private base endpoints plus 16 new candidates leave 49 discovery-index slots under the strict 512-endpoint per-tick cap. Full accounting is asserted by unit tests and by actual runtime source-count guards.
- Exactly 195 canonical country search routes rotate 49/49/49/48 on four scheduled 15-minute workflow ticks. The nominal cycle is therefore **60 minutes**, not the previously advertised 20 minutes. A delayed or skipped GitHub schedule can extend it.
- Every appended local publisher URL has one feed identity, an ISO3/continent mapping, runtime transport and source-native-date requirements, and untrusted candidate status. The private D1 sink never inherits verified event status from source registration.
- The PR triggers existing source verification tests and the read-only live network source probe. Its private D1 durable write/readback acceptance is separate.

## Open production dependency

Cloudflare D1 free-tier daily row-read cap was positively observed in failed deploy run [40407447148](https://github.com/blocknine0/geomacro/actions/runs/40407447148), error 7500. Existing private writes produced HTTP 503. Source expansion does **not** repair D1, and successful feed fetches cannot be represented as successful continuous end-to-end ingestion until protected D1 writes and independent readback succeed in new production runs.

Do not claim 195-country local publisher completion, all 585 current events, customer-visible verified structured intelligence or sub-15-minute delivery from this patch alone.

## Live-probe qualification and replacements

The first 511-endpoint real Actions network probe (run 40411606910) returned 97 publisher-country inventory, **102/585 cells with attributed dated items**, and healthy global/regional fallback for all 585. Its raw counts-only private artifact identified 5 new endpoints with DENIED, MALFORMED or UNAVAILABLE states: Bahrain Al Watan, Chile BCN, Georgia Civil Georgia, Paraguay ABC and Ukraine presidency. These are **not** accepted as functioning live original feeds.

Corrective candidates replace those endpoints with the Bahrain Al Ayam official RSS-directory-linked FeedBurner feed, Chile Cooperativa, updated Civil Georgia feed location, Paraguay Última Hora official Atom and Azerbaijan Trend RSS. The Bahrain FeedBurner allowance is exact URL + exact publisher directory only; this is never a generic third-party redirect exemption. All replacements remain unverified until the PR reruns the real network probe. Runtime native publisher clocks and transport outcomes, not third-party discovery pages, determine actual successes.

## Second physical rerun and Georgia provenance

Actions run [40412557442](https://github.com/blocknine0/geomacro/actions/runs/40412557442) verified 511 requests/1,388 category checks, 98 local-publisher inventory countries and 102 current attributed country/domain news cells. Bahrain Al Ayam FeedBurner and Paraguay Última Hora Atom passed actual RSS/Atom transport parsing. Azerbaijan Trend and Civil Georgia remained UNAVAILABLE on GitHub workers and were replaced as prospective endpoints with Qatar Gulf Times and Jordan Times respectively; these must pass a **new** live probe before being considered healthy.

The pre-existing, actually live OC Media (https://oc-media.org/feed/) is based in Tbilisi, Georgia (https://oc-media.org/about-us/ and https://www.ejc.net/resources/oc-media-training-freelance-journalists-caucasus-1). Previous `europe/null` publisher metadata was misclassified. It has been repaired as `asia/GEO` without adding duplicate endpoints or assigning an event country by publisher location. This independently adds genuine local publisher-country metadata for Georgia while OC Media's event locations continue to require title/geography proof.

## Third network readback (before Jordan feed correction)

[40413071900](https://github.com/blocknine0/geomacro/actions/runs/40413071900) independently checked 511 endpoints and 1,390 source/category checks; the local publisher-country registry count was **99/195** and **107/585** country/category cells had native-dated attributed candidate items. Gulf Times Qatar was HTTP/feed healthy and showed a macro item; OC Media Georgia was physically healthy. Jordan Times returned DENIED in all three categories, so its exact guessed RSS path was discarded and replaced with `https://en.ammonnews.net/rss.php?id=2&type=news`, linked from the publisher's own `https://en.ammonnews.net/rss` service page. This last Jordan source is again a candidate, not accepted as live until the fourth Actions probe returns a successful physical and native-clock status.
