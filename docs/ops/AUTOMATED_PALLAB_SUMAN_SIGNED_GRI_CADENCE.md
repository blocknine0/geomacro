# Pallab + Suman automated human-signed current GRI v1.2 (No Funds)

## Existing public keys are READY; human signatures are NOT invented

Protected production public-key readiness last passed on **2026-10-22**
(workflow run 39845017521), verifying distinct Ed25519 public key pins
for Pallab owner, Suman independent reviewer and other GRI authorities.
This does not itself certify current independent review, signed evidence,
B2 lineage, source rights or Deep Health 200.

This runbook provides automatic processing **after both humans genuinely
sign a specific real current input**, without putting their private keys
into the cloud. Every new batch still requires fresh genuine human
signatures from its actual owners. No unattended private-key signer or
automatically generated human assent is ever created.

## What is now automated and guarded

1. Existing B2 reviewed-GRI **staging** accepts only a genuine current
   Pallab signed approval of the **exact Suman-signed GRI SHA256** and
   **exact Suman-signed country certificates SHA256**. It also verifies
   the existing Suman independent GRI and historical original proofs
   before any B2 writes. Every write requires account quota governor,
   immutable B2 byte readback and no funds.
2. Existing 15-minute
   `GRI v1.2 Genuine Signed Ready Cadence Backstop (No Funds)`
   retrieves repository public SHA hints plus the protected
   `GEOMACRO_OWNER_HUMAN_SIGNED_ENVELOPE_B64` production secret.
   It verifies Pallab's Ed25519 signature against his registered
   public PEM + SHA256 pin, distinct Suman/Facts/Rights authorities,
   exact immutable GRI and country certificates hashes and <=90min
   signature freshness. No real signed approval => it SKIPS GRI
   dispatch; machine Intelligence continuation remains independent.
3. The actual existing canonical
   `GRI v1.2 Supabase-Free Current Promotion` workflow
   RECHECKS Pallab's signature using **the exact pinned B2 input
   SHA256s BEFORE ANY B2 GET**. It then independently verifies
   Suman's own reviewer signatures, original source evidence,
   source-native clocks, issuer identities, rights, historical B2,
   canonical numerical GRI, immutable B2 readback, D1 and current
   public proof. Human approval alone cannot make any false data live.
4. Only after genuine signed parent success can existing Risk Indices
   continuation run. Deep Health is actual production verified
   independently. x402 real payment stays disabled and unapproved.

## One-time cloud configuration for already human-signed review input

The registered Pallab and Suman public PEMs + SHA256 fingerprints
are already stored as GitHub `production` environment secrets.
Keep them unchanged. After the real signed envelope exists,
the **single new protected secret** is:

`GEOMACRO_OWNER_HUMAN_SIGNED_ENVELOPE_B64`

Its value is simply base64 of the **exact Pallab signed
`owner-approval.json` bytes**. It is a human signature **already
created offline**, NOT a private key. The SHA-signed metadata points
to separately privately stored Suman GRI/certificate B2 files.

The existing repository variables used by the 15min backstop are:
`GRI_READY_REVIEWED_SHA256`,
`GRI_READY_CERTIFICATES_SHA256`,
`GRI_READY_APPROVED_AT`.
These are public immutable SHA hints, not approvals. The genuine
owner signature is always checked first and again by the publisher.
A manually forged/stale hint with no valid signature cannot dispatch
a GRI publication.

## Best path: one interactive local activation after successful handoff

1. Have Suman personally review and sign real GRI and each
   certificate using his encrypted key on his local account.
2. Have Pallab personally review, hash and sign those exact two
   canonical Suman-signed JSON files using his encrypted key.
3. Validate exact private original evidence, all signatures,
   source rights and immutable historical B2 gzip with:

   `node scripts/ops/verify-pallab-suman-independent-handoff.mjs --validate-offline-no-funds`

4. With the genuine protected B2/D1 staging credentials and quota governor,
   stage only this already approved reviewed batch:

   `bun scripts/ops/stage-approved-reviewed-gri-private-b2.mjs --stage-approved-review-no-funds`

   It now requires `GEOMACRO_OWNER_SIGNED_APPROVAL_PATH`,
   `GEOMACRO_OWNER_SIGNED_APPROVAL_SHA256` plus existing
   `GEOMACRO_REVIEWED_GRI_*` / `GEOMACRO_COUNTRY_CERTIFICATES_*`,
   approved owner/reviewer/Facts/Rights public pins and real historical
   B2 readback. It may dispatch the canonical publisher only after
   successful evidence / B2 checks; publisher still rechecks Pallab.

5. From the **same private, human-attended laptop**, with
   `gh auth status` showing access to blocknine0/geomacro, and all
   offline verifier env inputs already set, run:

   `node scripts/ops/activate-pallab-suman-signed-automation.mjs --activate-existing-human-signatures-no-funds`

   After successful strict private verification it asks the human
   operator to type `ENABLE HUMAN-SIGNED AUTOMATION`. It securely
   installs the protected base64 **already signed** approval in
   GitHub production environment with `gh secret set` and three
   immutable SHA/time hints with `gh variable set`.
   It never uploads source articles or private signing keys.
   The owner approval is recorded LAST, reducing risks from partial
   installations. No new mainnet ack, paid service, Supabase or card.

6. The existing 15min GitHub cron picks up the signed input. Manual
   `workflow_dispatch` may expedite the same fully signed
   15min gate but cannot bypass either signer. After production
   publisher and Risk Indices succeeds verify:
   `https://geomacro.live/api/health?deep=1` returns 200
   with three CURRENT independently validated hot products and
   a deployed source SHA equal to canonical main.

**Important:** `GRI_READY_APPROVED_AT` is short lived (28min) and
Pallab signature itself expires after 90min. Late source delivery or
expired input requires a new real review/signature, not an automated
renewal or altered clock. Repeat this handoff per actual approved
batch; unattended scheduler can never perform the human act.

Runbooks: `PALLAB_SUMAN_ONE_LAPTOP_SETUP.md` for encrypted owner/reviewer
key creation in distinct local accounts; and
`PALLAB_SUMAN_TWO_PERSON_SIGNED_GRI_HANDOFF.md` for immutable signed
file requirements and exact evidence/B2 history.
