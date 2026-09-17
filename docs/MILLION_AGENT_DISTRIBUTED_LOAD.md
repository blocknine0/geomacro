# 40k Distributed Staging Capacity Test

Geomacro keeps scale evidence in separate layers. The deterministic one-million virtual business-flow test validates business logic, replay/boundary behavior and secret-free serialization without network/provider effects. This distributed HTTP suite is the network-capacity layer for the authenticated Risk Gate boundary on isolated staging.

It must never target `geomacro.live` or `www.geomacro.live`, and ordinary GitHub CI never sends the external load.

## Canonical 40k profiles

The repository defines two exact profiles:

### 1M burst profile

- profile: `million_burst_40k`
- 1,000,000 distinct synthetic agents
- 1,000,000 authenticated Risk Gate requests
- 40 independent generator shards
- 25,000 requests per shard
- 1,000 requests/second per shard
- **40,000 requests/second aggregate**
- 25 seconds constant-arrival traffic
- 2,000 preallocated k6 virtual users per shard
- up to 6,000 virtual users per shard

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

These tests measure an HTTP arrival rate. They do not claim 40,000 simultaneous open sockets and they do not guarantee unlimited production capacity.

## Hard safety requirements

The k6 workload refuses to start unless all of the following are true:

- `RISK_GATE_DISTRIBUTED_ACK=I_AUTHORIZE_DISTRIBUTED_ISOLATED_STAGING_LOAD`;
- `RISK_GATE_DISTRIBUTED_CAPACITY_ACK=I_CONFIRMED_STAGING_CAPACITY_AND_QUOTAS`;
- the target is HTTPS;
- the target is not a production Geomacro hostname;
- `RISK_GATE_DISTRIBUTED_EXPECTED_HOST` exactly matches the configured staging host;
- the selected profile/shard/rate/duration/request budget is exact;
- edge/CDN, app runtime, database pool and upstream/provider capacity have been separately reserved or confirmed;
- dedicated staging API clients are supplied through `RISK_GATE_DISTRIBUTED_API_KEYS_JSON`;
- `RISK_GATE_DISTRIBUTED_MAX_RATE_PER_CLIENT` declares the normal allowed per-client rate for the staging entitlement;
- the API-key pool is large enough that 40k aggregate traffic does not require bypassing per-client abuse controls.

Throughput obtained by disabling authentication, entitlement checks, distributed abuse controls, idempotency or security middleware is invalid evidence.

## Per-response correctness and data-leak gates

Every accepted request uses a unique synthetic `agent_id` and `request_id`. No real customer data, real payment settlement or autonomous financial execution is used.

Every shard fails on any of the following:

- HTTP status other than 200;
- HTTP failure, timeout or dropped iteration;
- redirect;
- non-JSON body;
- selected API-key echo;
- sensitive/privileged response key exposure;
- `execution_authorized` not explicitly false;
- response body over 256 KiB;
- missing JSON content type;
- missing `Cache-Control: no-store`;
- any `Set-Cookie` response;
- missing `X-Content-Type-Options: nosniff`;
- p95 latency >= 1,500 ms;
- p99 latency >= 3,000 ms.

The aggregate validator also requires every shard to complete its exact request budget. For the burst profile that total must be exactly 1,000,000. For the five-minute soak it must be exactly 12,000,000.

## Brute-force and abuse-control alignment

The 40k test is intentionally not a single privileged client. A real commercial system must preserve per-client and global rate controls while legitimate scale is distributed across authorized clients/agents.

Before execution, determine the staging entitlement's normal maximum request rate per client. The harness calculates the minimum API-client pool as:

`ceil(40000 / max_rate_per_client)`

If fewer unique staging API keys are provided, the run aborts before sending traffic. This prevents a false capacity result that depends on turning abuse protection off.

Separate adversarial security tests remain responsible for proving bad credentials, replayed proofs, underpayment, oversized inputs, malformed framing, spoofed proxy identity, scraping/brute-force behavior and distributed-limit enforcement fail closed. The high-volume capacity run does not replace those negative tests.

## Infrastructure evidence required during a real run

A valid 40k result should preserve, alongside the redacted shard summaries:

- exact candidate Git SHA and staging deployment ID;
- edge/CDN request and error metrics;
- application CPU/memory/event-loop saturation metrics;
- database active connections, wait time, lock contention and query latency;
- cache hit/miss data where applicable;
- upstream AI/data/provider quota confirmation or representative staging fixtures;
- 4xx/5xx, timeout, network error and retry counts;
- abuse-control saturation and rejected-client counts;
- p50/p95/p99 latency and throughput by profile;
- remediation and re-test notes if any gate fails.

A pass is not valid if observability shows hidden queue growth or resource exhaustion that would fail immediately after the measured window.

## Execution sequence

1. Deploy the exact candidate SHA to an isolated staging environment.
2. Apply the exact candidate database schema/migrations.
3. Provision a dedicated staging API-client pool with normal entitlement/rate controls.
4. Confirm edge/CDN, app, DB and provider quotas for the intended 40,000 req/s profile.
5. Enable staging observability and alerts for errors, latency, DB saturation, queue depth and abuse-control saturation.
6. Generate both canonical no-traffic plans.
7. Run `million_burst_40k` across all 40 isolated generators.
8. Aggregate all 40 redacted shard summaries and require the strict validator to pass.
9. Only after the burst is clean, run `soak_40k_5m` across all 40 generators.
10. Aggregate all 40 soak summaries and require the strict validator to pass.
11. Preserve exact-SHA evidence and any remediation/re-test trail.

## Proposed mainnet/API boundary

This workload exercises the authenticated business boundary that the proposed commercial/mainnet API depends on while payment settlement and execution remain disabled.

A future payment-path capacity exercise must use a sandbox/staging settlement adapter and synthetic funds. It must not use real USDC or production settlement merely to obtain a throughput number. Existing x402 acceptance tests continue to cover request/payment binding, no unpaid premium-data leak, duplicate/replay protection and `execution_authorized=false`.

## Evidence status

**PENDING DISTRIBUTED STAGING EXECUTION.**

The repository contains the production-blocked 40k burst/soak plans, k6 workload, strict result validator and CI contract. A real 40,000 requests/second claim is not earned until an isolated staging deployment, sufficient authorized client pool, reserved infrastructure/provider capacity and distributed generator fleet execute the profiles and all validators pass.

Passing both profiles would support the precise statement that the tested Geomacro staging release processed the tested authenticated Risk Gate workload at 40,000 requests/second under the recorded conditions and SLO/security constraints. It would not be a penetration-test certification or proof of 40,000 simultaneous live connections.
