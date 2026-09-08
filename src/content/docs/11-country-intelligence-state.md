# 11. Country Intelligence State

**Status: PRIVATE PILOT FOUNDATION**

Geomacro separates the public global index from subject-specific country risk.

A country view is the machine-readable risk context for one ISO3 subject at a specific evaluation time. In the current Private Pilot, country risk is delivered through a signed Geomacro Risk Object (GRO) and is used by Risk Gate rather than by applying the global GRI as a universal rule.

A country Risk Object can carry:

- country subject and canonical identifier
- current and previous risk state
- risk delta
- attribution and reason codes
- evidence and confidence context
- generated and expiry timestamps
- methodology and schema versions
- integrity hash and issuer signature

```text
Country subject
      ↓
subject-specific risk inputs
      ↓
attribution + confidence + freshness
      ↓
signed GRO
      ↓
Risk Gate / machine consumer
```

The exact canonical object schema is defined by versioned code. Documentation examples must not override the implemented contract.

Country Risk Objects are currently **Private Pilot infrastructure**, not a generally available institutional country-risk product.