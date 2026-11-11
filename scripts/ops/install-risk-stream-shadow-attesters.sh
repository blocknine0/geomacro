#!/usr/bin/env bash
# Install independently issued original-facts and rights ED25519 PUBLIC keys.
# Run in the owner's authenticated WSL terminal. Never upload private keys.
set -euo pipefail
: "${FACTS_SPKI_DER_PATH:?Path to independently issued facts PUBLIC SPKI DER required}"
: "${RIGHTS_SPKI_DER_PATH:?Path to independently issued rights PUBLIC SPKI DER required}"
: "${REAL_ATTESTED_CANDIDATES_JSONL:?Path to real signed original-source JSONL required before public-key installation}"
test -r "$REAL_ATTESTED_CANDIDATES_JSONL"
command -v gh >/dev/null || { echo 'gh is required and must be authenticated' >&2; exit 2; }
command -v node >/dev/null || exit 2
test -r "$FACTS_SPKI_DER_PATH"
test -r "$RIGHTS_SPKI_DER_PATH"
FACTS_B64="$(base64 -w0 < "$FACTS_SPKI_DER_PATH")"
RIGHTS_B64="$(base64 -w0 < "$RIGHTS_SPKI_DER_PATH")"
export RISK_STREAM_MACHINE_FACTS_SPKI_B64="$FACTS_B64"
export RISK_STREAM_MACHINE_RIGHTS_SPKI_B64="$RIGHTS_B64"
node --input-type=module -e '
import {validateAttesterKeys} from "./scripts/lib/risk-stream-shadow-attesters.mjs";
const {fingerprints}=validateAttesterKeys(process.env.RISK_STREAM_MACHINE_FACTS_SPKI_B64,
 process.env.RISK_STREAM_MACHINE_RIGHTS_SPKI_B64);
console.log(JSON.stringify({status:"KEY_FORMAT_AND_DISTINCTNESS_VALIDATED",
 public_spki_sha256:fingerprints,independent_issuers_must_be_verified_by_operator:true}));
'
# Distinct public keys alone never prove real independent attestation.
# The pre-existing operator path must fail before changing environment
# secrets if either external attester cannot verify actual source claims.
node scripts/lib/risk-stream-shadow-attesters.mjs verify "$REAL_ATTESTED_CANDIDATES_JSONL"
gh secret set RISK_STREAM_MACHINE_FACTS_SPKI_B64 -R blocknine0/geomacro -e production -b "$FACTS_B64"
gh secret set RISK_STREAM_MACHINE_RIGHTS_SPKI_B64 -R blocknine0/geomacro -e production -b "$RIGHTS_B64"
unset FACTS_B64 RIGHTS_B64 RISK_STREAM_MACHINE_FACTS_SPKI_B64 RISK_STREAM_MACHINE_RIGHTS_SPKI_B64
echo 'Public attester keys registered in protected GitHub production environment.'
echo 'Re-run risk-stream-shadow-provider-audit.yml: provision phase puts keys into isolated shadow Worker.'
echo 'For cryptographic evidence, verify real independently signed original candidates with:'
echo 'node scripts/lib/risk-stream-shadow-attesters.mjs verify /private/real-attested-candidates.jsonl'
