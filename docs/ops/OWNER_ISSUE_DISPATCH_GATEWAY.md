# GeoMacro owner-only GitHub Issue → Actions Dispatch Gateway

The ChatGPT GitHub connector can create repository issues and read Actions but
does not expose new workflow_dispatch calls. This default-branch gateway bridges
that gap with an ephemeral GitHub Actions token. No personal PAT, external
server, Cloudflare credential or new paid integration is required.

## Permanent security contract

- Trigger: GitHub issues.opened only, with exact issue title
  **GeoMacro Owner Dispatch Request**. Comments, edits, PRs, schedules and
  push events cannot authorize a dispatch.
- GitHub event actor, issue author and sender must all be repository owner
  **blocknine0**; author_association must be OWNER.
- Entire issue body must be a STRICT JSON object with five fixed keys. No
  arbitrary workflow IDs, URLs, shell commands or new scopes are accepted.
- Requested 40-character SHA must exactly match the authenticated current
  main, the runner SHA and original issue snapshot. Moved main = HOLD.
- The issue is fetched and revalidated LIVE, then consumed/closed BEFORE a
  single fixed workflow dispatch. Re-running an issue event is therefore
  blocked by the closed state. Globally serialized issue jobs enforce ordering.
- A 204 dispatch response means GitHub queued the request; it is NOT
  production acceptance. Unknown provider response = closed issue/HOLD, with
  no automatic retry. An owner must review and create a NEW issue explicitly.
- This gateway has only ephemeral GitHub contents:read, issues:write and
  actions:write permissions. No Cloudflare, D1, B2, R2, secrets, payment
  activation or Worker traffic capability.
- The existing production rollout orchestration retains ALL independent
  Shadow, encrypted R2 checkpoint, B2 physical readback, signer/HMAC,
  backup, monthly Cloudflare Paid quota and rollback gates.
- Both gateway workflows are pinned by the permanent GitHub workflow inventory.

## Issue request formats

Issue title is ALWAYS **GeoMacro Owner Dispatch Request**.
Issue body must be raw JSON, not wrapped in a Markdown code fence.
Replace the SHA with freshly confirmed immutable main before creating issue.

### A: Zero-provider end-to-end handshake

~~~json
{
  "schema": "geomacro.owner-issue-dispatch.v1",
  "intent": "gateway-handshake",
  "source_sha": "<40-char-current-main-sha>",
  "authorization": "OWNER_AUTHORIZE_NO_FUNDS_GATEWAY_HANDSHAKE",
  "verify_hot50": false
}
~~~

Queues owner-dispatch-handshake.yml only, no production SQL/Worker traffic.
Handshake success is NOT any certification of production readiness.

### B: Physical Shadow only

~~~json
{
  "schema": "geomacro.owner-issue-dispatch.v1",
  "intent": "shadow-rehearsal",
  "source_sha": "<40-char-current-main-sha>",
  "authorization": "OWNER_AUTHORIZE_SHADOW_ONLY_NO_PRODUCTION_SQL",
  "verify_hot50": false
}
~~~

Queues production-rollout-orchestrator.yml with its fixed existing approval
input, execute_stage2=false and verify_hot50=false.

### C: Real protected production Stage2

~~~json
{
  "schema": "geomacro.owner-issue-dispatch.v1",
  "intent": "stage2-production",
  "source_sha": "<40-char-current-main-sha>",
  "authorization": "OWNER_AUTHORIZE_REAL_PRODUCTION_D1_0204_0211_0212_0213_NO_FUNDS",
  "verify_hot50": true
}
~~~

Queues the SAME existing orchestrator with execute_stage2=true and
verify_hot50=true. It can run REAL production migrations only after the new
same-run physical Shadow and all provider/cryptographic/cost safety gates PASS.
This authorization is no-funds only. It does NOT remove Canary HOLD or
promote Worker traffic.

## Use directly from ChatGPT

Ask: "Request the GeoMacro owner-issue gateway handshake / Shadow /
protected Stage2 at current main". ChatGPT uses the already connected GitHub
create_issue action with the strict title and body. Once GitHub Actions
processes the issues.opened event, it closes the single-use issue and comments
with dispatch status. ChatGPT then checks the distinct workflow run and signed
physical receipts. No manual gh workflow run command should be needed.

If GitHub organization restrictions disable issue-triggered workflows or
actions:write, the gateway remains fail-closed. Owner must configure the
corresponding repository GitHub Actions policy; no token or secret should be
copied into chat.

## Permanent reviewed-SHA drift prevention for owner-authorized Stage2

The 10 Nov run #42852599905 proved that a correctly owner-authenticated
gateway dispatch can still HOLD when the production environment
GEOMACRO_STEP3_REVIEWED_SHA is pinned to the previous main SHA.

The Stage2 gateway now supplies its immutable issue number and the
authentic GITHUB_RUN_ID of the gateway workflow. The protected
production-rollout-orchestrator independently performs GitHub read-only
proof before any provider D1, B2, R2 or Worker calls:

- original closed issue was CREATED by blocknine0 with OWNER association,
  with exact schema, explicit real-Stage2 authorization and exact main SHA
- issue was closed by github-actions[bot] and has a bot-authored authenticated
  successful one-time HTTP 204 dispatch receipt identifying that gateway run
- gateway run has correct GitHub Actions path, issue event, owner actor,
  exact HEAD, completed/success result and successful owner-issue-dispatch job
- target run has matching exact HEAD, correct workflow path and
  github-actions[bot] actor, and a distinct issue-number run-name
- exhaustive recent workflow-run list covers the new issue creation clock,
  includes the active target, and contains NO other run with the same issue
  number (no replay)
- a fresh remote main GET matches both the issue and target SHA

Only after that independent admission does the runner set its
GEOMACRO_STEP3_EXACT_SHA environment for THAT SINGLE JOB to the approved
owner-issued SHA. Both protected Shadow and production Stage2 jobs repeat
the admission. This is a separately reviewed SHA authority, NOT an
unreviewed bypass: if any API or proof is missing, the run FAILS CLOSED.

Manual workflow_dispatch (no owner-issue reference) STILL requires
GEOMACRO_STEP3_REVIEWED_SHA from the protected environment. The existing
environment approval, physical Shadow proof, billing-cycle headroom,
encrypted recovery checkpoint, migrations, B2 parity, dual-worker acceptance,
Hot50, no-funds and Canary HOLD gates are fully preserved.

This does not mutate GitHub production variables and removes the need to
re-pin those variables for each NEW explicitly owner-authorized gateway
request. The gateway does not have GitHub environment variable admin access.

## Protected Canary release intents — exact owner-approved v2 requests

These are three NEW, independently owner-authorized issue requests. They are
**not** executed by Stage2 automatically, and all existing Cloudflare/Worker
provider gates, Hold and no-funds protections remain mandatory.

An owner issue always has the exact title `GeoMacro Owner Dispatch Request`
and a raw JSON body. Confirm the current main SHA for **each** issue; the
gateway refuses moved main and consumes each issue only once. Use real,
provider-derived immutable Worker version UUIDs and signed exact-main Step3/
prior promotion run IDs. No guessing or placeholder IDs.

### B2-limit private R2 minimum Risk Gate facts backup (no funds)

After this repository feature merges and exact-head CI + CodeQL pass,
create a trusted owner-authored issue titled GeoMacro Owner Dispatch Request.
The issue body must have EXACTLY this v2 JSON shape, substituting only
the actual current main SHA:

~~~json
{
  "schema": "geomacro.owner-issue-dispatch.v2",
  "intent": "minimum-risk-facts-backup",
  "source_sha": "<exact-current-main-sha>",
  "authorization": "OWNER_AUTHORIZE_BROTLI11_RISK_MINIMUM_PRIVATE_R2_NO_B2_NO_FUNDS",
  "verify_hot50": false
}
~~~

Gateway only dispatches phase2h-private-r2-b2-quota-backup.yml with the
fixed approval BACKUP_PHASE2H_PRIVATE_R2_NO_B2_OR_FUNDS. The protected
runner independently revalidates main SHA, private bucket/domain
exposure, canonical admin-only source export and AES-256-GCM Brotli
quality-11 derived-facts full-body readback before reporting any PASS.
No full original/news payload is written to long-term private R2.
The gateway itself does NO B2/R2 call, D1 SQL, payment or Canary action.

Provider receipt or HOLD (never assumed success) is in the protected
Actions run. The backup is not an archived B2 original ACK, Standard
corroboration, Complex signed GRO or permission to remove Canary HOLD.

### Zero-traffic candidate upload (after real Stage2 PASS)

~~~json
{
  "schema": "geomacro.owner-issue-dispatch.v2",
  "intent": "candidate-upload",
  "source_sha": "<exact-current-main-sha>",
  "authorization": "OWNER_AUTHORIZE_ZERO_TRAFFIC_EXACT_MAIN_WORKER_CANDIDATE_NO_FUNDS",
  "verify_hot50": false
}
~~~

Only queues `geomacro-optimized-worker-candidate.yml`, which requires the
existing explicit `UPLOAD_EXACT_MAIN_ZERO_TRAFFIC_NO_FUNDS` approval input.
It uploads a version without modifying traffic. Read the actual authenticated
candidate and baseline UUIDs from the signed protected candidate artifact
before preparing the next issue. Never treat a successful upload as a deploy.

### Protected 0→1→5→25→50→100% Worker promotion

~~~json
{
  "schema": "geomacro.owner-issue-dispatch.v2",
  "intent": "canary-rollout",
  "source_sha": "<exact-current-main-sha>",
  "authorization": "OWNER_AUTHORIZE_PROTECTED_HOT50_0_TO_100_NO_FUNDS",
  "verify_hot50": true,
  "baseline_version_id": "<actual-provider-baseline-uuid>",
  "candidate_version_id": "<actual-immutable-candidate-uuid>",
  "stage2_run_id": "<signed-exact-main-physical-Stage2-Actions-run-id>"
}
~~~

Queues only `geomacro-protected-hot50-worker-rollout.yml` with the exact
`PROMOTE_HOT50_NO_FUNDS` confirmation. Its protected runner independently
checks provider bindings, immutable versions, genuine physical Stage2,
B2/R2/evidence, full Hot50, stage SLOs, rollback and budgets. It must stop
and report HOLD if any proof is absent. Owner approval never disables holds.

### Read-only post-promotion Canary HOLD review

~~~json
{
  "schema": "geomacro.owner-issue-dispatch.v2",
  "intent": "canary-hold-review",
  "source_sha": "<exact-current-main-sha>",
  "authorization": "OWNER_AUTHORIZE_READ_ONLY_CANARY_HOLD_REVIEW_NO_FUNDS",
  "verify_hot50": true,
  "baseline_version_id": "<actual-provider-baseline-uuid>",
  "candidate_version_id": "<actual-immutable-candidate-uuid>",
  "stage2_run_id": "<successful-physical-Stage2-Actions-run-id>",
  "promotion_run_id": "<successful-completed-0-to-100-Actions-run-id>"
}
~~~

Queues only `canary-promotion.yml` with `operation=release-hold` and
`confirmation=REVIEW_HOT50_HOLD_NO_FUNDS`. **The operation is intentionally
read-only**, checks earlier six signed stages and a complete closed UTC day of
account-wide D1 provider evidence. It does NOT replay promotion and does NOT
delete `config/d1-hotspot-v2-canary.hold`. Only a **separate reviewed
acceptance PR**, after genuine provider-backed PASS, may remove the HOLD.
Unknowns remain UNKNOWN/HOLD. No payment authorization in any case.

### Additional constraints

- All v2 issue JSON keys are strictly enumerated per operation. Arbitrary
  workflow paths, schema versions, injected confirmations, mutable ref names,
  dynamic shell or payment operations are rejected before API calls.
- Baseline/candidate must be *distinct* UUIDs; run IDs must be explicit,
  positive decimal GitHub Actions run IDs. Actual provider origin, signatures
  and state are checked AGAIN by the protected target, not inferred by gateway.
- The older v1 handshake, Shadow and Stage2 permissions remain unchanged;
  a v2 intent cannot borrow a v1 authorization string or parameter set.
- Gateway log HTTP 204 certifies only GitHub dispatch; never a provider PASS,
  candidate upload PASS, Hot50 coverage, Canary 100% or HOLD clearance.

## What gateway success does NOT mean

The handshake / HTTP 204 alone is NOT Step3 production D1 0204–0213 PASS,
Hot50 150 cells verified, full B2 inventory parity, live 0→100% Canary SLO,
closed UTC-day account-wide quota acceptance, signed GRO/GRI certification,
or permission to remove the authoritative Canary HOLD.
