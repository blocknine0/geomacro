# 26. Agent Intelligence

**Status: PRIVATE PILOT FOUNDATION**

Geomacro is designed so financial agents and programmable systems can request external geopolitical and macro risk context before they act.

Current architecture:

```text
agent intent / proposed action
        ↓
Risk API / Risk Gate
        ↓
signed country or corridor GRO
        ↓
verification + freshness
        ↓
customer policy
        ↓
CONTINUE / REDUCE_LIMIT / REQUIRE_APPROVAL / PAUSE / REROUTE
        ↓
caller-controlled execution
```

The repository includes a fail-closed agent/wallet pre-flight adapter. A caller-owned executor is invoked only after an explicit `CONTINUE` decision under the caller's policy.

Geomacro does not at this boundary:

- custody funds
- sign customer wallet transactions
- autonomously submit a trade or transfer
- replace sanctions/compliance screening
- authorize the customer's final transaction

`execution_authorized` remains `false` in the Geomacro response boundary.