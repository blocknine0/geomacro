# 23. Product-Specific Intelligence Policies

Geomacro uses one intelligence architecture but different products have different admission and decision rules.

| Surface | Current status | Scope | Decision role |
|---|---|---|---|
| Global Risk Index | LIVE | Global aggregate | Public risk measurement |
| Ask Geomacro | LIVE | Stored Geomacro intelligence | Human query interface |
| Risk API | PRIVATE PILOT | Country / corridor machine context | Structured delivery |
| Risk Gate | PRIVATE PILOT | Country / corridor + customer policy | Pre-flight recommendation |
| Research | LIVE / evolving | Public methodology and analysis | Human research |
| Prediction / onchain | TECHNICAL PROOF | Arc Testnet application layer | Experimental execution |

The global GRI is **not** used as a universal allow/deny rule for a country or corridor transaction.

Risk Gate combines a verified subject-specific Risk Object with the customer's supplied policy contract. The customer remains responsible for identity, permissions, compliance and final execution.

Different product surfaces can therefore share evidence and provenance without creating separate conflicting data truths.