#!/usr/bin/env bash
# One command to bootstrap only the missing, safely creatable Stage3 bindings.
# Never rotates a live HMAC key or a Worker bearer token: doing so would
# invalidate existing signed pointers / break authentication.
set -Eeuo pipefail
repo="blocknine0/geomacro"
environment="production"
command -v gh >/dev/null || { echo "Install GitHub CLI (gh) first." >&2; exit 2; }
command -v openssl >/dev/null || { echo "OpenSSL required." >&2; exit 2; }
gh auth status >/dev/null
secret_names="$(gh secret list -R "$repo" -e "$environment" --json name --jq '.[].name')"
repo_secret_names="$(gh secret list -R "$repo" --json name --jq '.[].name')"
variable_names="$(gh variable list -R "$repo" --json name --jq '.[].name')"
has_secret(){ grep -Fxq "$1" <<< "$secret_names" || grep -Fxq "$1" <<< "$repo_secret_names"; }
has_variable(){ grep -Fxq "$1" <<< "$variable_names"; }
set_variable_if_missing(){
 local name="$1" value="$2"
 if has_variable "$name"; then echo "$name: already configured"; return; fi
 if [[ -z "$value" ]]; then
  echo "$name: owner must supply existing verified live resource name" >&2
  return 1
 fi
 gh variable set "$name" -R "$repo" --body "$value"
 echo "$name: configured"
}
if ! has_secret GEOMACRO_D1_RECOVERY_AES256_KEY_B64; then
 # This key is generated once and persists across D1 cold recovery.
 # Never rerun after an encrypted backup expecting a different key.
 openssl rand -base64 32 |
  gh secret set GEOMACRO_D1_RECOVERY_AES256_KEY_B64 -R "$repo" -e "$environment"
 echo "GEOMACRO_D1_RECOVERY_AES256_KEY_B64: generated and stored (value not exposed)"
else echo "GEOMACRO_D1_RECOVERY_AES256_KEY_B64: already configured"; fi
# HMAC is 64 HEX characters in the existing runtime, NOT base64.
if ! has_secret PHASE2H_R2_REFERENCE_HMAC_KEY; then
 if [[ -z "${EXISTING_PHASE2H_HMAC_HEX:-}" ||
       ! "${EXISTING_PHASE2H_HMAC_HEX}" =~ ^[a-fA-F0-9]{64}$ ]]; then
  echo "Required owner input: EXISTING_PHASE2H_HMAC_HEX, matching the deployed Worker." >&2
  exit 3
 fi
 printf %s "$EXISTING_PHASE2H_HMAC_HEX" |
  gh secret set PHASE2H_R2_REFERENCE_HMAC_KEY -R "$repo" -e "$environment"
 echo "PHASE2H_R2_REFERENCE_HMAC_KEY: existing Worker-compatible key configured"
fi
if ! has_secret CONTROL_PLANE_TOKEN; then
 if [[ -z "${EXISTING_CONTROL_PLANE_TOKEN:-}" ||
       "${#EXISTING_CONTROL_PLANE_TOKEN}" -lt 32 ]]; then
  echo "Required owner input: EXISTING_CONTROL_PLANE_TOKEN, matching the deployed Worker." >&2
  exit 4
 fi
 printf %s "$EXISTING_CONTROL_PLANE_TOKEN" |
  gh secret set CONTROL_PLANE_TOKEN -R "$repo" -e "$environment"
 echo "CONTROL_PLANE_TOKEN: existing Worker-compatible token configured"
fi
set_variable_if_missing GEOMACRO_D1_RECOVERY_R2_BUCKET "${STEP3_VERIFIED_RECOVERY_R2_BUCKET:-}"
set_variable_if_missing GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET "${STEP3_VERIFIED_SHADOW_R2_BUCKET:-}"
if [[ ! "${STEP3_VERIFIED_SHADOW_WORKER_HOST:-}" =~ ^geomacro-step3-shadow\.[a-z0-9-]+\.workers\.dev$ ]]; then
 echo "Required owner input: STEP3_VERIFIED_SHADOW_WORKER_HOST (real workers.dev host)." >&2
 exit 5
fi
set_variable_if_missing GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST "$STEP3_VERIFIED_SHADOW_WORKER_HOST"
# YES is an assertion: only set after validating private bucket existence and ACLs.
if [[ "${STEP3_PRIVATE_R2_PHYSICALLY_VERIFIED:-NO}" != YES ]]; then
 echo "Private recovery R2 bucket PUT/GET authorization must be physically verified." >&2
 exit 6
fi
set_variable_if_missing GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED YES
if [[ "${STEP3_REAL_SHADOW_B2_ACKNOWLEDGED_RECORD_VERIFIED:-NO}" != YES ]]; then
 echo "A genuinely B2-acknowledged shadow source is required before pointer seeding." >&2
 exit 7
fi
set_variable_if_missing GEOMACRO_STEP3_SHADOW_POINTER_SEED_APPROVED YES
echo "Bootstrap complete. No live Worker, D1, payment, or B2 object was modified."
