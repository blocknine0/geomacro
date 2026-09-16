# 23. Product-Specific Intelligence Policies

Geomacro uses one intelligence architecture but different products have different admission and decision rules.

| Surface | Current status | Scope | Decision role |
|---|---|---|---|
| Risk Indices | LIVE | Separate geopolitical, macroeconomic and critical-mineral domains | Public domain risk measurement |
| Ask Geomacro | LIVE | Stored Geomacro intelligence | Human query interface |
| Risk API | PRIVATE PILOT | Country / corridor machine context | Structured delivery |
| Risk Gate | PRIVATE PILOT | Country / corridor risk context | Pre-flight recommendation |
| Research | LIVE / evolving | Public methodology and analysis | Human research |
| Prediction / onchain | TECHNICAL PROOF | Arc Testnet application layer | Experimental execution |

The public Risk Indices preserve the audited GRI v1.2 parent methodology and proof lineage. Historical combined-GRI snapshots remain versioned audit records rather than a second current product.

Neither a public Risk Index nor the historical combined GRI is used as a universal allow/deny rule for a country or corridor transaction.

Risk Gate uses a verified subject-specific Risk Object to return bounded decision context. An approved integration may supply a customer-owned policy profile as an evaluation input, but the customer retains ownership and enforcement of identity, permissions, policy, compliance and final execution.

Canonical boundary:

```text
Country / directional corridor Risk Object
        -> Risk Gate - Private Pilot
        -> Customer identity + permissions + policy
        -> Customer-controlled action
```

Different product surfaces can therefore share evidence and provenance without creating separate conflicting data truths. `execution_authorized=false` remains the external Risk Gate boundary.
