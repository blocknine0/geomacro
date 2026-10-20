# Free D1 derived news production health is a distinct product (2026-10-21)

## Evidence from two requested canonical-main runs
- [#39500093995](https://github.com/blocknine0/geomacro/actions/runs/39500093995) **SUCCESS** with exact SHA parity, authentic 15-minute delayed first HTML and 22 D1-derived unscored free stories (18 geo, 4 macro, 0 critical minerals). This is real verified FREE production, not all three current categories, not a signed GRO/GRI and not merchant payment.
- [#39500319061](https://github.com/blocknine0/geomacro/actions/runs/39500319061) **FAILED as designed** for legacy SIGNED products: /api/health?deep=1 HTTP 503, production_data_runtime_configured false, signed hot D1 Intelligence/Global Risk/Risk Indices unavailable. Website SHA and mirror parity, free D1 journal and SSR passed. Paid checkout remains fail-closed.

## Correct permanent product scoping
`GET /api/health?deep=1&profile=free-derived` is an independent
authentic lightweight read-only Cloudflare D1 product health contract.
It returns HTTP 200 only when the existing 72-hour public D1 journal returns
eligible, authentically original-dated, unscored derived stories after the
15-minute exact-original (or conservative 36-hour day-precision) embargo.
It returns 503 on network/JSON/clock/rights/content errors or an empty journal.
It checks D1 metadata strictly, rejects URLs/raw news, forged scores, duplicate
IDs, replayed D1 fetch clocks, commercial and Supabase flags.

Public receipt has per-category counts, real rows, and explicit
`all_three_categories_have_recent_originals`; it CANNOT claim current news in
unobserved categories. It explicitly says:
- `legacy_signed_intelligence_gri_risk_indices: NOT_EVALUATED_IN_THIS_PROFILE`
- `current_signed_hot_snapshots_attested: false`
- `current_numerical_gri_verified: false`
- `consumer_commercial_rights_verified: false`
- `free_website_ssr_attested: false`
- `x402_payment_authorized: false`
- `all_195_countries_fresh_news_verified: false`

The existing independent 3-request **Minimum Free Derived Production Health**
Action still proves actual published SHA and that one D1 story genuinely renders
in the first HTML; it additionally verifies this new free deep-health endpoint
after the owner publishes the updated Lovable build.

## Strict boundaries that remain untouched
`GET /api/health?deep=1` is still the **signed** B2/D1-based
Intelligence/GRI/Risk Indices production health and MUST remain HTTP 503
until real current signed input + separately approved proofs + B2 immutable
readback + verified D1 hot snapshots exist. This change is **NOT** a cure for
those missing signed current products, not a signed live risk index, not a
paid product and not a real settlement authorization. The old Production
Website Health workflow remains RED on its old signed-product checks.
`GET /api/health?deep=1&profile=live-structured` also retains its
independent three-provider rules.

Use the free product health profile to monitor/route only the already active
free product; do not put signed Risk Indices or paid API promises behind its
green result. Do not reactivate Supabase, backdate old evidence, inflate TTL,
forge a GRO/signature or touch actual USDC.
