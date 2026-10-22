# Standing Delegation for cloud derived-only signing (NO FUNDS)

## Authority / scope

The new optional profile is GEOMACRO_DELEGATED_DERIVED_ONLY_NOT_GRI_V1.
Two real humans, Pallab Das (owner) and Suman Dey (governance consent), each
sign exactly ONE immutable governance policy with their own existing
passphrase-encrypted Ed25519 key in their separate local accounts.

The policy binds one NEW cloud machine signing public-key SHA-256 to
blocknine0/geomacro, to explicitly limited free derived-only data and
internal research receipt scope, with indefinite standing validity subject to
revocation. It is NOT an independent GRI v1.2 review on future inputs,
article licence, commercial Facts/Rights approval, scored country certificate,
Intelligence/GRI/Risk Indices signed hot product or authorization to charge USDC.

Both human private keys MUST remain OFF GitHub, B2, D1, Lovable and ChatGPT.
The new dedicated machine key may be stored as a protected GitHub production
environment secret, never as repository code or in a public artifact.
It must be distinct from Pallab, Suman, Facts, Rights and GRO signing keys.

## One-time operator activation after this PR is merged

Pallab: using an updated local repository checkout with Node and gh auth,
create a protected folder and the one new delegated-machine key:

~~~bash
cd ~/geomacro
git pull --ff-only
umask 077
D="$HOME/geomacro-private/pallab/delegation"
mkdir -p "$D"
chmod 700 "$D"
openssl genpkey -algorithm ED25519 -out "$D/machine-private.pem"
openssl pkey -in "$D/machine-private.pem" -pubout -out "$D/machine-public.pem"
export GEOMACRO_DELEGATED_MACHINE_PUBLIC_KEY_PATH="$D/machine-public.pem"
export GEOMACRO_DELEGATION_POLICY_PATH="$D/standing-policy.json"
node scripts/ops/sign-standing-derived-delegation.mjs --init-policy

export GEOMACRO_DELEGATION_PRIVATE_KEY_PATH="$HOME/geomacro-private/pallab/owner-private-encrypted.pem"
export GEOMACRO_DELEGATION_PUBLIC_KEY_PATH="$HOME/geomacro-private/pallab/owner-public.pem"
export GEOMACRO_DELEGATION_APPROVAL_OUTPUT_PATH="$D/pallab-approval.json"
node scripts/ops/sign-standing-derived-delegation.mjs --sign-owner
~~~

Privately place a COPY of the policy into Suman's private account; no private
Pallab key/password. Suman personally confirms and signs. Do not run his
signing process as Pallab or enter Suman's private passphrase on his behalf.

~~~bash
sudo install -m 600 -o suman-gri -g suman-gri "$D/standing-policy.json" /home/suman-gri/geomacro-private/suman/standing-policy.json
sudo -iu suman-gri
# Suman must have an updated, separately readable checkout (if absent,
# clone the public repository into his own ~/geomacro-review once).
cd "$HOME/geomacro-review"
export GEOMACRO_DELEGATION_POLICY_PATH="$HOME/geomacro-private/suman/standing-policy.json"
export GEOMACRO_DELEGATION_PRIVATE_KEY_PATH="$HOME/geomacro-private/suman/reviewer-private-encrypted.pem"
export GEOMACRO_DELEGATION_PUBLIC_KEY_PATH="$HOME/geomacro-private/suman/reviewer-public.pem"
export GEOMACRO_DELEGATION_APPROVAL_OUTPUT_PATH="$HOME/geomacro-private/suman/suman-approval.json"
node scripts/ops/sign-standing-derived-delegation.mjs --sign-reviewer
exit
~~~

After Suman authorizes transfer, Pallab copies only Suman's signed approval
and PUBLIC PEM to his own protected folder and assembles the consent envelope:

~~~bash
sudo install -m 600 -o "$(id -un)" -g "$(id -gn)" /home/suman-gri/geomacro-private/suman/suman-approval.json "$D/suman-approval.json"
sudo install -m 600 -o "$(id -un)" -g "$(id -gn)" /home/suman-gri/geomacro-private/suman/reviewer-public.pem "$D/suman-public.pem"
export GEOMACRO_DELEGATION_OWNER_APPROVAL_PATH="$D/pallab-approval.json"
export GEOMACRO_DELEGATION_REVIEWER_APPROVAL_PATH="$D/suman-approval.json"
export GEOMACRO_OWNER_PUBLIC_KEY_PATH="$HOME/geomacro-private/pallab/owner-public.pem"
export GEOMACRO_SUMAN_PUBLIC_KEY_PATH="$D/suman-public.pem"
export GEOMACRO_DELEGATION_ENVELOPE_OUTPUT_PATH="$D/standing-envelope.json"
node scripts/ops/sign-standing-derived-delegation.mjs --assemble
~~~

Then install machine-only secrets and the already-signed human governance
envelope as protected GitHub production environment secrets (NOT public
repository variables). Values travel over stdin and are not printed:

~~~bash
gh auth status
R=blocknine0/geomacro
openssl pkey -in "$D/machine-private.pem" -outform DER | base64 -w0 | gh secret set GEOMACRO_DELEGATED_MACHINE_PRIVATE_PKCS8_B64 --env production --repo "$R"
gh secret set GEOMACRO_DELEGATED_MACHINE_PUBLIC_KEY_PEM --env production --repo "$R" < "$D/machine-public.pem"
openssl pkey -pubin -in "$D/machine-public.pem" -outform DER | sha256sum | cut -d' ' -f1 | gh secret set GEOMACRO_DELEGATED_MACHINE_PUBLIC_KEY_SHA256 --env production --repo "$R"
base64 -w0 < "$D/standing-envelope.json" | gh secret set GEOMACRO_STANDING_DELEGATION_ENVELOPE_B64 --env production --repo "$R"
gh variable set GEOMACRO_STANDING_DELEGATION_REVOKED --repo "$R" --body NO
# Enable ONLY after ALL previous steps succeed:
gh variable set GEOMACRO_STANDING_DELEGATION_ENABLED --repo "$R" --body YES_DELEGATED_DERIVED_ONLY
~~~

No human key secret is uploaded. Preserve private keys with appropriate
custody and secure backups. The human governance approval is ONE TIME.
For any change to machine identity, scope or governance policy, new genuine
human signatures are needed.

## Automatic cloud operation, acceptance and revocation

After opt-in, Standing Delegated Derived Attestation (No Funds) runs after
successful main-branch Five-Minute Original News Fastlane runs, with an
hourly best-effort backup. It reads existing public D1 derived-news, verifies
EVERY existing issuer signature and original native time, then creates an
aggregate-only Ed25519 machine signature over true readback counts using
the dedicated cloud key. GitHub Actions artifacts contain no private source
URL, article bytes, upstream licence, human private key or secret.

The machine receipt explicitly has false for external human review, commercial
rights, scored GRI and payments. A green CI does not indicate a fresh
Intelligence/GRI/Risk Indices hot 3/3 or deep-health HTTP 200.
Existing independent GRI v1.2 and rights restrictions remain unchanged.

Immediately revoke by setting repository variable
GEOMACRO_STANDING_DELEGATION_REVOKED to YES, or
GEOMACRO_STANDING_DELEGATION_ENABLED to NO. Human approvals are never
automatically renewed or reproduced. Revocation of this new optional
workflow does not stop the separately authorized old free news workflows.
No card, new database, paid service, Supabase or real funds are required.

Production cloud credentials and actual source availability must still be
verified. GitHub scheduled workflows are best-effort, not a hard 24/7 SLA.
