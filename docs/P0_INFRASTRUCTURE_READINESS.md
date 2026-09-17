# P0 Infrastructure Readiness Probe

Status: **NON-PRODUCTION · NO LOAD · NO REAL FUNDS**

The workflow `.github/workflows/p0-infrastructure-readiness.yml` checks whether the external infrastructure needed by the existing P0 closure workflows is actually configured before anyone attempts the real distributed run.

It performs no distributed load and no payment settlement.

## What it verifies

### GitHub environment `staging`

- `RISK_GATE_STAGING_BASE_URL`
- `RISK_GATE_STAGING_API_KEY`
- HTTPS isolated target
- production host rejection
- reachable `/.well-known/geomacro-build.json`
- valid canonical build SHA marker

### GitHub environment `staging-capacity`

- `RISK_GATE_DISTRIBUTED_STAGING_BASE_URL`
- `RISK_GATE_DISTRIBUTED_EXPECTED_HOST`
- `RISK_GATE_DISTRIBUTED_MAX_RATE_PER_CLIENT`
- `RISK_GATE_DISTRIBUTED_API_KEYS_JSON`
- `RISK_GATE_DISTRIBUTED_TELEMETRY_URL`
- `RISK_GATE_DISTRIBUTED_TELEMETRY_EXPECTED_HOST`
- `RISK_GATE_DISTRIBUTED_TELEMETRY_TOKEN`
- non-production HTTPS host matching
- API-client pool sizing for 40,000 aggregate requests/second while preserving normal per-client limits
- reachable canonical build marker

## What it deliberately does not verify

The repository cannot create or inspect GitHub self-hosted runner inventory through ordinary application CI. The final distributed execution still requires forty simultaneously available runner slots labeled:

- `self-hosted`
- `linux`
- `x64`
- `geomacro-load-generator`

The existing distributed workflow itself is the fail-closed proof for that fleet: all forty runners must occupy their slots and publish readiness before the common traffic barrier can arm.

## Safety boundary

A readiness PASS is not P0 completion. It only means the external staging configuration needed to attempt the existing exact-SHA distributed proof is present.

P0 remains complete only after:

1. exact release-candidate freeze;
2. same-SHA isolated staging deployment;
3. real 1M-request 40k RPS burst;
4. real 12M-request five-minute 40k RPS soak;
5. authenticated full-window telemetry closure;
6. exact same SHA published;
7. Strict Commercial Launch Closure PASS.

No step authorizes real-money production.
