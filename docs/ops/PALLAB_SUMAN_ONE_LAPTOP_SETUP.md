# Pallab + Suman on ONE laptop: separate genuine signing identities

**Physical computer:** one Ubuntu/WSL laptop is sufficient.
**Review authority:** two distinct humans, not one person signing twice.
**Legacy GRI v1.2 independently reviewed contract:** unchanged; source
originals, rights, historical B2, numerical review and signed country cells
are still mandatory.

## A. Create Suman's separate local account

From Pallab's Ubuntu/WSL admin session (only once):

```bash
sudo adduser suman-gri
```

Do **not** grant Suman sudo, copy Pallab's SSH credentials, join Pallab's
GitHub account or save Suman's login password in Geomacro. Suman picks and
types his own account password. For Windows desktop, a separate standard
Windows account plus a separate WSL Ubuntu user or encrypted removable
key is preferable to two terminal tabs under the same owner login.

The laptop owner/Windows/WSL administrator can technically access and
instrument the guest's session. Therefore an OS account by itself does
NOT prove independent key custody. Suman must be present, inspect the
original evidence and numerical GRI input independently, keep his
private-key passphrase private and enter his own approval. Prefer an
encrypted external USB drive retained by Suman after signing, and
separately record his reviewer engagement/consent. Do not let Pallab
type Suman's signing passphrase or approve an unattended auto-signer.

## B. Each person creates THEIR OWN encrypted key in their own session

**Pallab's normal account** (Pallab types and remembers his password):

```bash
umask 077
mkdir -p "$HOME/geomacro-private/pallab"
chmod 700 "$HOME/geomacro-private" "$HOME/geomacro-private/pallab"
openssl genpkey -algorithm ED25519 -aes-256-cbc \
  -out "$HOME/geomacro-private/pallab/owner-private-encrypted.pem"
chmod 600 "$HOME/geomacro-private/pallab/owner-private-encrypted.pem"
openssl pkey \
  -in "$HOME/geomacro-private/pallab/owner-private-encrypted.pem" \
  -pubout -out "$HOME/geomacro-private/pallab/owner-public.pem"
openssl pkey -pubin \
  -in "$HOME/geomacro-private/pallab/owner-public.pem" \
  -outform DER | sha256sum
```

**Suman's own session**, with Suman physically present:

```bash
sudo -iu suman-gri
umask 077
mkdir -p "$HOME/geomacro-private/suman"
chmod 700 "$HOME/geomacro-private" "$HOME/geomacro-private/suman"
openssl genpkey -algorithm ED25519 -aes-256-cbc \
  -out "$HOME/geomacro-private/suman/reviewer-private-encrypted.pem"
chmod 600 "$HOME/geomacro-private/suman/reviewer-private-encrypted.pem"
openssl pkey \
  -in "$HOME/geomacro-private/suman/reviewer-private-encrypted.pem" \
  -pubout -out "$HOME/geomacro-private/suman/reviewer-public.pem"
openssl pkey -pubin \
  -in "$HOME/geomacro-private/suman/reviewer-public.pem" \
  -outform DER | sha256sum
exit
```

The account switch itself does not authenticate Suman's real-world
identity. He MUST personally review and enter his encrypted key
passphrase when the genuine GRI/certificates are ready.

NEVER commit either private key. Both local human signing commands
REQUIRE `-----BEGIN ENCRYPTED PRIVATE KEY-----` and silently prompt
for the individual password. The password is not exported via shell
environment variables, GitHub Actions, B2 or Lovable.

## C. Enroll only FOUR public-key credentials

On GitHub open
`https://github.com/blocknine0/geomacro/settings/environments`
→ `production` → Environment secrets → Add secret:

| Secret | Real value |
|---|---|
| `GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM` | Pallab's entire `owner-public.pem` contents |
| `GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256` | Lowercase `sha256sum` of owner DER-SPKI output (64 characters) |
| `GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM` | Suman's entire `reviewer-public.pem` contents |
| `GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256` | Lowercase `sha256sum` of Suman DER-SPKI (64 characters) |

Do not enter the private-key file, passphrase or PEM private bytes in
GitHub, Lovable, ChatGPT or email.

After PR #2690 is successfully merged, manually run
`https://github.com/blocknine0/geomacro/actions/workflows/pallab-suman-independent-gri-authorities.yml`
on `main`. It verifies key shape/pins and separation from the machine
Facts, Rights and GRO signing identities. A successful key readiness
does NOT certify either review, license or current signed GRI.

## C1. Fix protected public pin failures (no secret disclosures)

The protected GitHub Actions authority readiness is **strict**: every secret
must be configured in the correct repository's `production` environment
(`https://github.com/blocknine0/geomacro/settings/environments`).
Repository-level secrets are also visible to the workflow unless overridden
by an environment-scoped secret with the same name. **Repository variables**
are NOT a replacement for `secrets.*`.

The public verifier now emits one safe finite diagnostic code **for each
public key independently**, without logging either PEM or fingerprint:

| Code | Repair |
| --- | --- |
| `PUBLIC_PEM_SECRET_MISSING` | Add the exact named `*_PUBLIC_KEY_PEM` environment secret |
| `PUBLIC_PIN_SECRET_MISSING` | Add the exact `*_PUBLIC_KEY_SHA256` secret |
| `PUBLIC_PIN_NOT_LOWERCASE_64_HEX` | Paste only 64 lowercase hex characters, not `SHA256(...)=`, the filename or extra spaces |
| `PUBLIC_PEM_HAS_LITERAL_BACKSLASH_N` | Replace literal `\\n` with actual line breaks when entering PEM |
| `PUBLIC_PEM_HEADER_OR_NEWLINE_INVALID` | Paste the full multi-line `-----BEGIN PUBLIC KEY-----` to `-----END PUBLIC KEY-----` including markers |
| `PUBLIC_PEM_PARSE_INVALID` / `PUBLIC_KEY_NOT_ED25519` | Derive **public** Ed25519 SPKI PEM from the person's own key; don't upload any private key |
| `PUBLIC_KEY_SPKI_SHA256_MISMATCH` | Derive hash from **public DER-SPKI bytes**, not the PEM text, private key or JSON |

From the correct person's account, recompute the fingerprint without ever
sharing the private key or its passphrase:

```bash
openssl pkey -pubin -in "$HOME/geomacro-private/pallab/owner-public.pem" \
  -outform DER | sha256sum
```

Suman uses his own `suman/reviewer-public.pem` file/path from his account.
Paste **only** the 64-character lowercase digest portion into the matching
GitHub environment secret. On account/secret changes, rerun the existing
[authority readiness workflow](../../.github/workflows/pallab-suman-independent-gri-authorities.yml)
manually, or rely on the already configured scheduled read-only check.
GitHub never emits a secret-change event. Do not email passwords, private keys
or ask anyone to print secret values in public Actions logs.

A green public-key result proves only correct PUBLIC key formatting,
pinning and separation. It does not prove the named human personally
reviewed an event or provide signed evidence. Existing independently signed
GRI stays gated on signed payloads, two real originals, original bytes,
verified rights and historical B2 lineage.

## D. Actual review and file transfer on the SAME computer

Only after genuine evidence exists:

1. Suman signs into `suman-gri` on the laptop, inspects current
   evidence/rights/three-domain scoring and the exact unsigned private
   reviewed-GRI and certificates. Suman sets
   `GEOMACRO_SUMAN_PRIVATE_KEY_PATH` to the encrypted key path in his
   account, `GEOMACRO_SUMAN_UNSIGNED_GRI_PATH` and
   `GEOMACRO_SUMAN_UNSIGNED_CERTIFICATES_PATH` to the real reviewed
   JSON files, the two output absolute file paths in his 0700 private
   folder, plus the pinned Suman public PEM/hash from his public key.
2. Suman personally runs
   `node scripts/ops/sign-suman-independent-reviewed-gri.mjs --human-sign-reviewed-gri`.
   After reviewing exact displayed SHA256 inputs, he types
   `SIGN SUMAN EXACT REVIEW` and **his own hidden private-key password**.
   Any absent/corrupt/generic GRI original or wrong password fails closed.
3. Suman explicitly authorizes a private transfer of only the two
   signed package JSON files (never his private key/password) into
   Pallab's separate private approval location, ideally over encrypted
   removable media. No source evidence appears in public GitHub files.
4. Pallab's own account independently reads the two completed signed
   packages, computes exact `sha256sum signed-reviewed-gri.json` and
   `sha256sum signed-country-certificates.json`, sets those digests as
   `GEOMACRO_OWNER_CANDIDATE_GRI_SHA256` and
   `GEOMACRO_OWNER_EVIDENCE_MANIFEST_SHA256`, plus his encrypted
   `GEOMACRO_OWNER_LOCAL_ED25519_PRIVATE_KEY_PATH`, output location
   and pinned public PEM/hash. Pallab explicitly runs
   `node scripts/ops/sign-pallab-owner-gri-candidate.mjs --human-sign-exact-batch`,
   types `APPROVE EXACT OWNER REVIEW` and **his own hidden password**.
5. Run the separate zero-network
   `node scripts/ops/verify-pallab-suman-independent-handoff.mjs --validate-offline-no-funds`
   with the three signatures files, actual 3-domain intelligence bundle,
   B2 original gzip history and exact private file SHA256 env paths
   documented in
   `docs/ops/PALLAB_SUMAN_TWO_PERSON_SIGNED_GRI_HANDOFF.md`.
   The complete validator must pass before protected B2 staging.
6. No production B2/D1, x402 or 503 success is claimed until the
   actual protected publisher verifies immutable readback and returns
   all three current signed products with deep health HTTP 200.

**No Suman present, no real reviewed artifacts, or no personal consent:**
No genuine Suman signature, and the independent GRI gate stays closed.
A separate laptop is NOT necessary; two **actual humans** are.
