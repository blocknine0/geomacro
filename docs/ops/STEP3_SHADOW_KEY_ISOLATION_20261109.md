# Step3 Shadow Worker key separation and no-production verification (2026-11-09)

## What exists
The owner deployed **two real isolated Cloudflare Workers**:
- `geomacro-step3-shadow.daspallab202391.workers.dev` candidate, bound to shadow D1 `c4add153-229d-412a-b1bd-489526b7e02f` and private `PHASE2H_PRIVATE_R2=geomacro-step3-shadow-private`.
- `geomacro-step3-shadow-legacy.daspallab202391.workers.dev`, bound to the same **shadow-only** D1.
- The production canonical D1 is **different**: `db057ca9-9f6e-4957-ac28-144f3b798f9b`.
- Both workers have source fanout, bundled leases and reference-only activation OFF. Neither deployment proves Stage1 physical PASS.

The owner created a random 64-character **shadow-specific** hex HMAC at `~/.config/geomacro/phase2h-shadow-hmac.hex` and attempted to upload it to the candidate Worker. Because the input file contains a line ending, re-uploading **exactly 64 bytes**, without a trailing LF, is required before asserting a matching Worker secret. The Worker secret itself is write-only and cannot be read back.

## Mandatory separation
Never copy the newly generated shadow HMAC into the **production** `PHASE2H_R2_REFERENCE_HMAC_KEY`. Existing production R2 pointers may be signed with an older key; changing it breaks their verification. Never infer that there are no production pointers from the shadow D1's table count.

The real Shadow workflow maps **`PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY` GitHub secret** to the runner's in-process `PHASE2H_R2_REFERENCE_HMAC_KEY` input. Stage2 uses the separately protected **production** `PHASE2H_R2_REFERENCE_HMAC_KEY`. The readiness verifier checks both secrets' format and separation, without printing their values. A matching secret name is NOT cryptographic proof of deployed Worker parity: only real pointer/HMAC readback proves that.

## Owner-only WSL actions (the assistant cannot read the local key or edit protected GitHub secrets)

First confirm `gh auth status` and `npx -y wrangler@4.136.3 whoami` authenticate to the correct accounts. If Wrangler OAuth fails, use Cloudflare dashboard secret editor with the existing file's 64 hex characters without posting them to chat.

Run on the OWNER'S WSL shell, not in GitHub CI. Copy/paste the complete block:

```bash
set -euo pipefail
KEYFILE="$HOME/.config/geomacro/phase2h-shadow-hmac.hex"
test -r "$KEYFILE"
SHADOW_KEY="$(cat "$KEYFILE")"
[[ "$SHADOW_KEY" =~ ^[0-9a-f]{64}$ ]] || { echo "Shadow HMAC format INVALID"; exit 2; }
gh auth status >/dev/null
npx -y wrangler@4.136.3 whoami >/dev/null
# Only the isolated new SHADOW Worker gets this key; exactly 64 characters.
printf '%s' "$SHADOW_KEY" | npx -y wrangler@4.136.3 secret put PHASE2H_R2_REFERENCE_HMAC_KEY --name geomacro-step3-shadow
# This is a separate GitHub production ENVIRONMENT secret for STAGE1 only,
# not the production Worker signing secret.
printf '%s' "$SHADOW_KEY" | gh secret set PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY -R blocknine0/geomacro -e production
unset SHADOW_KEY
gh variable set GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST -R blocknine0/geomacro -e production -b geomacro-step3-shadow.daspallab202391.workers.dev
gh variable set GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST -R blocknine0/geomacro -e production -b geomacro-step3-shadow-legacy.daspallab202391.workers.dev
npx -y wrangler@4.136.3 secret list --name geomacro-step3-shadow
```

The last command only proves the **presence** of a secret name. Do not publish `SHADOW_KEY`, the file, bearer tokens or JWKs. If a command fails, do not skip it or declare parity.

## Separate remaining blockers

1. `CONTROL_PLANE_TOKEN` must be the existing live Worker bearer token, provisioned securely for **both** shadow Workers and protected GitHub `production` environment. Existing token value may not be readable from Cloudflare; do not invent a token or rotate live credentials without a coordinated, reviewed migration.
2. Production `PHASE2H_R2_REFERENCE_HMAC_KEY` must be independently recovered/verified. A newly generated shadow key does **not** stand in for it. Real production D1 pointer inventory and authenticated HMAC verification are required before any future rotation.
3. Real Cloudflare private recovery R2 access, trusted public/private signing key match, independent B2 reader and one legitimately B2-ACKNOWLEDGED **shadow** original are required. The Shadow D1 requires actual native schema/record inspection, not an unverified `num_tables` listing.
4. The exact merged `main` SHA must be reviewed/pinned, and the approved Worker versions, shadow source test, encrypted R2 checkpoint PUT/GET, real migrations, legacy/new Worker rollback and B2 SHA must all pass.
5. Run `Step3 Protected Binding Inventory — Read Only No Funds` first after supplying the verified secrets, then `Step3 Protected Local Shadow and Stage2 Orchestrator` with `approval=REHEARSE_D1_SHADOW_ONLY_NO_PRODUCTION_SQL`, `execute_stage2=false` only after all shadow prerequisites are true.
6. `0204→0211→0212→0213` production migrations, Hot50 150-cell signed GRO readback, protected 0→1→5→25→50→100% Worker canary and the release HOLD are **separate gates**. Payment remains OFF and unrelated source ingestion remains unaffected.

No code merge, GitHub green CI or Shadow Worker deployment is itself a live Cloudflare Stage1 receipt. Never remove `config/d1-hotspot-v2-canary.hold` to bypass physical gates.
