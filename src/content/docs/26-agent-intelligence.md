# 26. Agent Intelligence

**Status: PRIVATE PILOT FOUNDATION**

Geomacro is designed so financial agents and programmable systems can request external geopolitical and macro risk context before they act.

Current architecture:

```text
agent intent / proposed action
        ↓
Risk API / signed country or directional corridor GRO
        ↓
Risk Gate - Private Pilot
        ↓
customer identity + permissions + policy
        ↓
CONTINUE / REDUCE_LIMIT / REQUIRE_APPROVAL / PAUSE / REROUTE
        ↓
caller-controlled action
```

Risk Gate verifies the relevant risk context and returns a bounded recommendation. An integration may supply a customer-owned policy profile as an evaluation input, but the customer or caller owns the identity, permissions, policy, compliance rules and any downstream action.

The repository includes fail-closed pre-flight adapters for agent and wallet integration proof. A caller-owned executor may act only under the caller's own policy; Geomacro does not authorize that execution.

Geomacro does not at this boundary:

- custody funds
- sign customer wallet transactions
- autonomously submit a trade or transfer
- own or enforce customer identity, permissions or policy
- replace sanctions/compliance screening
- authorize the customer's final transaction

`execution_authorized` remains `false` in the Geomacro response boundary.
