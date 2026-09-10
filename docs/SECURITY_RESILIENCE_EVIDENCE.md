# Security & Resilience Evidence

**Status:** pre-Early-Access evidence register  
**Last updated:** 2026-09-10

This document records security and resilience evidence that has actually been run or is reproducibly runnable in the Geomacro repository. It is intentionally narrower than an external audit or production SLA.

## Product boundary

Geomacro Risk Gate provides machine-readable risk context and policy evaluation. It does not authorize or submit transactions. The response boundary remains:

```text
execution_authorized=false
```

No test result in this document changes that product boundary.

## Evidence already completed

### Production authenticated idempotency proof

A production proof run against `https://geomacro.live/api/risk-gate` verified the external API behavior for one authenticated proof client:

- first valid request returned HTTP 200;
- immutable audit id: `rga_91a6a1df-def0-4870-96f8-d869d4f16f6c`;
- exact replay returned HTTP 200 with the same audit id;
- replay response included the Risk Gate idempotent-replay marker;
- changed payload under the same request id returned HTTP 409 with `IDEMPOTENCY_CONFLICT`;
- `execution_authorized=false` remained true for all responses.

This proves the scoped authenticated request/replay/conflict behavior. It does not prove full system capacity, availability, external penetration-test coverage or every failure mode.

### Database migration integrity

Production migrations 043 through 047, including the canonical idempotency/audit-hash reconciliation migration 045, were applied successfully. A post-apply migration dry run reported the remote schema up to date.

### Automated product security checks

The repository runs Product CI and CodeQL security scanning on relevant pull requests. These checks are useful regression controls but are not a substitute for an independent application-security review.

## Deterministic core stress harness

The repository includes:

```text
scripts/stress-risk-gate-core.ts
```

The harness repeatedly evaluates the pure in-process Risk Gate decision engine across four safety-critical scenarios:

1. verified low-risk context -> `CONTINUE`;
2. commercially unverified context -> `REQUIRE_APPROVAL`;
3. sanctions hard-stop threshold -> `PAUSE`;
4. unverifiable risk object -> `PAUSE`.

Every iteration asserts:

```text
execution_authorized=false
```

The harness records:

- iteration count;
- total duration;
- operations per second;
- p50, p95 and p99 in-process evaluation latency;
- decision counts;
- execution-boundary assertion result.

It writes the machine-readable result to:

```text
artifacts/risk-gate-core-stress.json
```

The GitHub workflow `.github/workflows/risk-gate-core-resilience.yml` runs this harness without production credentials and uploads the JSON evidence artifact.

## Scope limitation of the core harness

The core stress harness deliberately excludes:

- HTTP/network latency;
- authentication database access;
- rate-limit database access;
- immutable audit persistence;
- idempotency RPC/database contention;
- GRO loading/signature verification I/O;
- webhook delivery;
- Supabase availability;
- hosting/runtime saturation;
- third-party dependencies.

Therefore its throughput/latency numbers describe only the deterministic decision engine and must never be presented as end-to-end production API capacity.

## Remaining pre-Early-Access security/resilience gates

The following still require evidence before a stronger security/readiness claim:

- authenticated staging-safe end-to-end load test against the complete Risk Gate request path;
- malformed, oversized and abusive-request matrix with measured results;
- auth-backend and rate-limit-backend failure behavior;
- audit/idempotency persistence failure behavior;
- stale, expired, incomplete and unverifiable GRO behavior at the external API boundary;
- dependency outage/recovery behavior;
- duplicate-charge/transaction safety where payment rails are tested separately;
- secret exposure and service-role boundary review;
- remediation and re-test of any critical/high findings;
- scoped independent external security review before claiming external audit/review status.

## Claim discipline

Allowed wording after the repository harness and production proof pass:

> Geomacro has documented internal security and resilience testing for the Risk Gate private-pilot boundary, including authenticated idempotency proof and deterministic decision-engine stress testing.

Do not describe this evidence as:

- independently audited;
- certified;
- penetration-tested by a third party;
- production-SLA validated;
- unhackable;
- guaranteed available;
- full end-to-end capacity proof.
