# Risk Gate Staging HTTP Load Test

This is the next resilience gate after the secret-free in-process Risk Gate core baseline.

It is deliberately **staging-only**. It must not be used against `geomacro.live` or `www.geomacro.live`.

## What it measures

The harness sends synthetic authenticated Risk Gate requests through the actual HTTP boundary and records only aggregate evidence:

- total requests and concurrency;
- overall throughput;
- p50 / p95 / p99 / max HTTP latency;
- HTTP status counts;
- timeouts and network errors;
- non-JSON responses;
- server 5xx responses;
- unexpected client errors;
- rate-limit 429 responses;
- response-security violations;
- any violation of the permanent `execution_authorized=false` boundary.

It does not persist the API key, response bodies, request metadata, amounts, destinations, or customer information in the artifact.

## Pre-load response security probe

Before load begins, the dedicated staging workflow sends one synthetic authenticated Risk Gate request and fails closed unless all of these are true:

- the target is an isolated non-production host;
- redirects are refused rather than followed;
- the response is HTTP 200 and valid JSON;
- the API key is not echoed anywhere in the raw response;
- privileged response keys such as service-role keys, API secrets, authorization material, private keys and payment signatures are absent;
- the response explicitly preserves `execution_authorized=false`.

Only aggregate pass/fail evidence is written to `artifacts/risk-gate-staging-response-security.json`. The response body and API key are never written to the artifact.

The bounded load harness repeats the important response-security checks on every measured response. A load response fails the run if it follows a redirect, echoes the API key, exposes a forbidden privileged key, is non-JSON, or does not explicitly preserve `execution_authorized=false`.

## Prelaunch HTTP SLO gate

The load harness itself enforces Geomacro's current prelaunch acceptance objectives, so the same thresholds apply both in the dedicated staging workflow and when the harness is invoked by Final Non-Mainnet Launch Acceptance:

- p95 HTTP latency <= **3,000 ms**;
- p99 HTTP latency <= **8,000 ms**;
- **0** server 5xx responses;
- **0** timeouts;
- **0** network errors;
- **0** non-JSON responses;
- **0** unexpected 4xx responses;
- **0** response-security violations;
- **0** execution-boundary violations;
- at least one successful HTTP 200 response.

The dedicated staging workflow also runs a separate artifact validator after the load harness. The validator independently checks the measured p95/p99 values, the harness-recorded SLO contract, redirect refusal and zero-error/security counters.

These are Geomacro prelaunch acceptance objectives, not a claim about an external industry standard or a production SLA. The default thresholds are code-reviewed constants. The dedicated staging workflow also pins the same values explicitly.

For a deliberate rate-limit saturation exercise, `allow_429=true` may permit counted 429 responses. That does not relax any 5xx, timeout, network, JSON, response-security, execution-boundary or latency gate.

## Safety controls

The harness and response-security probe fail closed unless all of the following are true:

1. `RISK_GATE_LOAD_TEST_ACK=STAGING_ONLY` is present;
2. the target is not `geomacro.live` or `www.geomacro.live`;
3. redirects are refused;
4. non-local targets use HTTPS;
5. request count is at most 2,000;
6. concurrency is at most 25;
7. per-request timeout is at most 30 seconds;
8. the API key is provided through a server-side environment secret.

The GitHub Actions workflow uses the `staging` environment so deployment/environment approval rules can be applied separately from ordinary pull-request CI.

## Required staging configuration

The GitHub `staging` environment needs:

- variable `RISK_GATE_STAGING_BASE_URL`
- secret `RISK_GATE_STAGING_API_KEY`

The base URL must point to an isolated staging/preview deployment with staging data and credentials. Do not reuse a production customer API key.

## Workload modes

### Country

Synthetic requests use one configured ISO3 country subject.

### Corridor

Synthetic requests use one configured directional origin/destination corridor.

### Mixed

Country and corridor requests alternate.

All requests use a synthetic load-test action context and never submit or authorize financial execution.

## Evidence handling

Successful or failed manual runs upload the available files under one workflow artifact:

- `artifacts/risk-gate-staging-response-security.json`
- `artifacts/risk-gate-staging-http-load.json`
- `artifacts/risk-gate-staging-http-load-validation.json`

The artifact is retained for 30 days by the dedicated staging workflow. Accepted results should then be summarized in `docs/SECURITY_RESILIENCE_EVIDENCE.md` with the workflow run ID, exact commit, workload, measured results, limitations, and remediation/re-test status.

## Current status

**PENDING REAL STAGING RUN.** The harness, production-host guard, redirect refusal, response-security probe and SLO validator are CI-testable without secrets. A real HTTP capacity or latency claim must not be made until an isolated staging deployment, staging API client, environment variable, secret and explicit workflow-dispatch run exist and the resulting evidence passes all gates.
