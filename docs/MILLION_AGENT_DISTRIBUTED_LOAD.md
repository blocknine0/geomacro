# 40k Distributed Staging Capacity Test

Geomacro keeps scale evidence in separate layers. The deterministic one-million virtual business-flow test validates business logic, replay/boundary behavior and secret-free serialization without network/provider effects. This distributed HTTP suite is the network-capacity layer for the authenticated Risk Gate boundary on isolated staging.

It must never target `geomacro.live` or `www.geomacro.live`, and ordinary GitHub CI never sends the external load. The no-traffic contract workflow proves the harness shape and safety rules only. It **does not by itself earn a 40,000 requests/second capacity claim**.

## Canonical 40k profiles

### 1M burst profile

- profile: `million_burst_40k`
- 1,000,000 distinct synthetic agents
- 1,000,000 authenticated Risk Gate requests
- 40 independent generator shards
- 25,000 requests per shard
- 1,000 requests/second per shard
- **40,000 requests/second aggregate**
- 25 seconds constant-arrival traffic
- 2,000 preallocated k6 virtual users per shard, up to 6,000

### Five-minute sustained profile

- profile: `soak_40k_5m`
- 12,000,000 distinct synthetic request identities
- **12,000,000 authenticated Risk Gate requests**
- 40 independent generator shards
- 300,000 requests per shard
- 1,000 requests/second per shard
- **40,000 requests/second aggregate**
- 300 seconds sustained traffic
- the same correctness and security gates as the burst profile

These tests measure HTTP arrival rate. They do not claim 40,000 simultaneous open sockets and do not guarantee unlimited production capacity.

## Real execution workflow

The only repository workflow allowed to send this distributed traffic is `.github/workflows/million-agent-distributed-staging-execution.yml`. It is manual `workflow_dispatch` only and requires the dedicated `staging-capacity` GitHub environment.

That environment must provide:

- variable `RISK_GATE_DISTRIBUTED_STAGING_BASE_URL` pointing to isolated staging;
- variable `RISK_GATE_DISTRIBUTED_EXPECTED_HOST` matching that staging host exactly;
- secret `RISK_GATE_DISTRIBUTED_API_KEYS_JSON` containing dedicated staging API clients;
- variable `RISK_GATE_DISTRIBUTED_MAX_RATE_PER_CLIENT` containing the normal entitlement ceiling used to size the client pool.

The workflow additionally requires an exact candidate SHA, an operator-recorded immutable staging deployment ID, and the literal capacity acknowledgement `I_CONFIRMED_STAGING_CAPACITY_AND_QUOTAS` after edge/CDN, app runtime, database and upstream/provider quotas have actually been reserved.

## 40-generator fleet requirement

A valid run needs **40 dedicated self-hosted load-generator runner slots** labeled `self-hosted`, `linux`, `x64`, and `geomacro-load-generator`. One independently provisioned generator host/process per runner is the operational requirement.

Every shard first runs a no-traffic preflight that verifies:

- local Git HEAD equals the exact candidate SHA;
- k6 is installed;
- the staging host is HTTPS and is not a production Geomacro hostname;
- `/.well-known/geomacro-build.json` reports the **same candidate SHA** and canonical repository;
- the API-key pool can preserve normal per-client rate controls at 40k aggregate;
- the explicit capacity acknowledgement is present.

After preflight, each job uploads a readiness artifact but deliberately keeps its self-hosted runner occupied. Every occupied job polls the current workflow run and refuses to arm traffic unless all 40 shard readiness artifacts exist with at least 30 seconds remaining before the common fire barrier. With fewer than 40 concurrently occupied runner slots, the barrier expires and the run fails before distributed traffic can start.

## Same-release and synchronization evidence

Each k6 shard summary is bound to:

- exact candidate SHA;
- staging SHA independently verified from the build marker;
- operator-recorded staging deployment ID;
- run-group ID;
- unique generator ID;
- common orchestrator barrier timestamp;
- generator launch timestamp and launch offset;
- staging target host.

The aggregate validator requires all 40 summaries to share the same candidate SHA, staging SHA, deployment ID, run-group ID, target host and barrier. Generator IDs and shard indexes must be unique and complete. Maximum cross-generator launch skew is 2,000 ms. Evidence from unrelated runs or releases cannot be combined into a pass.

## Hard safety requirements

The k6 workload refuses to start unless all of the following are true:

- `RISK_GATE_DISTRIBUTED_ACK=I_AUTHORIZE_DISTRIBUTED_ISOLATED_STAGING_LOAD`;
- `RISK_GATE_DISTRIBUTED_CAPACITY_ACK=I_CONFIRMED_STAGING_CAPACITY_AND_QUOTAS`;
- target is HTTPS and is not `geomacro.live` or `www.geomacro.live`;
- expected host exactly matches staging;
- candidate SHA equals the staging build-marker SHA;
- selected profile/shard/rate/duration/request budget is exact;
- dedicated staging API clients are sufficient for normal rate controls;
- 40 occupied generator slots pass the readiness barrier.

Throughput obtained by disabling authentication, entitlement checks, distributed abuse controls, idempotency or security middleware is invalid evidence.

## Per-response correctness and data-leak gates

Every accepted request uses a unique synthetic `agent_id` and `request_id`. No real customer data, real payment settlement or autonomous financial execution is used.

Every shard fails on any of the following:

- HTTP status other than 200;
- HTTP failure, timeout, redirect or dropped iteration;
- non-JSON body;
- selected API-key echo or sensitive/privileged response-key exposure;
- `execution_authorized` not explicitly false;
- response body over 256 KiB;
- missing JSON content type, `Cache-Control: no-store`, or `X-Content-Type-Options: nosniff`;
- any `Set-Cookie` response;
- p95 latency >= 1,500 ms or p99 latency >= 3,000 ms.

The aggregate validator requires the burst total to be exactly 1,000,000 and the five-minute soak total to be exactly 12,000,000.

## Brute-force and abuse-control alignment

The harness calculates the minimum API-client pool as `ceil(40000 / max_rate_per_client)`. Fewer clients abort the run before traffic, preventing a false capacity result based on bypassing per-client abuse controls. Separate adversarial tests remain responsible for bad credentials, replayed proofs, malformed inputs, scraping/brute-force behavior and distributed-limit enforcement.

## Infrastructure evidence required during a real run

Alongside the redacted shard summaries, preserve:

- exact candidate SHA, verified staging SHA and deployment ID;
- final burst and soak validator artifacts;
- edge/CDN request/error metrics;
- application CPU/memory/event-loop saturation;
- database connections, waits, lock contention and query latency;
- cache hit/miss data where applicable;
- provider quota confirmation or representative staging fixtures;
- 4xx/5xx, timeout, network error and retry counts;
- abuse-control saturation/rejections;
- remediation and re-test notes for any failure.

A pass is not valid if observability shows hidden queue growth or resource exhaustion that would fail immediately after the measured window.

## Execution sequence

1. Deploy the exact candidate SHA to isolated staging and apply its schema.
2. Provision dedicated staging API clients with normal controls.
3. Reserve edge/CDN, app, DB and provider capacity and enable observability.
4. Provision 40 dedicated self-hosted `geomacro-load-generator` runner slots.
5. Dispatch `Distributed 40k Staging Execution` from `main` with the exact candidate SHA and deployment ID.
6. All 40 burst jobs must preflight and occupy their runners before the synchronized barrier.
7. Run `million_burst_40k`, aggregate all 40 summaries and require the strict validator to pass.
8. Only after the burst is clean, re-verify staging still serves the same SHA.
9. Re-establish the 40-runner barrier and run `soak_40k_5m`.
10. Aggregate all 40 soak summaries and require the strict validator to pass.
11. Produce `distributed-40k-capacity-pass-<run_id>` only when both profiles pass on the same candidate/deployment/host.

## Proposed mainnet/API boundary

This workload exercises the authenticated business boundary that the proposed commercial API depends on while production payment settlement and execution remain disabled. A future payment-path capacity exercise must use a sandbox/staging settlement adapter and synthetic funds, never real USDC merely to obtain a throughput number.

## Evidence status

**PENDING DISTRIBUTED STAGING EXECUTION.**

The code path, synchronization barrier, same-release binding, 40-generator readiness gate, k6 profiles and strict validators are ready. A real 40,000 requests/second claim is not earned until the external isolated staging capacity, dedicated runner fleet and staging credentials are provisioned and the manual workflow produces a successful final capacity artifact.

Passing both profiles supports only this precise statement: the recorded Geomacro staging release processed the tested authenticated Risk Gate workload at 40,000 requests/second under the recorded SLO/security conditions. It is not a penetration-test certification, proof of 40,000 simultaneous live connections, or unlimited production-capacity guarantee.
