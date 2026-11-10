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

## What gateway success does NOT mean

The handshake / HTTP 204 alone is NOT Step3 production D1 0204–0213 PASS,
Hot50 150 cells verified, full B2 inventory parity, live 0→100% Canary SLO,
closed UTC-day account-wide quota acceptance, signed GRO/GRI certification,
or permission to remove the authoritative Canary HOLD.
