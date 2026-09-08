# 7. Contradiction Handling

**Status: PARTIAL FOUNDATION / FURTHER HARDENING PLANNED**

Real-world reporting can conflict. Geomacro's product principle is to preserve uncertainty or disagreement rather than silently convert contradictory evidence into false precision.

Future contradiction-aware evidence envelopes can expose:

- reported range
- source-family disagreement
- official versus unofficial confirmation
- best-supported estimate where defensible
- confidence
- freshness
- unresolved contradiction state

```mermaid
flowchart LR
    A[Claim A] --> D[Contradiction-aware evidence]
    B[Claim B] --> D
    C[Claim C] --> D
    D --> E[Agreement state]
    D --> F[Confidence]
    D --> G[Risk context]
```

Contradicted evidence is not the same as missing evidence, and neither should be silently interpreted as zero risk.
