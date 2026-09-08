# 22. Machine-Readable Risk Objects

**Status: PRIVATE PILOT**

The Geomacro Risk Object (GRO) is the versioned machine-readable primitive used by the current Risk Gate architecture.

A GRO is designed to expose enough context to inspect a risk decision rather than asking a consumer to trust a naked score.

A current object can include, according to its canonical schema:

- schema and object identity
- subject type and identifier
- current and previous risk state
- delta
- attribution and reason context
- confidence and evidence context
- methodology version
- generated and expiry timestamps
- canonical payload hash
- signing-key identifier
- Ed25519 issuer signature

```text
subject-specific intelligence
        ↓
versioned risk payload
        ↓
canonical payload hash
        ↓
Ed25519 signature
        ↓
verification + freshness checks
        ↓
customer policy
```

The exact canonical schema lives in versioned code. Examples in documentation are illustrative and must not override the implemented contract.

Current Private Pilot support covers country and directional corridor Risk Objects. This does not imply full route modelling, customer transaction authorization or general availability.