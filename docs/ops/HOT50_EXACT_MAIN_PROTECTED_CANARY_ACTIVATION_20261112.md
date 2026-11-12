# Hot50 exact-main commercial/canary activation: operator addendum

This is an operational plan, not an authorization to release production
commercial traffic. PR #3939 already supplies 150-cell rotation, five discovery
lanes, Google News metadata-only search, Queue pacing and 0216 signed history.
This PR makes Standard and Complex snapshot claims depend on actual signature
and R2 proof, not just rows in D1. Publisher index hits remain unverified.

## Provider schema and rights preconditions

- The existing protected Stage2 pipeline checks 0204-0213. It does NOT
  automatically prove or install migration 0218. With signed operator approval,
  D1 paid quota headroom and backup/rollback evidence, install 0218 on isolated
  shadow D1 and read back all five SQL objects, then independently install and
  read back 0218 on production D1. Check the source SHA again.
- Do not convert unassigned countryless discovery to an invented ISO3.
- Original-source fact/rights Ed25519 attestations, independent publisher
  ownership, matching event fingerprint, source commercial rights and
  actual source GRO signature are mandatory for Standard.
- Only the independent customer reviewer, real subscription and release
  certificate can authorize a commercial license and outbox staging.
- Existing private R2/0216 7-day verifier must check seven genuine UTC days
  and immutable signed chain before any Complex-ready claim.

## Production signing keys: no automatic deployment

Use a protected local machine with a reviewed JSON object containing only the
secrets already provisioned and approved by the owner:

    umask 077
    test -f "$PROTECTED_SECRETS_JSON"
    npx -y wrangler@4.136.3 versions secret bulk \
      --name geomacro-control-plane < "$PROTECTED_SECRETS_JSON"
    npx -y wrangler@4.136.3 versions list \
      --name geomacro-control-plane --json

This CREATES a Worker version; it does not guarantee the subsequent code
candidate uses that exact version or deploy anything. Inspect actual
baseline/candidate version resource bindings, source SHA, D1, R2, Queue, routes
and signing key pins. Do not paste secrets into logs or GitHub. The canary
reviewed-additive list covers four known secret_text additions only; all other
bindings, including the autonomous plain_text feature toggle, must already
exist on the baseline with matching name/type or the canary remains HOLD.

## Protected exact-main orchestration

    REPO=blocknine0/geomacro
    gh api repos/$REPO/branches/main --jq '.commit.sha'
    gh workflow run production-rollout-orchestrator.yml \
      -R "$REPO" --ref main \
      -f approval=REHEARSE_D1_SHADOW_ONLY_NO_PRODUCTION_SQL \
      -f execute_stage2=true -f verify_hot50=false
    gh run list -R "$REPO" \
      --workflow=production-rollout-orchestrator.yml --limit 5

Once protected shadow+Stage2 succeeded on same SHA, migration 0218 readback
passed separately, independent rights and exact 0%-traffic Worker candidate
are verified, run the promoter (never manually forge receipts):

    gh workflow run canary-promotion.yml -R "$REPO" --ref main \
      -f operation=promote \
      -f baseline_version_id="$BASELINE_VERSION_ID" \
      -f candidate_version_id="$CANDIDATE_VERSION_ID" \
      -f reviewed_additive_secret_names="$REVIEWED_NAMES" \
      -f stage2_run_id="$STAGE2_RUN_ID" \
      -f confirmation=PROMOTE_HOT50_NO_FUNDS

The existing protected promoter controls 0,1,5,25,50,100, live provider
observability and rollback. Leave commercial release and canary HOLD off until
separate signed approval and the real post-promotion UTC-day proof.
Never promise zero D1 503 or 150 saleable cells based on simulated tests.

## Physical readback

    SELECT country_iso3,category,basic_status,standard_status,
           complex_status,source_gro_id,refreshed_at
      FROM risk_stream_hot50_cell_snapshots
     ORDER BY country_iso3,category LIMIT 150;
    SELECT state,COUNT(*) AS n FROM risk_stream_commercial_outbox
     GROUP BY state;
    SELECT day_utc,COUNT(*) AS n FROM risk_stream_commercial_risk_chain
     GROUP BY day_utc ORDER BY day_utc DESC LIMIT 7;

Accept only provider-backed signed original evidence, real 0216 ACK receipts,
the correct stage2 SHA, R2 signature/readback proof and honest quota metrics.
