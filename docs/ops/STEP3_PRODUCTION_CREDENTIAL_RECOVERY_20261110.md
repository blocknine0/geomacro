# Stage 2: production credential recovery without secret rotation

Date: 2026-11-10. Scope: `blocknine0/geomacro` production Stage 2 only.
No SQL migrations, canary HOLD changes, payments, Worker deployment, or secret-value disclosure are authorized by this runbook.

## Verified owner-side discovery

`gh secret list -e production` and repository-level `gh secret list` both returned **no** `CONTROL_PLANE_TOKEN` and **no** `PHASE2H_R2_REFERENCE_HMAC_KEY`. These are mandatory inputs in `.github/workflows/production-rollout-orchestrator.yml` Stage 2, and previous run #42775707705 printed blank names. Their absence is a confirmed workflow configuration failure, not evidence that production Worker credentials are absent.

## 1. Identify existing safe recovery sources, without reading values

Run in owner-authenticated WSL:

```bash
set -euo pipefail
REPO=blocknine0/geomacro
echo 'Existing GitHub ledger-root secret name, production environment:'
gh secret list -R "$REPO" -e production --json name --jq   '[.[].name | select(.=="GEOMACRO_COMMERCE_LEDGER_TOKEN")]'
echo 'Existing GitHub ledger-root secret name, repository:'
gh secret list -R "$REPO" --json name --jq   '[.[].name | select(.=="GEOMACRO_COMMERCE_LEDGER_TOKEN")]'
echo 'Actual deployed Control Plane Worker secret NAMES only:'
npx -y wrangler@4.136.3 secret list --name geomacro-control-plane
```

`wrangler secret list` and `gh secret list` never return secret values. The Cloudflare list is a presence check; it does not prove that credentials match. If the CLI uses a different deployed Worker name, first reconcile the name with production Cloudflare Worker inventory; do not write to an unverified target.

## 2. Restore the existing production bearer only when cryptographically confirmed

The repo already has `scripts/ops/derive-control-plane-root-token.mjs`, which derives HMAC-SHA256 of the string `geomacro-control-plane-v1` using the **existing** `GEOMACRO_COMMERCE_LEDGER_TOKEN`. `scripts/ops/prepare-five-gate-control-token.mjs` proves an existing-token match by an authenticated read-only `/v1/internal/p0b/status` GET.

If the owner still has the root secret in an approved local vault, they may recover the already deployed bearer without rotating it, but only after a **real 200 authenticated provider check** against the correct live Worker. A root secret whose derived token fails that check must be rejected. A GitHub encrypted secret's value cannot be retrieved through `gh secret list` or a normal workflow log.

Once and only once the owner has verified that the derived token matches the existing live production Worker, store the recovered bearer through a protected stdin pipe:

```bash
printf '%s' "$VERIFIED_EXISTING_CONTROL_PLANE_TOKEN" |
  gh secret set CONTROL_PLANE_TOKEN -R blocknine0/geomacro -e production
unset VERIFIED_EXISTING_CONTROL_PLANE_TOKEN
```

`VERIFIED_EXISTING_CONTROL_PLANE_TOKEN` is a local protected shell variable, not a value to paste into chat, a GitHub issue, command history, or CI logs. Never set a new random bearer on just GitHub: it will not authenticate the existing Worker.

## 3. Restore the existing production Phase2H HMAC without substituting Shadow

`PHASE2H_R2_REFERENCE_HMAC_KEY` is a **separate** 64-hex-char production secret. The isolated `PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY` is **not** a backup. Production HMAC must match any preexisting signed R2 pointers and the real deployed Worker secret. Cloudflare's Worker secret API is write-only: listing a secret name cannot reveal its value.

Recover the original from the owner's secret manager or securely stored original provisioning record and independently verify it against a real authenticated production pointer. Only then restore it to GitHub, passing exactly 64 lower-case hex characters by stdin. No value should appear in terminal stdout or chat.

If the original key is unavailable, **HOLD all real-reference publishing, read cutover, or verification of any existing pointers**. The production Stage2 runner may instead perform **schema-only empty 0213 staging**, with no key issuance or reference cutover, only if the canonical native ledger proves 0213 not applied, a fresh same-target D1 schema query proves no preexisting ref table, Cloudflare live Worker `/settings` proves writer and reader flags 0/absent and no deployed HMAC, `/deployments` proves a single 100%-deployed version, and the post-DDL D1 table remains empty. The final signed receipt must label this mode `EMPTY_OPT_IN_TABLE_SCHEMA_VERIFIED` with `real_production_pointer_hmac_verified=false`. A single real pointer requires the existing production HMAC and authenticated byte readback. A new key is justified only through a separately reviewed *first-time initialization* or coordinated key-versioned rotation, after independently proving no dependent existing pointers, archived signed manifests, readers or Worker paths are stranded. The absence of `phase2h_raw_object_refs_v1` on today's production D1 is **not** by itself a complete account-wide inventory or rotation authorization.

## 4. Mandatory checks before any Stage 2 dispatch

- The existing control bearer must authenticate against the real Worker. The verified existing-ledger-root derivation can be used within the protected Stage2 job without persisting an extra GitHub secret.
- Existing-pointer mode: exact production HMAC matches genuine pointer proof; **or**, strictly separate no-key schema-only mode: D1 native/schema and live deployed Worker OFF proof, with a verified empty post-DDL table. No R2 pointer activation authorized.
- Fresh reviewed exact-main SHA, signed Stage 1 physical Shadow proof, native production migration history, D1 Paid monthly quota admission with 30% reserve, native D1 Time Travel bookmark and encrypted private R2 readback.
- Post-migration real D1 counter parity, B2 original readback, R2 pointer bytes/HMAC and dual-Worker/Hot 50 proofs required independently.
- Preserve `config/d1-hotspot-v2-canary.hold`, crypto-only payments OFF and existing Predge non-commercial research feed unchanged.

Secret **presence** is not proof of functional parity; do not dispatch `execute_stage2=true` based only on names.
