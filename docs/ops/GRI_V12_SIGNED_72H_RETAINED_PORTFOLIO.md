# High-impact news → GRI v1.2: reviewed 72-hour portfolio refresh

## What changed

Before this change, the published GRI review bridge required independently corroborated **new issuer original(s) in all three categories within 90 minutes**. This requirement was more restrictive than the canonical v1.2 score engine, which already uses a **72-hour original event lookback and 24-hour confidence/recency weight half-life**. As a result, a verified new high-impact event in one domain could not cause a score update if one of the other two domains was quiet.

A separate **opt-in, independently reviewer-signed** source-window profile now permits current v1.2 computation from genuine original events collected in the previous 72 hours, including retained events in quiet domains, **provided at least one real new source-native event occurred in the previous 90 minutes**. Existing strict 90-minute sources policy remains unchanged for legacy current products and the six-hour individual commercial same-event gate remains default.

### New signed reviewed GRI input fields (both are required)

```json
{
  "source_freshness_profile": "GRI_V12_RETAINED_ORIGINALS_72H_FRESH_REVIEW_V1",
  "retained_originals_current_review_completed": true
}
```

These values must be inside the **exact independent Ed25519-signed GRI input**; changing or adding them to an already signed envelope invalidates signature. No customer-provided scoring profile, website auto-ingest queue or free Finds signal can assert these fields. Missing/unknown profile fails closed. Previous strict reviewer input contract remains valid and defaults to its unchanged 90-minute requirement.

## Qualification and numerical movement (unmodified canonical method)

1. The input must still contain **all three categories**, real original publisher timestamps, separately corroborated same-event article pairs, exact SHA/rights/reviewer provenance, canonical scored event story/classification metadata, and trusted reviewed derived output rows.
2. The **signed review and counterevidence screening remain current** (the former within 90 minutes, the latter specifically signed and within 90 minutes); every original and first observation timestamp remains its **historical original clock**, never renewed by re-ingestion or a GitHub Actions run.
3. Each retained original must be within the methodology's **72-hour** lookback. At least one qualifying original event must be **newer than 90 minutes** so no unchanged archival portfolio can be republished solely by changing `reviewed_at` or `as_of`.
4. Each referenced country/category cell still requires an actual separately reviewer-signed, current, 90-minute **country certification**. A website country mesh entry is not a certificate.
5. Exact independently pinned previously verified GRI historical B2 bytes, correct methodology v1.2, canonical `calculateGri` weighting, full portable proof reproduction, explicit historical raw numeric difference, B2 gzip/SHA readback and actual D1 promotion are all mandatory. Risk Indices continuity triggers only after a successful verified GRI publication.
6. The signed score bundle remains **derived-only** and never exposes raw original article text/URLs or permits settlement. No synthetic signatures, commercial rights, public score or source clocks are created by this profile.

## What still blocks true real-time publication

The hourly `geomacro.material-original-gri-review-queue.v1` is **only a material candidate shortlist** and cannot independently prove the second original, commercial source permissions, reviewed severity/classification, independent reviewer signature or pinned historical B2. An operator/approved automated external reviewer must supply a genuine current signed B2 GRI input and current country/category certifications, and then send the existing exact-key `gri_reviewed_current_ready` repository dispatch (or protected manual workflow input). Under those preconditions the already-existing protected GRI publisher can actually calculate and publish a new v1.2 numerical score from the new material event plus valid retained state.

**Never** declare a live numerical change from D1 free Finds, automatically re-sign stale original clocks, use a private one-source-only event as a pair of independent corroborators, or show HTTP 200 for an expired product.
