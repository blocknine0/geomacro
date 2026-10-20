# IMF WEO country-wide reference gaps, free-tier pilot

- **Scope**: 195 canonical ISO3 routing entries, including Holy See (VAT) and Palestine (PSE), matched to an existing World Bank WDI 2025 annual availability baseline.
- **Official family**: `imf_datamapper_weo` (existing adapter family). This pilot uses the existing documented anonymous IMF DataMapper path `/external/datamapper/api/v1/NGDP_RPCH` and `/PCPIPCH`, `periods=last completed year`.
- Exactly two no-key GETs on the existing once-daily `gdacs-native-country` cron, one for IMF real GDP growth reference, one for annual CPI inflation reference. No new cron, no account rotation. 256KiB maximum each, 14s timeout, no redirects and fail-closed 403/429.
- **Series availability only**: read valid finite IMF numeric observations solely to record per-country reference availability. Do not record raw numbers. Exclude IMF regional aggregates and extra countries, reject future-date and country mismatch.
- IMF WEO data may contain estimates and forecasts. This input alone **does not distinguish actuals from estimates or projections** and cannot prove current FX rates, current geopolitical events, mine disruptions, publishing time or signed Risk Indices.
- Helpers support a **non-substituting** WDI/IMF reference gap comparison with per-indicator WDI-count and IMF-only-country ISO3 values, not blending IMF forecasts into actual-year WDI.
- A source response error remains explicit. The IMF alternate may be unavailable to GitHub-hosted runners: a clean CI result is not live-source acceptance.
- No D1/B2/Supabase writes, no x402 calls, no raw provider datasets, no signed GROs, no rights grant. The private metadata artifact expires after 3 days.
- Production acceptance after merge: `imf-weo-195-reference` job on exact main, matching 2025 WEO reference series output. A genuine empty dataset or provider access denial must stay degraded; do not mark 195×3 country-domain cells commercial-ready.

Official background: https://www.imf.org/external/datamapper/api/ and https://data.imf.org/datasets/WEO
