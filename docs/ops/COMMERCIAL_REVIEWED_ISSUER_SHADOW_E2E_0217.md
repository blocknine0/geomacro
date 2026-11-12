# Commercial reviewed issuer + shadow E2E release runbook

## Safety boundary (MANDATORY)

- Migration 0216 must be physically read back on both named D1 databases.
- Migration 0217 is additional and must be independently applied/read back
  before production flags can be enabled. Neither migration implies customer
  authorization; never edit the immutable 0214 internal GRO row in place.
- Control Plane defaults: GEOMACRO_COMMERCIAL_STREAM_RELEASE=0,
  RISK_STREAM_CANARY_HOLD_CLEARED=0. No currency, credit or payment
  collection occurs in this issuer.
- Both original source rows must have original_verified=1, enabled=1,
  commercial_rights_approved=1, and a future rights_expire_at. Two
  independent root domains and parent media entities with the category's
  mandatory roles must match.
- The original signed GRO remains customer_delivery_authorized=false.
  A new, separately signed GRO with explicit commercial_origin_gro_id is
  created only after an independent reviewer validates the proposed hash.
- GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64 is a Cloudflare secret binding
  containing the trusted independent reviewer Ed25519 public SPKI in base64;
  it is NOT the GeoMacro license key or GRO signer key.
- GEOMACRO_RELEASE_REVIEWER is a distinct Cloudflare Service Binding to an
  independently reviewed release-authority Worker, not installed by this PR.
  It must return a signed geomacro.commercial-review-result.v1 with grants
  referencing exact source_gro_sha256, proposed_gro_sha256, client_id and
  eligible_derived_score_sha256. Missing/mismatched/unsigned review => HOLD.
  There is NO synthetic fallback for this production service.
- Each client must be enabled in risk_stream_commercial_subscriptions with
  an unexpired entitlement, approved HTTPS host and matching release receipt.
- Cron emits a distinct authorized GRO, issues
  GEOMACRO_COMMERCIAL_REDISTRIBUTION_v1 and writes the 0216 outbox with
  exact readback; then the normal dispatcher requires HTTP 200 JSON ACK.
- Existing signed review approval has to be fresh (one hour), so unprocessed
  GROs may expire after three hours and require a new evidence cycle.
- The 0217 queue retains pending work when reviewer service is unreachable.
  Expired or unreviewed events never become paid deliveries.

## Apply and verify 0217 (operator, protected stage)

Run only after Step3 D1/B2 backup and protected migration approval:

    npx -y wrangler@4.136.3 d1 execute geomacro-risk-stream-shadow --remote \
      --file workers/control-plane/migrations/0217_risk_stream_commercial_issuer_jobs.sql
    npx -y wrangler@4.136.3 d1 execute geomacro-control-plane --remote \
      --file workers/control-plane/migrations/0217_risk_stream_commercial_issuer_jobs.sql

Then run read-only SELECT separately on both:

    SELECT name,type,sql FROM sqlite_schema WHERE name IN
    ('risk_stream_commercial_issuer_jobs',
     'idx_risk_stream_commercial_issuer_due')
    ORDER BY type,name;

Do not infer remote schema presence from migration execution count.

## Shadow commercial staging — after merge

This runs only on exact executing main SHA, via protected production GitHub
environment credentials but mutates **only shadow D1 / isolated shadow Worker**.
It generates a synthetic signed GRO + synthetic review, signs the commercial
license using the **actual injected shadow license key**, inserts and rereads
the 0216 outbox, makes a real HTTPS request to a dedicated mock ACK Worker
authenticated by an ephemeral HMAC-derived token, and checks 0216 delivery
receipts. It never contacts a real customer. Synthetic review cannot establish
original rights or authorize production commercialization.

    gh workflow run risk-stream-commercial-staging.yml \
      -R blocknine0/geomacro --ref main \
      -f approval=RUN_SHADOW_COMMERCIAL_E2E_NO_FUNDS
    gh run list -R blocknine0/geomacro \
      --workflow=risk-stream-commercial-staging.yml --limit 3

Expected signed artifact: geomacro-shadow-commercial-e2e /
artifacts/release/shadow-commercial-e2e.json. Do not accept fixture test
results as independent original source evidence or global zero-503 proof.

## Canary additive-secret approval

For a candidate with newly added reviewed secret bindings, the owner must
provide the exact comma-separated secret names when dispatching the protected
canary workflow. Only these exact additions are allowed:
GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64,
GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64,
GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64, RISK_STREAM_INDEX_LEAD_BEARER.
No existing binding may be removed or type-changed.

The protected runner produces
artifacts/release/canary-reviewed-additive-bindings.json signed with
SIGNING_JWK. The promoter verifies that signed payload belongs to exact
main SHA, baseline UUID and candidate UUID and is no more than one hour old.
Unreviewed additions, unknown types, missing receipts or stale SHA => HOLD.

    gh workflow run canary-promotion.yml -R blocknine0/geomacro \
      --ref main -f operation=promote \
      -f baseline_version_id="$BASELINE_VERSION_ID" \
      -f candidate_version_id="$CANDIDATE_VERSION_ID" \
      -f reviewed_additive_secret_names="$REVIEWED_NAMES" \
      -f stage2_run_id="$STAGE2_RUN_ID" \
      -f confirmation=PROMOTE_HOT50_NO_FUNDS

This is **not** permission to remove config/d1-hotspot-v2-canary.hold.
Removal remains a separately approved reviewed PR after all stages,
provider D1/B2 evidence, and the complete post-promotion UTC day.
