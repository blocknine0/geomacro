# Legacy signed Edge real-current recovery boundaries — 2026-10-17

## Verified production failure

- Intelligence Worker deployment ran, but **live hash-bound B2/D1 convergence failed**: Actions #39039328856 (`INTELLIGENCE_EDGE_DEPLOY_B2_D1_NOT_CONVERGED`). This is not a code build failure. Current original-source-authorized signed D1/B2 objects are missing or expired.
- Risk Indices Worker source continuity preparation found **no coherent successful main-run full-B2-readback artifact**: Actions #39039328920. Its code-only deploy path had refused to replace an existing HTTP 200 without checking whether the original source time remained genuinely current.
- Old signed hot D1 rows failed actual source expiry/clock audit: Actions #39039328770. Deep health remains genuinely HTTP 503 while Intelligence, GRI and Risk Indices are not current and independently verified.
- **New no-GRO stateless structured data product remains separate** and does not require reviving these historical signed scores or paying for them.

## Safe structural corrections

1. All three live Edges verify actual `source_as_of` or each source-bound response's native original-clock field (not `generated_at`/B2 restore/deploy time) before returning a B2 fallback, GitHub Actions static continuity or Workers cached reply. A historically verified but old artifact cannot become current after redeployment.
2. Every positive current edge response carries exact original source-clock metadata and required proof provenance. Cache hits lacking independently bound B2/D1 proof are ignored; untrusted JSON, a source clock mismatch, or age over 60 minutes fails. Empty or bad proof never returns a green status.
3. The CDN cache max-age is dynamically capped at the *remaining original source freshness*, with no stale-while-revalidate or stale-if-error extension beyond source validity.
4. On a scoped **code-only** Risk Indices deployment, an old 200 is inspected for actual source period plus B2/D1 proof markers. A verified fresh current edge is preserved if the original verified artifact cannot be materialized. An unverified, stale or misleading 200 must not block deploying new fail-closed code. No-provenance bundles result in HTTP 503 instead of fabricated 200.
5. Existing source/machine-reviewed `workflow_run` and manual publication continue to require exact immutable upstream B2 hash, successful reviewed publication, independent readback and governance. Never use code deploy to mint a new signed product.
6. Alerting and original-source monitors remain unchanged. Existing 12h Intelligence and 3h GRI/Indices signed **reference** validity remains separate from the one-hour **live/current/paid** data clock. No Supabase, x402 funds, new data warehouse or forged GRO/rights were added.

## Acceptance, not promises

Required to close legacy #2046/#1827: genuinely new source-native qualified Intelligence and GRI inputs with exact immutable cryptographic pins and commercial eligibility; working governed B2 full readback and D1 publication; independently verified GRI parent → Risk Indices publication; both code-only and full current edge readback pass, exact worker/website SHA and `/api/health?deep=1` HTTP 200 verified externally. The fail-closed 503 itself is a correct response while signed input is missing.

This PR **does not create** signed verified material or revive expired October 8 source clocks. Its success must not be called full commercial recovery. Keep existing 60min live cutoff; human-reviewed rights and independent signatures cannot be synthesized by republishing old B2 data.
