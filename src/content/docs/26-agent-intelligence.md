# 26. Agent Intelligence

**Status: PRIVATE PILOT FOUNDATION + MAINNET PAY-PER-CALL PRE-LAUNCH**

Geomacro is designed so financial agents and programmable systems can request external geopolitical and macro risk context before they act. The machine product supplies risk intelligence. It does not receive delegated authority to trade, transfer funds or approve the caller's final action.

## Two machine-access paths

### Governed Risk API / Risk Gate — PRIVATE PILOT

```text
agent intent / proposed action
        ↓
Risk API / signed country or directional corridor Risk Object
        ↓
Risk Gate - Private Pilot
        ↓
Risk Gate advisory response: CONTINUE / REDUCE_LIMIT / REQUIRE_APPROVAL / PAUSE
        ↓
customer identity + permissions + policy enforcement
        ↓
customer-controlled action
```

Risk Gate verifies the relevant risk context and returns a bounded advisory recommendation. An integration may supply a customer-owned policy profile as an evaluation input, but that input is not customer-side policy enforcement. The customer or caller still owns identity, permissions, policy design and enforcement, compliance rules and any downstream action.

`REROUTE` is not a current Risk Gate v1 machine decision. It may be introduced only as a separately validated advisory alternative without changing the four-state v1 decision contract.

### Adaptive pay per call — MAINNET PRE-LAUNCH

Canonical machine product: `geomacro_adaptive_risk_intelligence_v1`.

The prepared flow is:

```text
agent question + subject + topics
        ↓
free deliverability check
POST /api/x402/risk/availability
        ↓
if deliverable: exact HTTP 402 payment requirement
        ↓
verified USDC settlement
        ↓
governed machine-readable intelligence response
```

Prepared production price: **0.02 USDC per successful paid call**. Static documentation is informational; when production is enabled, the live HTTP 402 challenge or approved provider plan is authoritative.

The deliverability gate is intentionally before payment. A request that cannot currently be fulfilled with the required evidence, freshness, source rights and supported product scope must not become chargeable.

Production real-money activation remains disabled until coordinated launch gates and explicit owner authorization are complete.

## Example adaptive request

```json
{
  "question": "What are the current macro, FX and geopolitical risks for India?",
  "subjects": [{ "type": "country", "country_iso3": "IND" }],
  "topics": ["macro_risk", "fx_external_risk", "conflict_geopolitics"],
  "max_age_seconds": 86400,
  "detail": "standard"
}
```

The response remains evidence/source-governed and includes machine-readable context appropriate to the delivered product. Payment/query binding prevents a payment proof for one query from silently buying a different query. Replay and idempotent-delivery controls prevent a successful proof from becoming an uncontrolled duplicate-charge path.

## Execution boundary

The repository includes fail-closed pre-flight adapters for agent and wallet integration proof. A caller-owned executor may act only under the caller's own policy; Geomacro does not authorize that execution.

Geomacro does not:

- custody customer funds;
- sign customer wallet transactions;
- autonomously submit a trade or transfer;
- own or enforce customer identity, permissions or policy;
- replace sanctions/compliance screening;
- authorize the customer's final transaction.

`execution_authorized` remains `false` in the Geomacro response boundary.

Geomacro intelligence is informational risk context, not individualized investment advice or a guarantee of market outcomes.
