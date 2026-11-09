# Step3 Nov 9 2026 — Shadow Stage1 D1 paid headroom proof restored without bypass

## Concrete provider incident

[Run #42592419785](https://github.com/blocknine0/geomacro/actions/runs/42592419785) on immutable main `9d60b5db6a4873aebc65d28cdc18a303648dd2db` had:
- local-workerd **PASS**;
- shadow-physical **HOLD** on `node scripts/ops/check-d1-paid-monthly-headroom.mjs --check`, code `D1_PAID_MONTHLY_PROVIDER_HEADROOM_NOT_VERIFIED`;
- `stage2-production` and `hot50-readback` both **SKIPPED**, no D1 production SQL;
- reviewed SHA and Shadow pointer-seed approval now both present and correct in protected production environment.

The independent genuine original archive [run #42587704315](https://github.com/blocknine0/geomacro/actions/runs/42587704315) passed exactly the same paid-monthly provider verifier with Cloudflare paid subscription and all-account GraphQL D1 usage, but its job explicitly supplied **`CLOUDFLARE_BILLING_READ_TOKEN`**, the separate restricted read-only billing subscription credential.

The Stage1 orchestrator omitted the dedicated token, causing `checkD1PaidMonthlyHeadroom()` to attempt the account-subscriptions GET with the general `CLOUDFLARE_API_TOKEN` fallback. A general API token may have valid D1/GraphQL access but lack Billing Read. Missing separate Billing Read is an established configuration discrepancy; do **not** claim it is the only possible provider failure until the fresh physical result proves PASS.

## Exact fix

The protected `shadow-physical` and optional `stage2-production` jobs now explicitly pass the **existing** GitHub `production` environment secret `CLOUDFLARE_BILLING_READ_TOKEN`. No token is generated or rotated, and `local-workerd`/Hot50 do not receive it.

The read-only verifier continues to require:
1. Real account-scoped **Workers Paid** subscription from Cloudflare `GET /accounts/{account}/subscriptions` using the dedicated Billing Read token.
2. Account-wide D1 GraphQL rows read/written for the entire billing cycle, including the current UTC date and complete grouping.
3. Strict paid monthly limits, owner reserve, paced headroom and separate migration reserve. Zero-policy fallback, fake PASS, skipping or `continue-on-error` are prohibited.

On HOLD, the CLI outputs only allowlisted fixed uppercase reason/provider-error codes and a pointer to the JSON report. The Shadow and Stage2 `if: always()` artifacts now include `artifacts/release/d1-paid-monthly-headroom.json` even on failure, so no more unexplained generic HOLD. No raw provider HTTP response body or bearer is logged.

## Exact-main reviewed-SHA operational step

A reviewed PR merge changes `main` SHA, so the owner must **review the new main commit** and update `GEOMACRO_STEP3_REVIEWED_SHA` in the protected `production` environment before rerunning Stage1. Do **not** remove this pin or silently assign new SHA through CI.

Run only:
```bash
gh workflow run production-rollout-orchestrator.yml -R blocknine0/geomacro --ref main \
 -f approval=REHEARSE_D1_SHADOW_ONLY_NO_PRODUCTION_SQL \
 -f execute_stage2=false -f verify_hot50=false
```

This gates **Shadow-only** operations. Production migrations, canary, payments and Hot50 commercialization remain separate hold/proof boundaries.

## Notes

Provider telemetry may lag; paid plan subscription proof and monthly headroom do not guarantee account billing limit or zero overage. Genuine B2→Shadow D1 ACK PASS does not prove signed HMAC pointer or encrypted R2 recovery checkpoint until fresh Stage1 receipt independently verifies them.
