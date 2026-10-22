# Complete already-signed standing derived-only enrollment (no funds)

**Purpose:** Pallab and Suman have already signed the SAME standing policy
locally. Finish cloud enrollment WITHOUT repeating human approvals, uploading
any human private PEM, adding Supabase or turning on USDC.

Scope is still **GEOMACRO_DELEGATED_DERIVED_ONLY_NOT_GRI_V1**. This merely
attests to existing FREE derived-news issuer-signed inputs. It is NOT a new
GRI v1.2 reviewer, source-rights authorization, current signed hot snapshot,
or commercial launch. No permanent uptime/fresh-source guarantee is implied.

## A. Transfer only Suman's PUBLIC key and EXISTING signed receipt

On Pallab's Ubuntu account; Suman explicitly authorizes this receipt handoff
(the actual private Suman signing key is never copied):

~~~bash
D="$HOME/geomacro-private/pallab/delegation"
sudo install -m 600 -o "$(id -un)" -g "$(id -gn)" \
  /home/suman-gri/geomacro-private/suman/suman-approval.json \
  "$D/suman-approval.json"
sudo install -m 600 -o "$(id -un)" -g "$(id -gn)" \
  /home/suman-gri/geomacro-private/suman/reviewer-public.pem \
  "$D/suman-public.pem"
~~~

Require existing files in that folder named: standing-policy.json,
pallab-approval.json, suman-approval.json, owner-public.pem in parent
geomacro-private/pallab, suman-public.pem, machine-private.pem and
machine-public.pem. Keep the delegation directory 0700 and private files 0600.

## B. Use fresh canonical main without touching ARC development work

Use the ALREADY created owner dedicated worktree; do NOT switch/reset or stash
the active feat/arc-autonomous-agent-mainline branch with its modified
x402 API files:

~~~bash
cd "$HOME/geomacro"
git fetch origin main
test -z "$(git -C "$HOME/geomacro-delegation-main" status --porcelain)" || {
 echo "DELEGATION_WORKTREE_HAS_LOCAL_CHANGES"; exit 1;
}
git -C "$HOME/geomacro-delegation-main" switch --detach origin/main
cd "$HOME/geomacro-delegation-main"
node --test scripts/tests/standing-derived-cloud-enrollment.test.mjs
~~~

## C. ONE command to verify signatures and safely enroll existing scope

~~~bash
gh auth status
cd "$HOME/geomacro-delegation-main"
node scripts/ops/enroll-standing-derived-cloud.mjs \
  --enroll-two-signed-human-consents-no-funds
~~~

The command first checks both genuine signed authorizations, exact immutable
policy, matching machine public/private key, read-only GitHub main SHA and
clean worktree. If anything fails no cloud signing authority is enrolled.

After real local proof succeeds it asks for the *single* explicit operator
confirmation: ENROLL VERIFIED DERIVED ONLY NO FUNDS.

It then disables/revokes the optional workflow, uploads ONLY the signed human
consent envelope plus NEW dedicated MACHINE key as protected GitHub production
environment secrets through gh stdin, verifies secret **names**, enables
the derived-only GitHub variables, and dispatches the existing workflow.

NEVER give chat, workflow logs, a PR, or website either human private PEM,
passphrase, Suman signature contents or machine private-key bytes.
No payment credential or Coinbase/mainnet ACK is touched.

On a provision failure the helper attempts to restore enabled=NO and
revoked=YES (a failure to reach GitHub can prevent even rollback; inspect the
repository variables manually before treating it as disabled).

## D. Verify actual cloud production result

~~~bash
gh run list \
  --repo blocknine0/geomacro \
  --workflow standing-delegated-derived-attestation.yml \
  --limit 3
~~~

Identify the newest manual run ID, then:

~~~bash
gh run view RUN_ID --repo blocknine0/geomacro --json conclusion,status,url
~~~

Acceptance is **successful protected cloud-derived-only job**, not just
a green standalone governance contract job. If source readback is stale or
unsigned, it SHOULD fail and publish no invented proof.

## Emergency revoke without private key

~~~bash
gh variable set GEOMACRO_STANDING_DELEGATION_ENABLED \
  --repo blocknine0/geomacro --body NO
gh variable set GEOMACRO_STANDING_DELEGATION_REVOKED \
  --repo blocknine0/geomacro --body YES
~~~

Revocation stops FUTURE delegated receipts; previously signed receipts remain
historical and are NOT equivalent to continuing authority.

The separate restricted low-review and free news pipelines continue only
under their own credentials and schedules. This optional profile never
changes commercial-use rights, partner permissions, x402, paid scoring,
independent v1.2 GRI, Risk Indices or deep-health semantics.
