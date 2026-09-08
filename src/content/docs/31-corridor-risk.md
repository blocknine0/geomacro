# 31. Corridor Risk

**Status: PRIVATE PILOT**

The current corridor implementation is a **directional endpoint-composed pilot**.

A corridor subject such as `USA>CHN` is evaluated from signed origin and destination country Risk Objects under the pilot methodology.

```text
origin country GRO
        +
destination country GRO
        ↓
endpoint-composed corridor methodology
        ↓
signed corridor GRO
        ↓
Risk Gate policy evaluation
```

The current pilot methodology is designed to validate subject/API/policy architecture. It does **not** claim full modelling of:

- maritime routes or ports
- intermediary jurisdictions
- vessel/shipment paths
- counterparty-specific exposure
- transaction-specific sanctions screening
- complete logistics or supply-chain dependency graphs

Full route-aware corridor intelligence is a later product-development problem and must be independently validated before it is marketed as such.