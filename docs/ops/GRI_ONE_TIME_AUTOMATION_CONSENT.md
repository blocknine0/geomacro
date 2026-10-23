# One-time GRI policy delegation and hold-last-score behavior

This is a new, revocable scope. The existing derived-only consent is not
reused or widened. Pallab authorizes owner policy processing; Suman personally
authorizes automated policy review. A machine result is labelled automated
policy review, never a new human per-batch or external independent human review.

Target behavior: only a genuinely new qualified original after the prior GRI
anchor triggers canonical recalculation. Duplicate news, an empty source run,
failed verification or unavailable infrastructure keeps the previous verified
website score, source date and last-verified label. A qualified neutral event
can produce the same numeric score; no forced positive/negative movement.
Website disclosure retains its existing 60-minute publication delay. The
bounded D1 history keeps the latest eligible website anchor even after 30 days
or a burst of younger embargoed snapshots. This is historical readability,
not current paid-product availability or a new score.

## What is ready and what is not

The new CLI creates two dedicated machine identities and verifies/enrolls two
real human consents. Enrollment runs a protected consent-readiness workflow,
compares existing enrolled human pins and checks that machine identities do
not collide with Facts, Rights or the production issuer. It uploads no human
private key, pays nothing and does not activate/dispatch a GRI publisher.

**Publisher integration is pending the genuine new consent.** The currently
live independently human-reviewed publisher still requires its existing exact
human-reviewed input. Enrollment does not bypass that contract. After consent
readiness succeeds, integrate the explicitly named automated policy profile
with isolated machine roles, validate actual source/Facts/Rights packages,
certify only evidence-qualified country/category cells, and run canonical
scoring plus quota-governed immutable B2/D1 publication/readback. Existing
current source windows, source rights and independently verified historical
lineage remain prerequisites. No promise that arbitrary news qualifies.

## 1. Pallab: update the existing clean enrollment worktree

Ubuntu/WSL; do not reset or delete local changes. Stop if status is not empty.
The previously enrolled public keys and encrypted human key files are reused.

```bash
cd ~/geomacro
git fetch origin main
git -C ~/geomacro-delegation-main status --short
git -C ~/geomacro-delegation-main switch --detach origin/main
cd ~/geomacro-delegation-main
node --test scripts/tests/gri-automation-consent.test.mjs
node scripts/ops/setup-gri-automation-consent.mjs --prepare
```

Defaults read existing public keys:
`~/geomacro-private/pallab/owner-public.pem` and
`~/geomacro-private/pallab/delegation/suman-public.pem`.
New files go to **a new** `~/geomacro-private/pallab/gri-automation-v1`.
Do not rerun `--prepare` to overwrite existing keys; it intentionally refuses.
`GEOMACRO_GRI_CONSENT_DIR` can select a different new absolute private directory
if needed, but use the same directory for later owner operations.

Read the non-secret policy (machine public pins, permitted actions and checks):

```bash
cat ~/geomacro-private/pallab/gri-automation-v1/policy.json
node scripts/ops/setup-gri-automation-consent.mjs --sign-owner
```

Pallab types `AUTHORIZE RULE BASED GRI AUTOMATION`, then his own encrypted key
passphrase at the hidden prompt. It uses the pre-existing
`~/geomacro-private/pallab/owner-private-encrypted.pem`.
For an existing custom key location, set `GEOMACRO_GRI_CONSENT_HUMAN_KEY_PATH`
to that existing absolute encrypted-key file; do not create a new human identity.

## 2. Suman: one genuine consent on the same laptop

Pallab transfers **policy.json only**, no private machine/human key, into the
already existing Suman account. These commands assume its home is
`/home/suman-gri`, as in the existing one-laptop setup. If different, substitute
its actual home path. Do not create another Suman identity/account.

```bash
sudo install -d -m 700 -o suman-gri -g suman-gri \
  /home/suman-gri/geomacro-private/suman/gri-automation-v1
sudo install -m 600 -o suman-gri -g suman-gri \
  ~/geomacro-private/pallab/gri-automation-v1/policy.json \
  /home/suman-gri/geomacro-private/suman/gri-automation-v1/policy.json
sudo -iu suman-gri
```

In Suman's session, Suman is present, reads the policy and personally signs.
This separate checkout contains public source code, no account credentials:

```bash
git clone --depth 1 https://github.com/blocknine0/geomacro.git ~/geomacro-gri-consent
cd ~/geomacro-gri-consent
cat ~/geomacro-private/suman/gri-automation-v1/policy.json
node scripts/ops/setup-gri-automation-consent.mjs --sign-reviewer
exit
```

If that checkout already exists, use its clean updated `main`; do not clone over
an existing directory or erase work. The default encrypted reviewer key is
`~/geomacro-private/suman/reviewer-private-encrypted.pem` in Suman's account.
It must match the exact public identity from the already enrolled delegation.
Suman types `AUTHORIZE RULE BASED GRI AUTOMATION` and his own hidden passphrase.
A missing/different key, changed policy, or someone else's signature is rejected.
No per-story signature is requested by this new consent policy.

## 3. Pallab: transfer the signed consent and enroll

Suman authorizes transferring only his new signed consent JSON. Back in
Pallab's session (the `exit` above returns there):

```bash
sudo cp --no-clobber \
  /home/suman-gri/geomacro-private/suman/gri-automation-v1/suman-approval.json \
  "$HOME/geomacro-private/pallab/gri-automation-v1/suman-approval.json"
sudo chown "$(id -un):$(id -gn)" \
  "$HOME/geomacro-private/pallab/gri-automation-v1/suman-approval.json"
chmod 600 "$HOME/geomacro-private/pallab/gri-automation-v1/suman-approval.json"
cd ~/geomacro-delegation-main
git fetch origin main
git switch --detach origin/main
node scripts/ops/setup-gri-automation-consent.mjs --enroll
```

Type `ENROLL GRI AUTOMATION CONSENT NO FUNDS` after reviewing the scope.
This requires the existing `gh` account with repository secret access.
Dedicated machine secrets and signed policy are written through stdin into
`production`; existing human/Facts/Rights/issuer credentials are not overwritten.
The script requires a clean checkout of exact current main; if it refuses,
check status and fetch/switch again, preserving local changes.

The setup launches **GRI Automated Policy Consent Readiness (No Funds)**.
Share only its Actions run URL or the sanitized status, never keys or passphrases.
Expected consent result:
`GENUINE_POLICY_CONSENT_VERIFIED_PUBLISHER_INTEGRATION_PENDING`.
The local enroll receipt says `CONSENT_ENROLLED_AWAIT_PROTECTED_READINESS`.
Neither result means a current score or publisher has been activated.

To revoke this new scope independently:

```bash
gh variable set GEOMACRO_GRI_AUTO_REVOKED --repo blocknine0/geomacro --body YES
```

No added schedule, paid source, Supabase activation, source-rights grant or
real-money settlement is part of this setup.
