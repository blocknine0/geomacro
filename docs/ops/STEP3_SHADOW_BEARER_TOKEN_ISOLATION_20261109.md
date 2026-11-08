# Stage 1 Shadow bearer token isolation (2026-11-09)

## Confirmed diagnosis
Protected read-only GitHub Actions run [42522434063](https://github.com/blocknine0/geomacro/actions/runs/42522434063) ended **HOLD**, with 17/25 checks PASS and eight HOLD. New/legacy shadow Workers, isolated shadow D1, recovery/shadow R2 names, and separate shadow HMAC GitHub secret are present. The existing **production** `CONTROL_PLANE_TOKEN` and `PHASE2H_R2_REFERENCE_HMAC_KEY` were not available to this workflow, and the public signing JWK, reviewed SHA and two physical approvals were also missing. Never present a configuration-only success as physical rehearsal PASS.

## Auth separation contract
- For **Shadow Stage 1**, the GitHub environment secret `GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN` is passed into the runner as `CONTROL_PLANE_TOKEN`. Configure the **same independent token** on both deployed Shadow Workers under each Worker's Worker Secret name `CONTROL_PLANE_TOKEN`.
- For **Production Stage 2**, the **existing production** GitHub secret `CONTROL_PLANE_TOKEN` remains the only authorized bearer credential, without fallback to a shadow token. The newly generated shadow token MUST NEVER replace any live production token.
- The protected inventory reports a separate `stage1_status` and `stage2_status`, rejecting reused shadow+production tokens where both are configured. Its main `status` remains HOLD until every check passes.
- The separate HMAC key stays `PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY` for Stage1, while Stage2 retains the original `PHASE2H_R2_REFERENCE_HMAC_KEY`.

## One-time owner-only steps: initialize shadow token without showing it

Run from the owner's WSL shell. This does NOT change live systems on its own:

```bash
set -euo pipefail
umask 077
mkdir -p "$HOME/.config/geomacro"
chmod 700 "$HOME/.config/geomacro"
TOKENFILE="$HOME/.config/geomacro/step3-shadow-control-token.hex"
if [ ! -e "$TOKENFILE" ]; then
  openssl rand -hex 32 > "$TOKENFILE"
  chmod 600 "$TOKENFILE"
fi
TOKEN="$(cat "$TOKENFILE")"
[[ "$TOKEN" =~ ^[a-f0-9]{64}$ ]] || { echo "SHADOW_TOKEN_INVALID"; exit 1; }
printf '%s' "$TOKEN" | gh secret set GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN -R blocknine0/geomacro -e production
unset TOKEN
echo "GITHUB_SHADOW_TOKEN_NAME_SYNCED"
```

To configure Cloudflare (when Wrangler OAuth is unavailable), copy the owner-local token to Windows clipboard WITHOUT printing it: `printf '%s' "$(cat "$HOME/.config/geomacro/step3-shadow-control-token.hex")" | clip.exe`. Paste as **Secret** `CONTROL_PLANE_TOKEN` into **BOTH** isolated Workers in Cloudflare dashboard → Workers & Pages → each Shadow Worker → Settings → Variables and Secrets, Deploy; do not change the production Worker. Clear clipboard after both pastes with `printf '' | clip.exe`. The user's local encrypted vault/password manager should safely back up the original token, not the chat.

Confirm only names, without values:
```bash
gh secret list -R blocknine0/geomacro -e production --json name \
  --jq '.[] | select(.name=="GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN") | .name'
```

GitHub can confirm the secret name but cannot read back the protected secret. Real dual-Worker authenticated readback against the isolated Shadow D1 is required to prove that the three secret values match. The Shadow Worker-only HMAC also requires its own real pointer readback.

## Other physical gates still HOLD
1. Set reviewed SHA only after verifying the exact main revision; do not pin stale SHAs.
2. Check actual private recovery R2 encryption/PUT/readback before asserting `GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED=YES`.
3. Verify independent B2-archived authentic Shadow D1 original and pointer-hmac readback before `GEOMACRO_STEP3_SHADOW_POINTER_SEED_APPROVED=YES`.
4. Derive and verify the trusted public signer matching the existing private `SIGNING_JWK`; never print the private signer or rotate it casually.
5. Ensure Production token/HMAC are independently recoverable and verifiable before Stage2; do not generate replacements from Shadow keys.
6. Keep `config/d1-hotspot-v2-canary.hold` and payment OFF. Stage1 real physical PASS, protected production D1 migration and 0→100% canary are separate operations.
