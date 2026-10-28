# GeoMacro Certified GRI — Public News + GeoMacro OSINT Severity v1.1 (self-issued)

## Product change
The founder-approved 29 October 2026 redesign retains three independent domain cards but replaces the old layout with an editorial responsive risk dashboard, 24H/48H/72H observed-history panels and compact integrity disclosure. This public page now consumes `GET /v1/public/geomacro-certified-news-severity-gri` on the canonical GeoMacro D1 Control Plane, instead of requiring the old independently signed GRI v1.2 parent. The homepage preview uses the same hook. `/global-risk` and PREDGE remain completely separate and unchanged.

## What GeoMacro certifies
GeoMacro **self-certifies its own calculation**: it collects eligible original-date public *derived* release observations (canonical 72-hour journal, source-neutral text), applies a frozen deterministic category severity rubric, de-duplicates by topic/geography/six-hour window, discounts older releases (18-hour half-life), calculates three 0–100 category values, binds input/methodology/calculation SHA256 fingerprints, and HMAC-SHA256 signs the exact public payload using the protected GeoMacro issuer secret already deployed in the worker. The public HTTPS origin authenticates the issuing service; only the GeoMacro server holding the symmetric HMAC key can independently verify this signature. The production deployment verifies the HMAC by recomputing it securely.

**This is NOT independent human-review certification, external auditor certification, factual verification of each underlying event, a probability of war, actual economic impact magnitude, source-commercial-rights approval, a signed country-category GRI v1.2 certificate, or permission for x402.** Do not advertise those properties.

## Eligible data
- Existing `website-derived-news-bundle.v1`, capped at 600 rows in the existing 72-hour journal. No additional source scraping or producer.
- `official_release_observed_unscored`: public original-release news, valid native source clock and source-safe GeoMacro-derived text; full rubric potential-severity baseline, normal weight.
- `osint_feed_observed_unverified`: monitored OSINT source-feed observations, valid native clock and source-private safe derived text. **Included in all three domain scores at 0.22 event weight** and a bounded **12–42 potential-severity** signal (0.46 × topic rubric); no inferred independent factual corroboration. OSINT-only indices are low-confidence; an official release takes priority for the same topic/geography/six-hour window.
- `official_feed_candidate_unscored`: publisher candidate with unclassified item, excluded from numerical risk until meaningful evidence exists. Observed OSINT is not silently relabeled as official news.
- Separate domain scores for Geopolitics, Macro/FX and Critical Minerals, with a **provenance-weighted heuristic**. Inputs and source-type counts are SHA-bound; the public certificate explicitly reports independent event verification as **false**.
- No eligible public news or monitored OSINT for a category = `status:unavailable, score:null`, not zero or a previous score promoted to current.
- `readingAsOf` retains the last actual release time and `last_verified` status if the latest source is older than one hour. `snapshotAsOf` is calculation time, not the native source timestamp.
- The published dashboard displays **24H / 48H / 72H source-native observed-severity history**, backfilled from the existing deduplicated 72-hour canonical journal using original publication timestamps and six-hour nonempty buckets. Charts are **observed release severity, not reconstructed historical GRI index levels**. Missing intervals remain empty; older immutable GRI v1.2 snapshots are not mixed in. 7D/30D history is not claimed.

## Running continuously without reviewer bottleneck
- Native website ingestion continues as before; GET requests reuse already materialized journal read and existing Worker Cache; no new cron, B2 GET, SQL migration, PREDGE access or funds.
- Browser automatically refreshes every five minutes; the Worker cache retains bounded 60s revalidation.
- The existing D1 control plane production deploy workflow runs `geomacro-news-severity-gri.test.mjs`, then performs an HTTPS issuer/HMAC three-category acceptance with `verify-live-geomacro-news-gri.mjs` against the actual deployed current SHA.
- Missing issuer key, invalid canonical journal, D1 quota failure, malformed category or incorrect signature cause a visible unavailable response, NEVER a fake certified number. Production uninterrupted availability remains subject to actual ingestion and database/service health.

The previous independent-signed current GRI reviewer + certificate pipeline is retained **only** for the existing legacy independently reviewed product and is not silently weakened. Open issue #2103 remains for any genuine independent-v1.2 work. No PREDGE files or credentials were changed.
