# GeoMacro Hot 50 Production Activation: Release and Verification Runbook

Scope: the owner-selected Hot 50 ISO3 countries x Geopolitics (geopolitics), Macro/FX (macro), and Critical Minerals (rare_earth in D1, critical_minerals in public responses). Existing Groq AI inference and shared answer caching are not modified. No fabricated index or reviewer certificate is permitted.

## Existing authoritative components

The repository already contains the P0B D1-first encrypted outbox (migration 0118), the spool queue (0114), encrypted bundle journal (0116), progressive 50-country evidence registry (0201), and read-only audit views (0202). The collector, outbox replayer, B2 spool manager, D1 consumer, signed parent GRI and reviewer-authority guards remain authoritative; do not duplicate them or regenerate working keys.

The read-only route GET /v1/internal/p0b/parity-verified-page (limit 1 to 3, optional after=<64-hex batch SHA>) checks every archived outbox bundle on a keyset page using the existing B2SpoolManager.readBundleVerified. This performs independent B2 GET, AES-GCM authentication, gzip recovery, SHA-256 check and candidate manifest validation, then confirms exact D1 queue, normalized article and transactional ACK metadata. The route is protected behind existing CONTROL_PLANE_TOKEN authorization. It does not return source content, modify rows, or self-certify anything.

## D1 migration and full backlog assertions

Apply all pre-existing migrations using the repository-owned protected GitHub deploy workflow .github/workflows/deploy-d1-control-plane.yml on the exact approved main SHA. If you have authorized Wrangler credentials, the equivalent commands from workers/control-plane are:

    npx wrangler d1 migrations apply DB --remote --config wrangler.runtime.jsonc
    npx wrangler d1 execute DB --remote --config wrangler.runtime.jsonc --command "SELECT * FROM v_p0b_unhandled_activation;"
    npx wrangler d1 execute DB --remote --config wrangler.runtime.jsonc --command "SELECT evidence_state, COUNT(*) AS cells FROM v_hot50_three_category_evidence GROUP BY evidence_state ORDER BY evidence_state;"
    npx wrangler d1 execute DB --remote --config wrangler.runtime.jsonc --command "SELECT country_iso3,category,observed_events,original_dated_events,same_event_independent_pair,evidence_state FROM v_hot50_three_category_evidence ORDER BY country_iso3,category;"

Exact fail-closed D1 logical-zero assertion (provider Queue and remote B2 checks are separate):

    SELECT CASE WHEN outbox_pending=0 AND queue_unhandled=0
      AND bundles_unhandled=0 AND r2_pending=0
      AND historical_unarchived=0 AND outbox_bundle_mismatch=0
      AND outbox_item_mismatch=0 THEN 'D1_ZERO_PENDING'
      ELSE 'D1_UNHANDLED_ITEMS' END AS logical_backlog_status
    FROM v_p0b_unhandled_activation;

Country-wise native-original evidence coverage, with empty-bucket flags:

    SELECT country_iso3,
      SUM(CASE WHEN original_dated_events>0 THEN 1 ELSE 0 END) AS native_cells,
      ROUND(100.0*SUM(CASE WHEN original_dated_events>0 THEN 1 ELSE 0 END)/3,2)
        AS native_metadata_coverage_pct,
      SUM(CASE WHEN evidence_state='EMPTY' THEN 1 ELSE 0 END) AS empty_cells,
      SUM(CASE WHEN same_event_independent_pair>0 THEN 1 ELSE 0 END)
        AS same_event_two_publisher_cells
    FROM v_hot50_three_category_evidence
    GROUP BY country_iso3 ORDER BY country_iso3;

The score above is metadata coverage, NOT reviewer-certified cell coverage.

All seven counts in v_p0b_unhandled_activation must be zero, including outbox_pending, queue_unhandled, bundles_unhandled, r2_pending, historical_unarchived, outbox_bundle_mismatch and outbox_item_mismatch. This condition is necessary but not sufficient: independent B2 GET + LIST and actual provider Queue backlog metrics must also succeed. Do not delete, reset or ACK rows to manufacture a zero census.

## FIFO encrypted redrive

The existing 10-minute cron executes compare-and-set leases, bounded retry and replay. A single bounded owner-authorized extra round is:

    node scripts/ops/verify-hot50-activation-full.mjs --redrive

The command calls the existing POST /v1/internal/activation/redrive route, with CONTROL_PLANE_TOKEN sourced securely from the authorized environment. The existing route limits replay to two encrypted outbox batches, FIFO queue dispatch to 100 references, and R2 fallback to two batches; it preserves SHA-based idempotency, outbox ciphertext and the account quota/circuit governor. Inspect the subsequent full census; a partial round is not equivalent to zero backlog. Do not spin in an unbounded replay loop or bypass held quota.

For read-only status and remote per-object GET audit:

    node scripts/ops/verify-hot50-activation-full.mjs

## Full B2-D1 object manifest matching

The full audit walks all archived outbox batches using the protected paginated verifier and asserts that the number independently B2-read-backed matches the D1 archived census. For a separate, strictly opt-in physical B2 LIST pass, use existing restricted Backblaze S3 credentials in your secure operator environment:

    GEOMACRO_B2_LIST_MAX_REQUESTS=25 node scripts/ops/verify-hot50-activation-full.mjs --b2-list

Required existing environment variable names are CONTROL_PLANE_TOKEN, B2_S3_ENDPOINT, B2_SPOOL_BUCKET, B2_SPOOL_PREFIX, B2_KEY_ID and B2_APPLICATION_KEY. The operator S3 ListObjectsV2 audit uses paginated listing restricted to the approved spool prefix, compares B2 archived bundle keys and D1 references in BOTH directions, and fails for missing/orphan objects or an incomplete scan. This separate LIST uses B2 provider API operations and must be admitted under your operating cost guard. Without --b2-list, B2-D1 Parity deliberately remains FAIL even if per-object GET succeeds. Legacy single-item B2 JSON objects and separate Phase 2H/raw archival families are distinct registries; a P0B bundle pass cannot be represented as whole-account parity.

## Evidence, qualification and 150-cell coverage

The exact 50-country ISO3 source-of-truth is workers/control-plane/src/risk-gate-hot50-scope.mjs. Three categories produce 150 country/category cells. Progressive fact rows require stable observation_id (64-hex), country_iso3, category, event_fingerprint (64-hex), publisher_domain, native event_clock, clock_basis and observed_at. Original-page qualified freshness requires clock_basis ORIGINAL_PUBLICATION, a native timestamp within the rolling 72-hour window (not rewritten), an exact same-event fingerprint and independently verified original source and evidence identity. Two distinct publishers of the same event support metadata corroboration, but do not prove independent authorship, source rights, human reviewer approval, or valid signed GRO. An indexed-only observation remains INDEX_ONLY. Missing cells remain EMPTY, never score zero.

Metadata grades: EMPTY, INDEX_ONLY, NATIVE_DATED_METADATA, MULTI_PUBLISHER_METADATA. Additional signed reviewer authority and original-source corroboration must pass the existing watchdog before real risk-index publication. Current qualified_certified_cells from the census is a deliberate strict blocker until actual upstream evidence is validated; do not promote it using internal triage.

## Three reviewed signed indices and Ask GeoMacro

Existing protected GRI v1.2 review and publication provides the parent verified snapshot; the existing reviewed-index handler projects the three child readings and signs only delivery with the deployed RISK_GATE_DECISION_ED25519 key. Ed25519 delivery signature is NOT substitute evidence for the reviewer. The same-origin /api/public/reviewed-risk-indices bridge validates that signature and the current 60-minute native source clocks. On missing reviewer proof, unavailable is correct; never substitute the self-certified news severity or progressive Risk Gate activity proxy.

Configure audit verification with the approved public (not private) keys:

- GEOMACRO_RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64: the existing issuer public SPKI for the deployed protected signing key
- GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM: independently approved reviewer public key
- GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256: pinned SHA256 of reviewer public DER/SPKI approved out of band, different from issuer key

Check existing bindings without printing secret VALUES:

    npx wrangler secret list --config wrangler.runtime.jsonc

Only the authorized operator may add a truly missing secret:

    npx wrangler secret put SECRET_NAME --config wrangler.runtime.jsonc

Do not re-key Groq, replace issuer keys, upload reviewer private keys, or inject test reviewer certificates. The Ask audit makes two reads each for the three existing /api/public-ask domain questions, measures observed latency and cache status, and requires real current GRI context. No network client can truthfully guarantee 0ms latency; regression acceptance is no additional blocking inference on a true cache hit.

## Strict five-gate production report

    node scripts/ops/verify-hot50-activation-full.mjs --b2-list

The report prints PASS/FAIL for Backlog Census, B2-D1 Parity, Hot 50 Coverage, Index Signing and Ask GeoMacro Retrieval. Exit status is nonzero unless ALL pass. An unavailable metric, missing B2 LIST, unfinished keyset scan, fewer than 150 source-native cells, missing genuine reviewed input, absent verifier pin or absent Ask index leaves the relevant gate FAIL. CI-only mock PASS is not production acceptance.

Deploy using the existing protected workflow, verify exact-head CI and Cloudflare published Worker, then rerun the real five-gate report. Roll back only the Worker version if deployment fails; never roll back durable evidence by deleting pending ciphertext or resetting canonical ACKs. Do not activate payments as a side-effect.
