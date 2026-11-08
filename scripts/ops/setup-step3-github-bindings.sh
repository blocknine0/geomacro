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
environment_variable_names="$(gh variable list -R "$repo" -e "$environment" --json name --jq '.[].name')"
has_secret(){ grep -Fxq "$1" <<< "$secret_names" || grep -Fxq "$1" <<< "$repo_secret_names"; }
has_variable(){ grep -Fxq "$1" <<< "$variable_names" || grep -Fxq "$1" <<< "$environment_variable_names"; }
set_variable_if_missing(){
 local name="$1" value="$2"
 # A reviewed corrected value REPLACES an obsolete/stale repo variable.
 # If no new value is supplied, an existing value is preserved.
 if [[ -z "$value" ]]; then
  if has_variable "$name"; then
   echo "$name: existing value preserved (verify independently)"; return
  fi
  echo "$name: verified value required" >&2; return 1
 fi
 gh variable set "$name" -R "$repo" --body "$value"
 # An existing production-environment variable has precedence at runtime.
 # Synchronize it rather than leaving a stale override that silently wins.
 if grep -Fxq "$name" <<< "$environment_variable_names"; then
  gh variable set "$name" -R "$repo" -e "$environment" --body "$value"
 fi
 echo "$name: owner-supplied verified value pinned"
}
if ! has_secret GEOMACRO_D1_RECOVERY_AES256_KEY_B64; then
 # This key is generated once and persists across D1 cold recovery.
 # Never rerun after an encrypted backup expecting a different key.
 openssl rand -base64 32 |
  gh secret set GEOMACRO_D1_RECOVERY_AES256_KEY_B64 -R "$repo" -e "$environment"
 echo "GEOMACRO_D1_RECOVERY_AES256_KEY_B64: generated and stored (value not exposed)"
else echo "GEOMACRO_D1_RECOVERY_AES256_KEY_B64: already configured"; fi
# HMAC is 64 HEX characters in the existing runtime, NOT base64.
# Shadow HMAC is independent from the production pointer HMAC.
# Accept the exact local key material already deployed to the NEW shadow Worker.
# Command substitution strips trailing LF from openssl rand output; reject
# embedded CR/LF, and printf exactly 64 characters to GitHub.
if ! has_secret PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY; then
 shadow_key_file="${STEP3_SHADOW_HMAC_FILE:-$HOME/.config/geomacro/phase2h-shadow-hmac.hex}"
 if [[ ! -f "$shadow_key_file" || ! -r "$shadow_key_file" ]]; then
  echo "Existing Shadow HMAC key file is missing; do not generate or rotate." >&2
  exit 14
 fi
 shadow_key="$(cat "$shadow_key_file")"
 if [[ ! "$shadow_key" =~ ^[a-f0-9]{64}$ ]]; then
  echo "Shadow HMAC key must be 64 lowercase hexadecimal characters." >&2
  exit 15
 fi
 printf '%s' "$shadow_key" |
  gh secret set PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY -R "$repo" -e "$environment"
 unset shadow_key
 echo "PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY: existing local Shadow Worker key imported."
else echo "PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY: already configured; verify it matches shadow Worker." ; fi
# Never substitute the generated shadow key for a missing production key.
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
if [[ ! "${STEP3_VERIFIED_RECOVERY_R2_BUCKET:-}" =~ ^[a-z0-9][a-z0-9-]{2,62}$ ||
      ! "${STEP3_VERIFIED_SHADOW_R2_BUCKET:-}" =~ ^[a-z0-9][a-z0-9-]{2,62}$ ||
      "${STEP3_VERIFIED_RECOVERY_R2_BUCKET}" == "${STEP3_VERIFIED_SHADOW_R2_BUCKET}" ]]; then
 echo "Owner must supply two distinct, already-provisioned private R2 buckets." >&2
 exit 12
fi
if [[ ! "${STEP3_VERIFIED_PRODUCTION_D1_UUID:-}" =~ ^[a-fA-F0-9-]{36}$ ||
      ! "${STEP3_VERIFIED_SHADOW_D1_UUID:-}" =~ ^[a-fA-F0-9-]{36}$ ||
      "${STEP3_VERIFIED_PRODUCTION_D1_UUID,,}" == "${STEP3_VERIFIED_SHADOW_D1_UUID,,}" ]]; then
 echo "Owner must supply two distinct verified production/shadow D1 UUIDs." >&2
 exit 13
fi
set_variable_if_missing D1_DATABASE_ID "$STEP3_VERIFIED_PRODUCTION_D1_UUID"
set_variable_if_missing GEOMACRO_D1_SHADOW_DATABASE_ID "$STEP3_VERIFIED_SHADOW_D1_UUID"
set_variable_if_missing GEOMACRO_D1_RECOVERY_R2_BUCKET "${STEP3_VERIFIED_RECOVERY_R2_BUCKET:-}"
set_variable_if_missing GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET "${STEP3_VERIFIED_SHADOW_R2_BUCKET:-}"
if [[ ! "${STEP3_VERIFIED_SHADOW_WORKER_HOST:-}" =~ ^geomacro-step3-shadow\.[a-z0-9-]+\.workers\.dev$ ]]; then
 echo "Required owner input: STEP3_VERIFIED_SHADOW_WORKER_HOST (real workers.dev host)." >&2
 exit 5
fi
set_variable_if_missing GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST "$STEP3_VERIFIED_SHADOW_WORKER_HOST"
if [[ ! "${STEP3_VERIFIED_LEGACY_SHADOW_WORKER_HOST:-}" =~ ^geomacro-step3-shadow-legacy\.[a-z0-9-]+\.workers\.dev$ ]]; then
 echo "Required owner input: STEP3_VERIFIED_LEGACY_SHADOW_WORKER_HOST (real, shadow D1-bound)." >&2
 exit 8
fi
set_variable_if_missing GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST "$STEP3_VERIFIED_LEGACY_SHADOW_WORKER_HOST"
if ! has_secret B2_ARCHIVE_READ_KEY_ID || ! has_secret B2_ARCHIVE_READ_APPLICATION_KEY; then
 echo "Owner action: configure existing independent B2 archive read credentials in Actions secrets." >&2
 exit 9
fi
if [[ ! "${STEP3_REVIEWED_SHA:-}" =~ ^[a-f0-9]{40}$ ]]; then
 echo "Owner action: provide STEP3_REVIEWED_SHA, reviewed exact main commit." >&2
 exit 10
fi
set_variable_if_missing GEOMACRO_STEP3_REVIEWED_SHA "$STEP3_REVIEWED_SHA"
echo "GEOMACRO_STEP3_REVIEWED_SHA: pinned to current owner-reviewed source (not inferred)"
if ! has_secret GEOMACRO_STEP3_TRUSTED_SIGNER_PUBLIC_JWK; then
 if [[ -z "${STEP3_TRUSTED_SIGNER_PUBLIC_JWK:-}" ]]; then
  echo "Owner action: provide Ed25519/EC public JWK corresponding to existing SIGNING_JWK." >&2
  exit 11
 fi
 printf %s "$STEP3_TRUSTED_SIGNER_PUBLIC_JWK" |
  gh secret set GEOMACRO_STEP3_TRUSTED_SIGNER_PUBLIC_JWK -R "$repo" -e "$environment"
 echo "Trusted public signer configured."
fi
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
if [[ "${STEP3_SHADOW_REHEARSAL_OWNER_APPROVED:-NO}" == YES ]]; then
 set_variable_if_missing GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED YES
else
 echo "Shadow workflow remains disabled until STEP3_SHADOW_REHEARSAL_OWNER_APPROVED=YES" >&2
fi
if [[ "${STEP3_PRODUCTION_RECOVERY_OWNER_APPROVED:-NO}" == YES ]]; then
 set_variable_if_missing GEOMACRO_STEP3_RECOVERY_V2_APPROVED YES
else
 echo "Production Stage2 remains disabled until STEP3_PRODUCTION_RECOVERY_OWNER_APPROVED=YES" >&2
fi
echo "Bootstrap complete. No live Worker, D1, payment, or B2 object was modified."
