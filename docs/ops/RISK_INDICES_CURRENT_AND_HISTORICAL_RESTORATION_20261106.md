# GeoMacro Risk Indices — historical recovery without current-score substitution

## Founder-scoped website approval
The founder explicitly directed restoration of the Risk Indices page on 2026-11-06. The approval is recorded separately by PR #3641 and pins the **exact** historical UI blobs from commit `e37cfe0789ae1109ef2c1a7f27ac84f9f93113be`. No other presentation baseline is unlocked.

## Two distinct trust paths
**Current reviewed GRI v1.2:** `/api/public/reviewed-risk-indices` continues to require the existing genuine independently verified reviewer-scored input, separate signed country/category certificates, canonical original source windows, protected B2 historical lineage, exact D1/Edge readback, and Ed25519 issuer delivery. A current GRI cannot be manufactured from internal triage scores, an obsolete prior score, or a derived-only machine-policy receipt.

**Previously verified B2 archive:** `geomacro-risk-indices` Edge now exposes a **separate** `GET /risk-indices/history` endpoint. It verifies the prior exact B2 compressed SHA, proof metadata, original snapshot and source-native timestamps (or exact SHA-bound deployed B2 readback continuity) without minting a new current timestamp. Negative cache and shared B2 request quota admission apply. `/api/public/risk-indices-history` and the separate historical React section explicitly label it **Last verified — not live** and prohibit consumer chargeability.

The Edge still rejects stale packages on the original `/risk-indices` route; the browser hook continues to consume exclusively the current reviewed Ed25519 endpoint.

## Production acceptance
1. Product CI, CodeQL and website exact-blob lock must pass on canonical main.
2. Deploy the historical Edge code through existing protected GitHub production workflow. The historical route must return original B2-bound data, not a synthetic value. Its failure must honestly yield unavailable.
3. Publish the exact mirrored Lovable site using the authorized published project; verify the source SHA and `/risk-indices` visible historical/not-live labels.
4. Independently verify current API continues returning 503 until a genuine signed reviewer GRI is available.
5. The existing 15-minute `GRI v1.2 Genuine Signed Ready Cadence Backstop` automatically dispatches only real approved, immutable reviewed-GRI/country-cert SHA pairs. After genuine protected GRI publication, the existing Risk Indices signed-parent backstop performs B2/D1 child promotion and live Ed25519 delivery checks.

**Do not claim current three-score restoration solely because the historical snapshot is displayed.** If the B2 proof or approved current original/certification is missing, report the precise evidence gate as unresolved. No new payments, source rights, human signature reuse, or crypto activation are authorized.
