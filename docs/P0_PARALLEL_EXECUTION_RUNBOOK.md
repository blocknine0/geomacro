# P0 Parallel Commercial Closure Operator Runbook

Status: **PRELAUNCH · NON-PRODUCTION · REAL FUNDS DISABLED**

This is an operator checklist for the remaining P0 commercial-closure work. It does not replace the authoritative contracts in:

- `.github/workflows/commercial-release-candidate-freeze.yml`
- `.github/workflows/million-agent-distributed-staging-execution.yml`
- `.github/workflows/distributed-40k-evidence-closure.yml`
- `.github/workflows/strict-commercial-launch-closure.yml`
- `docs/P0_STRICT_COMMERCIAL_LAUNCH_CLOSURE.md`

If this runbook and a workflow disagree, the workflow fails closed and is authoritative.

## Non-negotiable boundary

Throughout P0 closure:

- `launch_mode` remains `prelaunch`;
- `production_funds_authorized` remains `false`;
- `official_launch_announced` remains `false`;
- no mainnet payment acknowledgement is set;
- no production payment credential is used;
- no real-money settlement is performed;
- no load test is pointed at `geomacro.live`.

P0 closure proves readiness. It does not perform the commercial launch.

## Phase 1 — freeze one exact candidate

After all intended prelaunch code is merged, choose one current canonical `main` SHA and stop changing launch-critical code for the evidence window.

Dispatch **Commercial Release Candidate Freeze Evidence** with:

- `candidate_sha=<exact current main SHA>`
- `confirmation=FREEZE_GEOMACRO_COMMERCIAL_RC_TESTNET_ACCEPTANCE`

The freeze must preserve:

- Coinbase Base Sepolia paid acceptance as non-revenue test evidence;
- Nevermined sandbox verify/settle acceptance as non-revenue evidence;
- exact-head Product/hosting/security/source-rights evidence;
- full migration replay;
- production acknowledgements blank.

Do not continue to distributed capacity proof if the frozen candidate becomes stale.

## Phase 2 — deploy the same SHA to isolated staging

Deploy the frozen SHA to a non-production host that exposes the exact build marker at:

`/.well-known/geomacro-build.json`

Record an immutable `deployment_id`.

The staging target must not be `geomacro.live` or `www.geomacro.live`.

## Phase 3 — reserve the distributed staging capacity

The `staging-capacity` GitHub environment must contain:

### Variables

- `RISK_GATE_DISTRIBUTED_STAGING_BASE_URL`
- `RISK_GATE_DISTRIBUTED_EXPECTED_HOST`
- `RISK_GATE_DISTRIBUTED_MAX_RATE_PER_CLIENT`

### Secrets

- `RISK_GATE_DISTRIBUTED_API_KEYS_JSON`

The API-key pool must be large enough to preserve normal per-client rate controls at 40,000 aggregate requests/second.

The runner fleet must provide **40 simultaneously available** runners carrying all labels:

- `self-hosted`
- `linux`
- `x64`
- `geomacro-load-generator`

Do not acknowledge capacity until the application, edge/runtime, database, network path and generator fleet have actually been reserved.

## Phase 4 — run the real distributed 40k staging proof

Dispatch **Distributed 40k Staging Execution** from `main` with:

- `candidate_sha=<same frozen SHA>`
- `deployment_id=<same immutable staging deployment ID>`
- `capacity_ack=I_CONFIRMED_STAGING_CAPACITY_AND_QUOTAS`

The workflow itself enforces the exact profiles:

- burst: 1,000,000 requests at 40,000 RPS aggregate for 25 seconds;
- soak: 12,000,000 requests at 40,000 RPS aggregate for 300 seconds.

All 40 occupied generator slots must report readiness before each synchronized fire window.

Do not reinterpret a partial shard run, lower-rate run or different SHA as this proof.

## Phase 5 — close infrastructure telemetry evidence

After a successful capacity run, dispatch **Distributed 40k Evidence Closure** using the same:

- capacity workflow run ID;
- candidate SHA;
- immutable staging deployment ID.

Configure the authenticated staging telemetry collector required by the workflow/environment, including the expected telemetry host and token.

The evidence must bind full-window database, edge/runtime, auth/rate-limit, response-leakage, replay/idempotency and request-path provider evidence to the same candidate/deployment.

A raw load-test success without this closure is not the final P0 capacity proof.

## Phase 6 — publish the same exact candidate

Only after the staging evidence is complete, publish that same exact canonical SHA through the existing controlled Lovable publish path.

Do not modify the locked website presentation.

Verify the live build marker reports the exact candidate SHA before strict closure.

## Phase 7 — strict commercial launch closure

Dispatch **Strict Commercial Launch Closure** from the exact published `main` SHA with:

- `published_sha=<exact published candidate SHA>`;
- `distributed_evidence_run_id=<successful same-SHA evidence-closure run ID>`;
- bounded isolated-staging smoke parameters.

The workflow must pass all of:

- exact-candidate contract/build/security boundary;
- same-SHA distributed 40k evidence;
- bounded staging safety;
- exact published live surfaces/data reliability;
- outside-in non-destructive security smoke.

Only a successful final `closure` job is P0 strict closure.

## Phase 8 — stop before real-money activation

After strict closure passes, preserve the evidence and stop.

The next phase is a separate owner-authorized production launch preflight for Coinbase, Circle and Nevermined. GOAT mainnet remains a parallel external merchant-onboarding track.

No P0 workflow grants permission to set:

- `GEOMACRO_COMMERCIAL_LAUNCH_ACK`;
- `COINBASE_X402_MAINNET_ACK`;
- Circle production acknowledgement;
- Nevermined live environment;
- GOAT mainnet commercial enablement.

Those remain separate explicit owner decisions.
