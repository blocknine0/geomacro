# Global Intelligence v1 Build Status

## Started
- Isolated branch: `feature/global-intelligence-v1`
- Production `main` remains untouched.
- Source registry and verification policy created.
- Free/no-key and free-key source candidates recorded.
- Telegram authority tiers recorded.

## Source availability assessment

### Already available as free/no-key baseline
- GDELT
- World Bank
- USGS minerals
- Eurostat/public official datasets
- official government/statistical/central-bank endpoints where available
- public UN/IMO sources

### Free key/account candidates
- UN Comtrade free API
- Telegram API / TDLib
- IMF SDMX access where endpoint/account requirements permit

### Not production-approved yet
- JRC RMIS
- IEA critical-minerals data
- commercial news APIs with restrictive free tiers
- any unverified Telegram channel

## User input likely required later
1. Telegram API application credentials for broad public-channel collection, if the selected implementation requires MTProto/TDLib.
2. UN Comtrade free API key for stable higher-limit ingestion.
3. IMF credentials only if the selected IMF endpoint requires them.

Credentials must be supplied only through the application's secret/environment mechanism. Never put them in Git.

## Next gates
1. Preserve the generated all-enabled country universe and N×3 matrix as CI artifacts for every certification run.
2. Add bounded runtime probes for public/no-key global sources and record source-level health separately from structural coverage.
3. Add country-level coverage certification that distinguishes CONFIGURED, LIVE_DATA, DEGRADED, and NO_DATA instead of treating a configured cell as healthy.
4. Run the complete expanded-universe certification for the current enabled registry (currently 250 countries, 750 category cells).
5. Keep the governed 195-country sovereign baseline as a separate certification gate.
6. Only after runtime certification, failure-injection tests, and production-readiness review should PR #836 be merged.

## Latest completed slice
- World Bank macro adapter upgraded on `feature/global-intelligence-v1`.
- Added `world-bank-indicator-catalog.v1.json` with initial macro families and aliases.
- Added multi-indicator World Bank retrieval (up to the documented 60-indicator request limit), MRV, frequency, date and gap-fill controls.
- Added World Bank indicator catalog retrieval for dynamic expansion beyond the initial curated families.
- Added a runtime probe covering IND/USA/CHN plus indicator-catalog availability.
- Intelligence engine now accepts category engines returning either arrays or structured `{observations: [...]}` results.
- No credentials are required for this World Bank slice.
- Runtime execution still needs to be run from the actual branch checkout before this source can be marked PASS in certification.

- Added configuration-driven national-statistics/central-bank onboarding contract, official JSON adapter, country-primary registry and U.S. BLS runtime probe. Discovery-required endpoints remain outside governed ingestion until exact dataset routes are pinned.

- Corrected UN Comtrade reporter resolution to use the official `Reporters.json` reference rather than `partnerAreas.json`. UN Comtrade distinguishes reporter countries from partner areas, and the reporter catalog is the canonical mapping for country-level reporter queries.
- Added a real USGS Minerals Yearbook Volume III CSV parser for production and facilities evidence, with explicit `PRODUCTION` and `FACILITY` evidence types and release provenance. The official 2024 release provides CSV production/facility tables covering 2020–2024 and is CC0/public domain.
- Added an explicit minerals reconciliation layer that keeps production, exports, imports, and trade balance as separate evidence types and refuses to convert unlike measures into a single production claim.
- Complete 195-country reporter resolution, runtime PASS, full mineral concordance, freshness, and commercial/re-dissemination review remain open.

- Added deterministic category engines for GEOPOLITICS, MACRO, and CRITICAL_MINERALS.
- Added default adapter wiring so the intelligence engine can run without manually injecting category adapters.
- Geopolitics resolves ISO3 to ISO2 through the World Bank country endpoint before querying GDELT.
- Macro maps question terms to a controlled World Bank indicator set.
- Critical-minerals engine consumes USGS MCS 2026 and only enables UN Comtrade trade evidence when an explicitly reviewed HS/cmdCode is supplied; it never treats TOTAL trade as a mineral series.
- Added deterministic routing/adapter unit coverage and branch CI configuration.
- CI/runtime execution has not yet been observed as PASS from this branch; no PASS claim is made.

- Added transport-neutral Telegram message normalization with content hashing, provenance fields, and explicit VERIFIED/SPECIALIST/EARLY_SIGNAL classification.
- Added Telegram tests proving unknown/specialist channels cannot independently confirm facts, while an identity-verified and policy-approved official channel can be eligible for confirmation.
- Telegram credentials remain runtime-only; no login client or secret is committed.
