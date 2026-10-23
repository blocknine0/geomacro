# Repair only the approved Facts public PEM (one-time, no funds)

Verified production error on **2026-10-23**:
[Run 39928787295](https://github.com/blocknine0/geomacro/actions/runs/39928787295)
reported `facts_public_pin_diagnostic=PUBLIC_PEM_SHA256_PIN_MISMATCH`.
Owner, Suman reviewer, Rights and GRO all passed their *public identity*
checks. This is **NOT** proof that independent current GRI was signed or
that the three B2/D1 signed hot products are healthy.

The protected `GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256` existing approved
pin MUST remain unchanged. Do not generate a new Facts identity to match
a wrong public key, do not paste or upload its private key, and do not
change any Predge credential or shared D1 record.

## Safe diagnosis before attempting another secret update

An Ed25519 **DER/SPKI public key encoded as Base64** can start with `MCow...`.
That is **not** an approved SHA256 fingerprint. The SHA256 pin argument must be
exactly **64 lowercase hexadecimal characters** from the **previous independent
Facts approval record**. Do not compute a new fingerprint from an arbitrary
file and pretend it was previously approved. In particular, Pallab's
`owner-public.pem` is the human owner key, **not the Facts authority key**.
Never use that file as a replacement Facts public PEM.

On the owner-controlled laptop after confirming the actual approved Facts PEM
path and the originally approved fingerprint in private records:

```bash
cd ~/geomacro-delegation-main
git fetch origin main
git switch --detach origin/main
# Set the two existing Facts values privately, NOT the owner PEM or DER key.
# GEOMACRO_APPROVED_FACTS_PUBLIC_PEM_PATH=/home/daspa/geomacro-private/.../facts-public.pem
# GEOMACRO_APPROVED_FACTS_PUBLIC_SHA256=<previously approved 64 lowercase hex>
node scripts/ops/repair-approved-facts-public-pem.mjs --inspect-preapproved-public-pem-no-funds
```

The diagnostic prints only one of:
- `APPROVED_FACTS_PIN_MUST_BE_64_LOWERCASE_HEX_SHA256` (wrong input format);
- `PUBLIC_PEM_OR_APPROVED_FACTS_IDENTITY_MISMATCH` (wrong/malformed file or
  not the previously approved pinned identity);
- `EXISTING_APPROVED_FACTS_PUBLIC_IDENTITY_MATCHED_NO_CHANGE`.

**It does not upload any public/private key, modify any GitHub secret, change the
pin, sign a Facts or Rights statement, dispatch a workflow, or authorize funds.**
Only when the exact original approved key genuinely matches should the owner
run the separate interactive `--install-preapproved-public-pem-no-funds`
command below. Successful identity repair still cannot create a signed current
Intelligence/GRO/GRI product.

## Owner laptop: use the original approved existing Facts PUBLIC PEM

Find the already-approved Facts public PEM in
`~/geomacro-private/` and its independently recorded original
**DER/SPKI SHA256** lowercase hex digest. Use the **actual approved files**,
not invented example filenames. If their identity or the original
approved pin is uncertain, stop; do not rotate any signing key.

In Pallab's Ubuntu terminal (not in Suman's account):

```bash
cd ~/geomacro-delegation-main
git fetch origin main
git switch --detach origin/main
gh auth status
export GEOMACRO_APPROVED_FACTS_PUBLIC_PEM_PATH="/home/daspa/geomacro-private/REPLACE_WITH_EXISTING_APPROVED_FACTS_PUBLIC.pem"
export GEOMACRO_APPROVED_FACTS_PUBLIC_SHA256="REPLACE_WITH_EXISTING_OWNER_APPROVED_DER_SPKI_SHA256"
node scripts/ops/repair-approved-facts-public-pem.mjs --install-preapproved-public-pem-no-funds
```

The script refuses wrong/missing fingerprints, private key input, symlinks,
wrong PEM type, CI/background execution or any public key outside the
owner-private folder. It prompts the operator exactly once:

`INSTALL EXISTING FACTS PUBLIC KEY ONLY NO FUNDS`

It updates ONLY the encrypted GitHub production secret
`GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM`. The existing separate approved
`GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256` is NOT changed.
Two protected, read-only authority workflows are then requested.

Successful terminal upload and successful **protected authority workflows**
are both required. If protected checks still reject, the previously
approved PIN/public identity does not match the enrolled Facts signing
authority; resolve via actual custodian-approved key identity, never by
forging a reviewer signature or blindly changing hashes.

### After verified public-identity repair

Proceed with NEW source-native evidence and source rights, a genuine dual
Facts/Rights signed Intelligence batch, separately independently reviewed
current numerical GRI, validated country/category certificates, exact
immutable historic B2 lineage, quota-admitted B2 readback and D1 hot
promotion. Only a genuine signed GRI parent can update Risk Indices.
Then verify distinct public signed 3/3, deep-health 200, exact
Lovable-deployed GitHub SHA, and fresh quote availability. Existing
x402 pricing remains unchanged; mainnet stays disabled until a separate
explicit owner real-money purchase ACK.

**Predge joint testing remains untouched**, including its existing
credentials, shared D1 data, API contracts, session flow and partner
delivery. No Supabase writes or USDC transfers.
