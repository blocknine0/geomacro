# Geomacro Institutional Integration Demo

## Purpose

This is the canonical buyer/integration-engineer walkthrough for Geomacro's **Verified Intelligence & Decision Infrastructure** positioning.

It demonstrates how structured geopolitical/macro risk context can be turned into a cryptographically verifiable artifact and evaluated against customer policy before a financial action.

It does **not** execute, sign or custody the customer's transaction.

## Deterministic scenario

The repo includes:

```bash
bun run scripts/run-institutional-corridor-demo.ts
```

The fixture models a hypothetical `USA>CHN` corridor and a proposed **USD 500,000 cross-border treasury transfer**.

The fixture is explicitly tagged `SIMULATION_FIXTURE`. It is not a live statement about the current USA-China corridor and is not a substitute for production evidence.

## Flow

1. A structured geopolitical disruption fixture is represented as governed evidence context.
2. A corridor Risk Object is constructed with score, delta, attribution, evidence references, methodology and provenance.
3. An ephemeral Ed25519 key signs the exact Risk Object payload.
4. The public verification library independently checks the canonical payload hash and signature.
5. A customer-supplied treasury policy evaluates the verified object.
6. The example score and positive delta produce `REQUIRE_APPROVAL` internally and the buyer-facing semantic action `REQUIRE_HUMAN_APPROVAL`.
7. Counterfactual output explains which policy/risk conditions would need to change for a less restrictive result.
8. `execution_authorized=false` remains explicit.

## What engineers can inspect

- Risk Object schema and evidence/provenance fields
- payload hash and Ed25519 signing contract
- public verification endpoint and key registry
- Risk Gate thresholds and reason codes
- buyer-facing semantic action
- counterfactual blockers
- API idempotency and immutable audit ID behavior
- OpenAPI contract at `docs/openapi/geomacro-v1.yaml`

## Latency evidence

The demo reports **local processing latency only** for:

- signing
- cryptographic verification
- Risk Gate policy evaluation
- total local demo execution

These measurements are useful for regression and integration engineering. They are **not** production event-to-decision latency, network latency, uptime evidence or an SLA.

Production latency claims must come from a deployed monitored environment and preserve timestamps for event receipt, normalization, Risk Object publication, Risk Gate evaluation and delivery.

## Integration boundaries

- Customer-facing data is structured-only. Raw/private warehouse access is not provided.
- Geomacro supplies external-world risk context and policy evaluation output.
- Customer systems remain responsible for execution, custody and transaction authorization.
- The current corridor model is endpoint-composed pilot logic, not full route/logistics/counterparty modelling.
- Legacy Arc Testnet/x402 behavior is technical proof only. It is not the planned production commercial billing system.

## Buyer demo sequence

For Dataminr/LSEG/S&P-style diligence, a bank, treasury platform, insurer, payment provider or agent-infrastructure buyer:

1. Show one source/evidence object and its timestamps.
2. Show the GRI proof and exact change attribution.
3. Run the signed Risk Object verification.
4. Show the proposed treasury action and customer policy.
5. Run Risk Gate and explain the semantic action/reason codes.
6. Show the counterfactual response.
7. Show the OpenAPI contract and idempotency/audit behavior.
8. End on integration boundaries and measured evidence, not marketing claims.

The commercial proposition is:

> Geomacro turns geopolitical and macro events into verifiable, machine-readable risk decisions that institutions and autonomous systems can consume and audit.
