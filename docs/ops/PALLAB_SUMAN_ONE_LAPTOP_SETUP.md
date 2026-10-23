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

## D0. Read-only preflight before Suman signs (no funds)

If the command `node scripts/ops/sign-suman-independent-reviewed-gri.mjs --human-sign-reviewed-gri` immediately prints `SUMAN_INDEPENDENT_REVIEW_SIGNING_REFUSED` without asking for confirmation, it **has not signed**. The owner shell `daspa@Pallab` is not Suman's independent interactive account. The script requires five configured absolute path environment variables (encrypted Suman key, genuine reviewed unsigned GRI, genuine unsigned country certificates, two new output files in a private directory) and Suman's **already approved** Ed25519 public PEM plus 64-character hex SHA pin. Do not forge absent source/rights review or sign a sample batch.

The owner may update the public repository without signing. Once Suman is physically present, he signs into his own account on the **same computer**, obtains a readable checkout of Geomacro without copying private signing keys to the owner account, and independently examines the inputs. Suman can then run from the readable repository root:

```bash
node scripts/ops/inspect-suman-signing-preflight.mjs --inspect-only-no-funds
```

If using his established local Node binary, replace `node` with `~/.local/bin/geomacro-node`. This prints **only** issue codes, whether the OS username matches the documented Suman account, and zero-write/no-signature flags. It never prints private file paths, PEM bytes, passphrases, source articles or file hashes, and never opens the private signing key. Example issues: `USE_SUMAN_OWN_PROTECTED_OS_SESSION`, `ABSOLUTE_PATH_UNSET_OR_INVALID_GRI`, `FILE_MISSING_OR_UNREADABLE_CERTS`, `REVIEWER_PUBLIC_PEM_OR_APPROVED_PIN_UNSET`. Fix only the real missing private setup with Suman's informed participation. `INPUT_SHAPES_PRESENT_REQUIRES_INDEPENDENT_HUMAN_REVIEW` is **not** an independent review, rights certificate, signed product or release acceptance. Suman's existing human signer, not this diagnostic, performs the later genuine signing.

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
