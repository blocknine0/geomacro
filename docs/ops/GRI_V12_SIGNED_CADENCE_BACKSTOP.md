# GRI v1.2 numerical publication — genuine signed-ready cadence

Canonical scoring stays unchanged: the 72-hour independently verified original-event portfolio and 24-hour confidence half-life can carry real retained events in quiet domains. A genuinely new original within 90 minutes, actual permitted source use, independently signed GRI review and country/category certification, pinned historical B2 continuity, numeric computation and exact B2/D1 readback are still mandatory.

## Primary delivery

An independent authorized GRI reviewer publishes already-verified signed original GRI input and country/category certificates under immutable private B2 SHA paths, then sends the existing gri_reviewed_current_ready repository_dispatch. The protected GRI v1.2 workflow verifies rights, first-party originals, publication and review clocks, review signatures, current 3-domain country certificates, historical baseline and numerical changes. Only its success triggers Risk Indices verified-parent workflow. No raw upstream material leaves Geomacro.

## Scheduled missed-dispatch backstop

The new GitHub action gri-signed-ready-cadence-backstop.yml runs at :13, :28, :43 and :58 UTC. It has zero B2/D1 operations. It only reads three repository variables supplied by the separately authorized reviewed input producer:

- GRI_READY_REVIEWED_SHA256 — the lowercase SHA-256 of previously signed reviewed current GRI JSON in geomacro-evidence/v1/private/reviewed-gri-current/<sha>.json
- GRI_READY_CERTIFICATES_SHA256 — distinct lowercase SHA-256 of separate signed country/category certificates in geomacro-evidence/v1/private/reviewed-country-certification/<sha>.json
- GRI_READY_APPROVED_AT — timestamp at which this NEW authentic signed pair was externally approved, strict UTC ISO 8601

These variables are **notification pointers only**, not evidence authorization or rights themselves. The signed input provider rotates the hashes and ready time ONLY for a new genuinely verified B2 pair, never refreshes an old clock. A pointer older than 28 minutes or a missing/forged pointer is SKIPPED with zero network operations, no index value and no customer payment.

A failed protected publication must not permanently strand the same authentic,
recent, independently approved B2 pair. On a real SHA hint, the backstop now
uses only GitHub run metadata to distinguish an active/unknown publisher, a
completed successful publisher, or a failed/cancelled/timed-out publisher.
It permits **at most one additional attempt**, at least **8 minutes after**
the failed attempt and only while the ORIGINAL external approval hint remains
within 28 minutes. A second failure, unknown result, or already successful
run fails closed until the independent reviewer publishes NEW genuine pinned
inputs and approval. This guard never re-signs content or changes clocks.

The previous 30-minute polling interval could miss the entire 28-minute
hint lifetime. Four metadata-only checks per hour now cover this gap even
if no Auto Ingest completion wakes the backstop. GitHub cron remains best effort.

A valid recent pointer causes one narrowly targeted GitHub Actions workflow_dispatch to the EXISTING protected signed GRI v1.2 workflow, under GitHub actions:write permission. GitHub API 204 means merely queued, NOT a new numerical score. The downstream GRI publisher independently authenticates and recomputes all signed originals, country certificates, source rights, clocks, historical continuity, true numerical delta, exact gzip SHA/B2 readback and D1 promotion. Signed-only Risk Indices follows on verified publisher success.

Never dispatch on unscored material news, raw publisher content, self-granted third-party source permission or a mere website heartbeat. Never unfreeze Supabase, backdate data, create fake independent originals, or enable USDC.

## Acceptance

1. node --test scripts/lib/gri-signed-ready-cadence-hint.test.mjs
2. Confirm empty repository variables produce SKIPPED with 0 B2/D1/Supabase/payment traffic.
3. With a real independently signed rights-qualified pair, require protected GRI publisher success, genuinely updated numerical canonical v1.2 and independently verified D1/B2 customer readback.
4. Require subsequent Risk Indices job success, exact live website SHA, and public signed-product health.
5. Historical recovery/test-only success is NOT fresh GRI acceptance. Genuine signed input creation remains an external dependency.

This fixes missed scheduled delivery and a bounded failed-run retry; it does not create legal rights, external reviewer signatures or current news.
