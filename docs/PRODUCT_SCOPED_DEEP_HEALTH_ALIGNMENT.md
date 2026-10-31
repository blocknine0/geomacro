# Production deep-health: product-scoped stateless vs legacy signed (2026-10-17)

## Do not turn a real 503 into a fake 200

Geomacro now has **two different product contracts**:

1. `GET /api/health?deep=1`: **legacy signed** Intelligence + GRI v1.2 + Risk Indices. It still requires actual current signed B2/D1 hot snapshots, independent readbacks, and the original verified score methodology. If current snapshots are expired, this MUST remain HTTP 503. Neither source-time updating nor a source-retrieval-only proof may make this health return 200.
2. `GET /api/health?deep=1&profile=live-structured`: new **unsigned direct-fetch structured observation** service. This checks all three category paths on demand via the existing source-scoped `liveStructuredData` function with D1 fallback disabled. No GRO, signing, B2/D1 intelligence snapshot or Supabase activation is a requirement for this new product. Healthy HTTP 200 means **three reviewed, usable request-time structured category outputs**, not 195-country signed risk, current original news coverage, or a market-tick guarantee. Any missing/blocked category must produce HTTP 503 and a per-category failure state.

A separate `profile=verified-baseline` is also accepted **only with `deep=1`**.
This read-only profile independently reports genuinely verified last-known B2/Edge
baseline availability and HTTP 200 with `degraded:true` only when at least one
baseline is readable; if none is readable it returns HTTP 503. It never
claims stale signed current products are live and never authorizes payment.
Unsupported profiles return HTTP 400. Existing `/api/health?deep=1` signed
paid response/status and shallow health remain unchanged. See
`docs/ops/PRODUCT_SCOPED_DEEP_HEALTH_ALIGNMENT.md` for the publisher cycle.

## New deep-health proof shape

`schema: geomacro.product-scoped-deep-health.v1`. Response includes explicit `product: live-structured`, `checked_at`, category read outcomes, scoped `source_fetch_accepted`, `eligible_observations`, `event_occurrence_clock_observations`, `legacy_signed_intelligence_gri_risk_indices: NOT_EVALUATED_IN_THIS_PROFILE`, `fresh_signed_snapshot_readiness_attested:false`, `country_coverage_verified:false`, `x402_payment_authorized:false`, and `new_intelligence_durable_storage_required:false`.

Health rejects stale/future `checked_at` and `source_checked_at`, unsupported or empty observations, absent source-specific credit/license scope, unsafe pay/signed/storage flags, or a missing category. A dataset reference year/day and USGS MCS catalog edition cannot count as a newly published geopolitical, macro or mineral event. `event_occurrence_clock_observations` counts ONLY records bearing the event-occurrence clock; it does not imply independent event corroboration or geopolitical significance of geopolitical significance.

## Production verification

- `src/lib/live-structured-deep-health.server.test.ts` checks all-three acceptance, no-funds/no-GRO, failed sources, stale timestamps and old signed deep-health preservation.
- `scripts/ops/verify-live-structured-no-funds.mjs` verifies the public profile response independently, then tests the five existing structured category/numeric requests with no payments and no local raw-data persistence.
- `.github/workflows/stateless-live-structured-no-funds.yml` runs manual / six-hour external monitoring on canonical `main`. **Failures are actionable proof**, not permission to falsify state.
- An exact GitHub source-sync or successful CI build is not executable website SHA parity. Independently verify that public `geomacro.live` is serving the release and that its current source providers are reachable before announcing 200.
- The legacy `production-website-health`, `public D1 hot root cause` and x402 safety workflows **must not** be bypassed or marked green by this new profile; these remain genuine verification of separate old signed paid products.

## Source rights and customer claims

The request-time source adapters accept only explicitly reviewed USGS/WDI/ECB observations with source-specific attribution. Their licensing scope is not universal news rights. Retrieval time does not mean original publication time. This new route is a **free/unpriced/no-settlement** capability. Founder locked x402 prices remain separate; paid JSON activation requires a source-eligible exact response, immutable quote/delivery binding, durable minimal payment ledger and separate explicit real-money authorization. No historical observation warehouse is mandated by the new product.

**Production closure condition:** an authentic live `GET /api/health?deep=1&profile=live-structured` HTTP 200 AND independent post-deploy POST readbacks for all three categories, with bounded quotas and no B2/D1/Supabase intelligence writes. Legacy signed `/api/health?deep=1` only closes on authentic signed products and its own HTTP 200.
