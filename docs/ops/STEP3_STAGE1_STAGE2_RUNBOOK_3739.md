# Issue #3739 — Stage 1 → Stage 2 release admission (2026-11-08)

## Authoritative state

- Reviewed PR: https://github.com/blocknine0/geomacro/pull/3741 (stacked on draft PR #3732).
- Original failed run: https://github.com/blocknine0/geomacro/actions/runs/42489480676 had **zero physical rehearsal artifacts**. No production D1 DDL was run.
- Local Miniflare tests generate **step3-shadow-local-rehearsal-receipt.json** with `proof_scope=LOCAL_SIMULATION_ONLY`. It is NEVER accepted by `--apply`.
- Real shadow runner may sign `PASS` only after Cloudflare D1/Time Travel, encrypted private R2 full byte readback, all four reviewed migrations, old/new deployed Worker binding/write/readback, independent governed B2 GET and R2 pointer-HMAC proof.
- Production runner requires a signed **REAL_PROVIDER_SHADOW** receipt, exact main SHA + migration-set SHA, matching shadow database identity, matching GitHub run ID and independent physical flags before any provider work.
- No payment activation, production D1 migration, customer data mutation, Worker deploy or canary promotion is performed merely by merging PR #3741.

## One-time owner setup (secrets never printed)

1. Review/merge prerequisite PR #3732, then review/merge PR #3741 and pin the **resulting main commit SHA**. Do not use an arbitrary draft-head SHA as a production migration approval.
2. Provision/verify Cloudflare private recovery R2 and isolated shadow R2 buckets; confirm the Cloudflare API token has D1 and R2 object read/write plus Worker settings/deployments read access. Billing Read must support monthly provider headroom verification.
3. Provide separate genuinely deployed `geomacro-step3-shadow.<subdomain>.workers.dev` and `geomacro-step3-shadow-legacy.<subdomain>.workers.dev` that both bind `DB` to the **shadow** D1 UUID. The modern script must bind `PHASE2H_PRIVATE_R2` to the approved private shadow bucket. The shadow D1 must have a current B2-ACKNOWLEDGED authentic source.
4. Keep deployed HMAC and bearer token stable. Do **not** generate a new HMAC for already stored pointer proofs, and do **not** generate a new `CONTROL_PLANE_TOKEN` unless rotating its actual Worker secret at the same time.
5. Configure GitHub `production` environment Actions secrets (or repo secrets if an environment secret does not override): `GEOMACRO_D1_RECOVERY_AES256_KEY_B64`, `SIGNING_JWK`, `GEOMACRO_STEP3_TRUSTED_SIGNER_PUBLIC_JWK`, `CONTROL_PLANE_TOKEN`, `PHASE2H_R2_REFERENCE_HMAC_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `B2_ARCHIVE_READ_KEY_ID`, `B2_ARCHIVE_READ_APPLICATION_KEY`, `RISK_GATE_TIERED_TOKEN`, `GEOMACRO_COMMERCE_LEDGER_TOKEN`.
6. Configure GitHub vars `D1_DATABASE_ID`, `GEOMACRO_D1_SHADOW_DATABASE_ID`, `GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED=YES`, `GEOMACRO_STEP3_RECOVERY_V2_APPROVED=YES`, plus the R2 buckets/approval vars and shadow Worker URLs. These approvals must reflect verified real resources.
7. Where GitHub CLI is authenticated, use `bash scripts/ops/setup-step3-github-bindings.sh` to set missing approved values without exposing or rotating existing Worker credentials. Export the script's documented `STEP3_*` environment inputs privately first. This script cannot discover Cloudflare Worker secrets or invent B2 copies.

## Manual protected run sequence

1. In GitHub Actions, open **Step3 Protected Local Shadow and Stage2 Orchestrator** on canonical `main`.
2. Dispatch with `approval=REHEARSE_D1_SHADOW_ONLY_NO_PRODUCTION_SQL`, `execute_stage2=false`. Inspect the artifact `geomacro-step3-real-shadow`; verify genuine **signed PASS**, exact SHA, checked physical recovery, B2 and Worker fields.
3. If and only if actual Stage 1 physical PASS exists, dispatch with the same approval and `execute_stage2=true`, `verify_hot50=true` after protected environment approval. The workflow does not reuse a local/mock receipt; it takes a **separate new production** encrypted recovery checkpoint before applying reviewed 0204 → 0211 → 0212 → 0213.
4. Confirm `geomacro-step3-production` plus `geomacro-step3-hot50-150-cell-proof`, including complete 50×3 signed GRO census across the three pricing tiers. Keep production canary HOLD until independent deployment/merchant acceptance.
5. Canary version promotion and checkout are **not** inferred from Stage 2: use existing protected Worker rollout after verifying both actual Worker version UUIDs and SLOs. Payment activation requires merchant live-money acceptance, signed evidence licensing/rights and an independently approved rollout. This PR does not flip payments.

## Proof boundaries

`local PASS != real shadow PASS != production D1 PASS != signed Hot50 coverage != live merchant acceptance`.

If a provider requirement is missing, each individual release stage holds without fabricating proof or pausing unrelated live ingest/news/customer APIs.
