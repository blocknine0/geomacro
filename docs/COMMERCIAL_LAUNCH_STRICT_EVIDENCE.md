# Commercial Launch Strict Evidence

This is the strict manual prelaunch evidence gate for the exact Geomacro release candidate that has already been published through the hosting workflow.

It is intentionally separate from normal pull-request and main-push CI. It requires an explicit manual run because it combines isolated staging HTTP traffic with read-only checks against the published live site.

## What the workflow proves

The workflow `.github/workflows/commercial-launch-strict-evidence.yml` requires all of the following in one run:

1. The supplied `published_sha` is a 40-character Git SHA and exactly matches the dispatched canonical main commit.
2. The production build completes and the privileged-source/browser-bundle secret-boundary audit passes.
3. The isolated staging Risk Gate target passes an authenticated response-security probe.
4. The staging HTTP load harness remains bounded to at most 2,000 requests and 25 concurrent workers and cannot target `geomacro.live` or `www.geomacro.live`.
5. Every accepted staging response remains JSON, does not echo the API key, does not expose forbidden privileged key names, rejects redirects, and explicitly preserves `execution_authorized=false`.
6. The normal strict staging run records zero unexpected 4xx, 5xx, timeouts, network errors, non-JSON responses, execution-boundary violations, API-key echoes, sensitive-key exposures and redirects.
7. The prelaunch latency objective passes at p95 <= 3,000 ms and p99 <= 8,000 ms for the bounded staging workload.
8. The live public-surface smoke verifies the exact published build SHA rather than merely checking that a site responds.
9. The outside-in live security smoke remains non-destructive and checks the public exposure boundary.

Artifacts are retained for 90 days by the strict workflow.

## Required staging environment

The GitHub `staging` environment must provide:

- variable `RISK_GATE_STAGING_BASE_URL`
- secret `RISK_GATE_STAGING_API_KEY`

The target must be an isolated staging or preview deployment. The production Geomacro host is permanently rejected by the load and response-security harnesses.

## Recommended strict run

For the current prelaunch candidate, use:

- `staging_requests = 120`
- `staging_concurrency = 8`
- `staging_mode = mixed`

A later controlled saturation exercise can use a larger bounded workload, but it must still remain inside the hard limits and must never target production.

## What this does not prove

Passing the workflow is evidence for the tested release candidate and tested workload. It is not a guarantee that one million simultaneous production HTTP clients can be served, is not a third-party penetration-test certification, and is not a substitute for provider/CDN/WAF capacity evidence or a production-scale distributed load test.

The separate deterministic one-million virtual-agent exercise validates business-flow correctness and security invariants at very high synthetic volume. It must not be described as one million simultaneous real HTTP users.

## Activation boundary

This workflow does not:

- enable mainnet;
- authorize production funds;
- settle a real payment;
- enable public Early Warning distribution;
- enable paid X or LinkedIn automation;
- announce an official commercial launch.

Those remain separate, explicit activation decisions after the evidence gates and external prerequisites are satisfied.
