# P0 Strict Commercial Launch Closure

This is the authoritative first-party P0 closure sequence for the current non-mainnet Geomacro commercial candidate. It does not authorize production payment settlement, real-money markets, mainnet execution, or customer-fund execution.

## Evidence order

A launch candidate is closed only in this order:

1. merge and freeze one exact canonical `main` SHA;
2. deploy that exact SHA to isolated staging;
3. execute the real distributed 40k staging load workflow;
4. close the load run with full DB/edge/control-plane/provider-path evidence;
5. publish the same exact SHA to `geomacro.live`;
6. run `Strict Commercial Launch Closure` against the exact published SHA and the exact distributed evidence-closure run.

No earlier run from a different SHA can be substituted.

## Real 40k staging execution

`Distributed 40k Staging Execution` is manual-only and requires 40 concurrently occupied self-hosted runners labeled:

- `self-hosted`
- `linux`
- `x64`
- `geomacro-load-generator`

The `staging-capacity` GitHub environment must provide:

- variable `RISK_GATE_DISTRIBUTED_STAGING_BASE_URL`
- variable `RISK_GATE_DISTRIBUTED_EXPECTED_HOST`
- variable `RISK_GATE_DISTRIBUTED_MAX_RATE_PER_CLIENT`
- secret `RISK_GATE_DISTRIBUTED_API_KEYS_JSON`

The workflow refuses production Geomacro hosts and refuses to fire traffic unless all 40 generator slots pass preflight and are simultaneously ready before the common barrier.

The required profiles are exact:

- burst: 1,000,000 requests, 40,000 requests/second aggregate, 25 seconds;
- soak: 12,000,000 requests, 40,000 requests/second aggregate, 300 seconds.

A pass requires exact request budgets, p95 < 1,500 ms, p99 < 3,000 ms, zero dropped iterations, zero 5xx, zero transport errors/timeouts, zero unexpected auth failures, zero 429 responses, zero response-security leakage, zero execution-boundary violations, and synchronized generator/first-request timing.

## Full infrastructure evidence closure

A successful raw load workflow is not the final capacity proof. Run `Distributed 40k Evidence Closure` with the successful capacity run ID, exact candidate SHA and immutable staging deployment ID.

The same `staging-capacity` environment must additionally provide:

- variable `RISK_GATE_DISTRIBUTED_TELEMETRY_URL`
- variable `RISK_GATE_DISTRIBUTED_TELEMETRY_EXPECTED_HOST`
- secret `RISK_GATE_DISTRIBUTED_TELEMETRY_TOKEN`

The telemetry collector must return `geomacro.distributed-40k-infra-telemetry.v2` bound to the same candidate SHA, deployment ID, burst run-group ID, soak run-group ID and staging target. It must identify an authenticated collector/evidence ID and show full-window coverage for both load profiles.

The validator fails closed unless evidence includes:

- DB pool peak utilization <= 0.85;
- DB wait p95 < 250 ms;
- zero DB connection errors and pool exhaustion events;
- edge/runtime CPU peak <= 0.90;
- edge/runtime memory peak <= 0.90;
- zero runtime saturation and runtime errors;
- zero unexpected auth failures, rate-limit events and bypass events;
- zero data-leak events;
- zero replay mismatches and duplicate effects;
- a successful idempotency conflict probe.

These limits are launch gates for this test contract, not claims of universal infrastructure limits.

## Provider saturation boundary

The synchronous `/api/risk-gate` path is source-audited. It uses authentication/rate-limit/idempotency state, persisted signed Risk Objects and the deterministic Risk Gate engine. It does not synchronously call an external AI/model provider.

Therefore external model-provider saturation is recorded as `not_applicable_to_synchronous_risk_gate_request_path`, not as a fabricated zero-utilization metric. The audit is scoped only to the Risk Gate request path; external providers used by ingestion or intelligence-generation systems are outside this capacity test.

## Post-load idempotency and control plane

After the real load, the closure workflow re-verifies the same staging SHA and proves:

- missing authentication is rejected;
- invalid authentication is rejected;
- one authenticated request succeeds;
- an exact replay returns HTTP 200 with the same audit ID and `X-Geomacro-Idempotent-Replay: true`;
- a changed payload with the same request ID fails HTTP 409 with `IDEMPOTENCY_CONFLICT`;
- secure response headers remain present;
- no API key is echoed;
- `execution_authorized` remains false.

## Exact live data reliability

After the final candidate is published to Lovable, `Strict Commercial Launch Closure` requires the live build marker to equal the exact candidate SHA and checks:

- `/institutional`
- `/global-risk`
- `/intelligence`
- `/api/early-warning?limit=1`
- Risk Gate, Data/API and discovery surfaces through the main live-surface smoke
- x402 and related machine-discovery resources
- outside-in non-destructive security smoke

The live-data smoke also checks the authoritative Supabase read paths directly:

- `public-risk-indices` must return the verified three-index contract with Geopolitics, Macro and Critical Minerals all available at launch closure;
- `public-early-warning` must return HTTP 200 with `degraded:false`.

Normal-state infrastructure failure markers on Institutional, Global Risk or Intelligence block closure.

## Strict Commercial Launch Closure

The definitive workflow is `.github/workflows/strict-commercial-launch-closure.yml`.

It requires:

- `published_sha`: exact current `main` SHA already published live;
- `distributed_evidence_run_id`: successful `Distributed 40k Evidence Closure` run on that exact SHA;
- final bounded isolated-staging safety parameters.

It downloads and parses the real evidence artifact rather than trusting artifact existence alone. It then runs exact live SHA/surface/data checks and outside-in security checks. Every required job must be `success`; otherwise closure is blocked.

## Current status rule

Until a real isolated staging execution, full telemetry evidence closure, final live publish and successful `Strict Commercial Launch Closure` have all completed on one exact SHA, the status remains:

**PENDING REAL DISTRIBUTED STAGING EXECUTION / STRICT CLOSURE.**

Code readiness is not capacity proof. A successful final closure is first-party evidence for the recorded candidate and test conditions, not a third-party penetration-test certification, a guarantee of 40,000 simultaneous open connections, or a guarantee of unlimited production capacity.
