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
- any violation of the permanent `execution_authorized=false` boundary.

It does not persist the API key, response bodies, request metadata, amounts, destinations, or customer information in the artifact.

## Safety controls

The harness fails closed unless all of the following are true:

1. `RISK_GATE_LOAD_TEST_ACK=STAGING_ONLY` is present;
2. the target is not `geomacro.live` or `www.geomacro.live`;
3. non-local targets use HTTPS;
4. request count is at most 2,000;
5. concurrency is at most 25;
6. per-request timeout is at most 30 seconds;
7. the API key is provided through a server-side environment secret.

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

## Rate-limit mode

By default, any HTTP 429 fails the run because the normal objective is to measure behavior below the assigned client rate limit.

For an explicit rate-limit saturation exercise, set `allow_429=true`. In that mode 429 responses are counted as expected saturation evidence, but the run still fails on:

- zero successful 200 responses;
- any 5xx response;
- any unexpected 4xx response other than 429;
- any timeout or network error;
- any non-JSON HTTP response;
- any execution-boundary violation.

## Evidence handling

Successful or failed manual runs upload:

`artifacts/risk-gate-staging-http-load.json`

The artifact is retained for 30 days by the workflow. Accepted results should then be summarized in `docs/SECURITY_RESILIENCE_EVIDENCE.md` with the workflow run ID, commit, workload, measured results, limitations, and remediation/re-test status.

## Current status

**PENDING.** The harness and production-host guard can be validated without secrets, but a real staging HTTP load run must not be claimed until the staging deployment, isolated API client, environment variable, and secret are configured and an actual workflow-dispatch run completes.
