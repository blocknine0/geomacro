# Geomacro Security & Resilience Evidence Register

This document records reproducible engineering evidence for Geomacro launch-readiness work.

It is intentionally conservative. A passing entry proves only the scope listed for that entry. It does **not** imply that Geomacro is unhackable, certified, independently audited, or production-ready outside the tested scope.

## Evidence status vocabulary

- **PASS**: the recorded automated test completed successfully for the stated scope.
- **PENDING**: required test/review has not yet produced accepted evidence.
- **NOT IN SCOPE**: deliberately excluded from a specific test and must be assessed separately where relevant.

---

## Risk Gate core resilience baseline v1

**Status:** PASS  
**Date:** 2026-09-08  
**GitHub Actions run:** `34195514117`  
**Head commit:** `f27bc8bed896da427845e0ac164d748769d5e8be`  
**Artifact:** `risk-gate-core-resilience`  
**Artifact digest:** `sha256:d21c5ee2565f64af73b04dbd47c215b86ad2c0d5613e464d94ba7e7748445d12`

### Scope

Secret-free deterministic stress exercise of the in-process Risk Gate core:

1. external country request parser;
2. external directional corridor request parser;
3. customer policy evaluation engine;
4. historical `evaluated_at` rejection boundary for live pre-flight requests;
5. invariant that Risk Gate output never authorizes execution.

### Workload and correctness results

| Check | Iterations | Result |
|---|---:|---|
| Country request parsing | 30,000 | PASS |
| Corridor request parsing | 30,000 | PASS |
| Policy-engine evaluation | 30,000 | PASS |
| Historical live-preflight rejection | 6,000 | PASS |
| `execution_authorized` remained `false` | 30,000 engine evaluations | PASS |

Total correctness checks in the recorded run: **96,000**.

### Measured in-process performance

These values are CI-run measurements of pure application logic, not HTTP/API service-level latency targets.

| Path | Operations/sec | p50 ms/op | p95 ms/op |
|---|---:|---:|---:|
| Country request parse | 332,764.20 | 0.002030 | 0.006453 |
| Corridor request parse | 446,578.69 | 0.002099 | 0.002685 |
| Policy-engine evaluation | 868,259.78 | 0.000616 | 0.004134 |
| Historical-time rejection | 122,468.55 | 0.008179 | 0.009364 |

Observed Node heap delta across the complete harness was **3,655,448 bytes**. This is recorded as evidence only and is not yet an accepted production memory SLO.

### Explicit exclusions

The following were **not** exercised by this core baseline:

- Supabase/database latency or saturation;
- network transport;
- API authentication backend;
- database-backed rate limiter under concurrency;
- immutable audit-store write throughput;
- Cloudflare/Nitro runtime limits;
- production/staging concurrent HTTP traffic;
- fault injection against external dependencies;
- signing-key rotation during active traffic;
- full end-to-end country/corridor data freshness under load.

Those items require separate staging/integration resilience evidence before the first externally shareable commercial demo is represented as launch-ready.

---

## Current security-hardening evidence in progress

### Risk Gate external request boundary

**Status:** code and regression coverage implemented; final PR checks tracked separately.

Implemented controls include:

- bounded request bodies;
- strict customer-policy validation;
- near-current evaluation-time enforcement for live pre-flight requests;
- rate-limit response/configuration validation;
- country/corridor evaluation-clock consistency;
- fail-closed `execution_authorized=false` boundary;
- forward-only audit payload minimization while preserving the full-request hash.

### Risk Object signing-key lifecycle

**Status:** implementation under review in a separate PR.

Scope includes:

- Ed25519 key-type validation;
- current private/public key consistency checks;
- active/retired/revoked verification-key states;
- not-before/not-after validity windows;
- public verification-key discovery;
- coarse serving/publisher readiness checks.

---

## Required pre-demo evidence still pending

The following remain launch gates and must not be described as completed until evidence exists:

1. staging HTTP/API concurrency test including authentication, rate limiting and audit persistence;
2. database saturation/recovery and connection-failure behavior;
3. fresh-GRO availability/failure-mode testing across representative countries/corridors;
4. signing-key rotation and revocation drill against persisted GRO verification;
5. dependency outage/fault-injection tests;
6. abuse tests for authenticated oversized/malformed/request-flood traffic;
7. production-like runtime resource limits and timeout behavior;
8. security review of privileged credentials, Supabase service-role boundaries and operational access;
9. remediation and re-test of any critical/high findings;
10. external/independent security review if and when obtained; until then, do not label internal testing as a third-party audit.
