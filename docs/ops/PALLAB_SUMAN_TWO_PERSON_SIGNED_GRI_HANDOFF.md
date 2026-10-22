# Pallab Das + Suman Dey: exact two-person GRI v1.2 approval

## Status and role boundaries

This is an **upload-ready workflow**, not a claim that the two people have
already approved, provided keys, signed a batch, or activated paid production.

1. **Pallab Das, Geomacro owner:** ONE explicit human Ed25519 approval
   covering the exact SHA256 of Suman's reviewed-GRI signed JSON **and** the
   exact SHA256 of Suman's signed country/category certificates JSON. This is
   owner approval, never a substitute for independent factual/numeric review.
2. **Suman Dey, independent GRI reviewer:** a separate Ed25519 public/private
   key identity; reviews genuine numerical GRI v1.2, counterevidence, source
   originality and derived-use rights. Signs the exact reviewed-GRI
   `signed_input` AND every individually certified country/category
   `signed_input` under the **existing** two-field envelope schema.
   One reviewer identity signs several required objects; not a second human.
3. **Existing production signer, independent Facts and Rights custodians:**
   unchanged. Suman must not reuse those keys or Pallab's key.
4. The identity-to-person assertion is validated out of band by the owner;
   a PEM key alone cannot prove whether its holder is named Suman Dey.

The **existing** external independent GRI gate is unchanged: 3 domains,
2 real independent original publisher evidences per qualified event, source
native clocks, per-original rights review, genuine Facts/Rights approvals,
separately Suman-signed current country/category certificates, independent
Suman-reviewed numerical score, 90min current GRI review, and exact validated
historical B2 gzip proof. No metadata, invented 195-country routing, mock
signature or editorial approval turns current signed GRI to 200. A retained
portfolio remains subject to its existing signed 72h exception and one
genuine new native-dated original event.

## Public key enrollment, one time only

The two people MUST independently approve their own Ed25519 public key
identity. **Never upload or share either private key** (including with
ChatGPT, a GitHub repo, Lovable or B2).

In GitHub, under Settings > Environments > production > Environment secrets,
enroll the **public keys** and their approved lowercase SHA256 hashes of
DER-SPKI public-key bytes:

- `GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM`
- `GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256`
- `GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM` (Suman Dey)
- `GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256` (Suman Dey)

The pre-existing `GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256`,
`GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256` and
`RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64` remain unchanged.

The owner must confirm Suman's real identity, informed independent-review
responsibility, key custody and separation from Geomacro's own owner/issuer
in the private onboarding agreement. Never enroll any test key or
self-generated key in Suman's name.

Run
[**Pallab and Suman Independent GRI Authority Readiness**](../../.github/workflows/pallab-suman-independent-gri-authorities.yml)
on `main`. Before public keys are supplied this correctly returns red
`*_PUBLIC_PIN_MISSING_OR_INVALID`, not green. A green configuration check
only proves distinct key shapes, NOT signed current reviews or human identity.

## Upload-ready private signed package, required input order

**Suman first:**

1. Prepare existing bona fide reviewed numerical GRI `signed_input` object,
   plus an array of actual independently certified per-country/category
   certificate `signed_input` objects. The sources and history must be
   genuine and native-date qualified. Nothing is generated just because the
   signing tool exists.
2. On Suman's separate *private*, interactive workstation run:
   `node scripts/ops/sign-suman-independent-reviewed-gri.mjs --human-sign-reviewed-gri`.
   Set:
   - `GEOMACRO_SUMAN_PRIVATE_KEY_PATH`, an absolute 0600 local private file
   - `GEOMACRO_SUMAN_UNSIGNED_GRI_PATH` (human-reviewed exact JSON)
   - `GEOMACRO_SUMAN_UNSIGNED_CERTIFICATES_PATH` (human-reviewed JSON array)
   - `GEOMACRO_SUMAN_SIGNED_GRI_OUTPUT_PATH` and
     `GEOMACRO_SUMAN_SIGNED_CERTIFICATES_OUTPUT_PATH`, both absolute, new
     files outside the Git repository in a private 0700 folder
   - `GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM` and
     `GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256`.
   The tool requires Suman to type `SIGN SUMAN EXACT REVIEW`, verifies
   the cryptographic identity against approved public pin and writes exact
   two-field review envelope + certificate envelope array in 0600 files.
   Every involved country-category cell has its **own cryptographic
   signature**, but only one independent reviewer is necessary.
3. Separately confirm genuine original evidence and rights, exact factual
   event packages, three-domain canonical score and historic B2 gzip
   SHA256. The signing CLI is NOT a substitute for these canonical checks.

**Pallab second:**

4. Compute SHA256 of the **exact signed JSON bytes**, including newline, of
   Suman's reviewed-GRI output and signed certificate array output. Do not
   sign the unsigned input or hash a reserialized/reformatted file.
5. On Pallab's *separate*, interactive private machine run:
   `node scripts/ops/sign-pallab-owner-gri-candidate.mjs --human-sign-exact-batch`
   with:
   - `GEOMACRO_OWNER_LOCAL_ED25519_PRIVATE_KEY_PATH`
   - `GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM`,
     `GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256`
   - `GEOMACRO_OWNER_CANDIDATE_GRI_SHA256`: Suman's signed GRI **file** SHA
   - `GEOMACRO_OWNER_EVIDENCE_MANIFEST_SHA256`: Suman's signed certificate
     **file** SHA (the legacy label references the exact signed certificate
     manifest, not an unverified claim of legal rights)
   - `GEOMACRO_OWNER_APPROVAL_OUTPUT_JSON`: absolute new local private path.
   This requires Pallab explicitly typing `APPROVE EXACT OWNER REVIEW`.
   It creates **one signature** over both exact file hashes and binds them
   to a one-use 128-bit nonce and a 90-minute signing window. It does not
   auto-sign when new news arrives.

## Verifying after both signatures are uploaded

Prepare the following **private five artifacts** (Suman GRI and certificates
are ONE review package; Pallab envelope is the other person's approval):

| Private artifact | Offline verifier variable prefix |
| --- | --- |
| Pallab's `owner-approval.json` | `GEOMACRO_OWNER_SIGNED_APPROVAL` |
| Suman's `signed-reviewed-gri.json` | `GEOMACRO_REVIEWED_GRI` |
| Suman's `signed-country-certificates.json` | `GEOMACRO_COUNTRY_CERTIFICATES` |
| Genuine three-domain intelligence rows + event packages | `GEOMACRO_REVIEWED_INTELLIGENCE` |
| Exact previous immutable B2 history `.json.gz` | `GEOMACRO_HISTORICAL_B2_READBACK` |

For each prefix supply `_PATH` and exact `_SHA256` separately.
Supply both approved public PEM/pins and the existing GRO signing public
SPKI, Facts/Rights approved public SHA pins. On a private credential-free
machine run:

```bash
node scripts/ops/verify-pallab-suman-independent-handoff.mjs --validate-offline-no-funds
```

The verifier checks Pallab's **single signed approval** against exact file
bytes, distinct owner/Suman/Facts/Rights/GRO identities, Suman's reviewed
GRI and signed per-country certificates, actual original page qualification,
native timestamps, rights assertions, full historical B2 compressed bytes
and actual three-domain GRI schema using the existing canonical strict
review validator. Rejecting an absent/stale/different source remains red.

**After this exact zero-network gate passes** the authorized operator may run
the existing
`bun scripts/ops/verify-three-domain-reviewed-handoff.mjs --prepare-immutable-b2`,
then `bun scripts/ops/stage-approved-reviewed-gri-private-b2.mjs --stage-approved-review-no-funds`
using the protected quota governor. The current signed input will enter the
existing
[GRI v1.2 current promotion](../../.github/workflows/gri-v12-supabase-free-reviewed-current.yml),
which **independently rechecks** Suman's signature, source clocks, legal
source scope, numerical score, B2 hash and D1 public readback. The successful
GRI publisher triggers the existing Risk Indices publisher.

No real payment is approved by either human signing command; Geomacro's
commercial x402 launch remains separately controlled.

## How to hand over signed material securely

You may send **public PEMs and exact signed envelope files** for review;
do not send raw sources/rights documents in public PRs, public GitHub
artifacts or an unauthorised chat. Never send either private key. Full
signed GRI/cert evidence belongs in the existing restricted private B2
handoff or owner-managed encrypted transfer. Public GitHub dispatches
receive immutable SHA/key pointers only.

No signature package provided => `AWAITING_REAL_PALLAB_AND_SUMAN_SIGNED_INPUT`.
No historic B2 bytes/current qualified original => still NO signed publication,
no Deep Health 200 claim, no x402 real-money activation.
