# GeoMacro Certified GRI — News Severity v1 (self-issued)

## Product change
The existing `/risk-indices` three-panel layout is preserved. This public page now consumes `GET /v1/public/geomacro-certified-news-severity-gri` on the canonical GeoMacro D1 Control Plane, instead of requiring the old independently signed GRI v1.2 parent. The homepage preview uses the same hook. `/global-risk` and PREDGE remain completely separate and unchanged.

## What GeoMacro certifies
GeoMacro **self-certifies its own calculation**: it collects eligible original-date public *derived* release observations (canonical 72-hour journal, source-neutral text), applies a frozen deterministic category severity rubric, de-duplicates by topic/geography/six-hour window, discounts older releases (18-hour half-life), calculates three 0–100 category values, binds input/methodology/calculation SHA256 fingerprints, and HMAC-SHA256 signs the exact public payload using the protected GeoMacro issuer secret already deployed in the worker. The public HTTPS origin authenticates the issuing service; only the GeoMacro server holding the symmetric HMAC key can independently verify this signature. The production deployment verifies the HMAC by recomputing it securely.

**This is NOT independent human-review certification, external auditor certification, factual verification of each underlying event, a probability of war, actual economic impact magnitude, source-commercial-rights approval, a signed country-category GRI v1.2 certificate, or permission for x402.** Do not advertise those properties.

## Eligible data
- Existing `website-derived-news-bundle.v1`, capped at 600 rows in the existing 72-hour journal. No additional source scraping or producer.
- Only `official_release_observed_unscored` with valid native release clock and original-source-safe *derived* prose; `official_feed_candidate_unscored` and `osint_feed_observed_unverified` NEVER contribute.
- Distinct development categories (geopolitics, macro/FX, critical minerals), with explicit source-qualified event-severity **heuristic**, not a claim that an unscored article contained verified severity.
- No eligible data for a category = `status:unavailable, score:null`, not zero or a previous score promoted to current.
- `readingAsOf` retains the last actual release time and `last_verified` status if the latest source is older than one hour. `snapshotAsOf` is calculation time, not the native source timestamp.
- The existing 72h journal cannot prove 7D/30D comparable historical time series. Charts remain unavailable for those frames until a separately persisted history is actually established; no synthetic backfill.

## Running continuously without reviewer bottleneck
- Native website ingestion continues as before; GET requests reuse already materialized journal read and existing Worker Cache; no new cron, B2 GET, SQL migration, PREDGE access or funds.
- Browser automatically refreshes every five minutes; the Worker cache retains bounded 60s revalidation.
- The existing D1 control plane production deploy workflow runs `geomacro-news-severity-gri.test.mjs`, then performs an HTTPS issuer/HMAC three-category acceptance with `verify-live-geomacro-news-gri.mjs` against the actual deployed current SHA.
- Missing issuer key, invalid canonical journal, D1 quota failure, malformed category or incorrect signature cause a visible unavailable response, NEVER a fake certified number. Production uninterrupted availability remains subject to actual ingestion and database/service health.

The previous independent-signed current GRI reviewer + certificate pipeline is retained **only** for the existing legacy independently reviewed product and is not silently weakened. Open issue #2103 remains for any genuine independent-v1.2 work. No PREDGE files or credentials were changed.
