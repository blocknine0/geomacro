# Geomacro Commercial Intelligence Contract

## Product identity

Geomacro is geopolitical and macro risk intelligence infrastructure.

The core product turns real-world events into structured, explainable,
machine-readable risk intelligence for human and machine decision systems.

Prediction markets and programmable onchain execution are secondary
application and feedback layers.

## Product status

| Surface | Status | Role |
| --- | --- | --- |
| Risk Intelligence | Live | Structured geopolitical and macro risk intelligence |
| Global Risk Index | Live | Versioned aggregate risk with evidence, confidence and change attribution |
| Ask Geomacro | Live | Intelligence query surface grounded in stored Geomacro data |
| Risk API | Private Pilot | Machine-readable intelligence delivery |
| Risk Gate | Private Pilot | Verifiable pre-flight risk context for customer-controlled policy decisions |
| Prediction Markets | Secondary | Experimental market and feedback layer |
| Arc / USDC / CCTP | Secondary | Programmable execution and settlement proof |

Private Pilot does not mean a generally available public hosted API,
self-serve authentication, SLA or public pricing interface currently exists.

## Risk API

Risk API is the intended machine-readable delivery layer.

Flow:

real-world evidence
→ structured intelligence
→ risk score and delta
→ evidence and confidence
→ historical context
→ machine-readable delivery

A production contract should expose risk scope, score, delta, drivers,
confidence, evidence references, timestamps, methodology and provenance.

Undocumented Supabase internals are not a public API contract.

## Risk Gate

Risk Gate is the intended pre-flight decision-context layer.

It consumes subject-specific Risk Objects such as country, corridor or event risk rather than blindly applying the global GRI score to every decision.

GRI and Risk Gate share the same deterministic intelligence, provenance, attribution and verification architecture.

Canonical policy model:

```text
Risk Object
+ Identity
+ Permissions
+ Customer Policy
= Action
```

Canonical policy outcomes include:

- CONTINUE
- REDUCE_LIMIT
- REQUIRE_APPROVAL
- PAUSE
- REROUTE

A Risk Object should expose current risk, previous risk, delta, attribution,
confidence, evidence, freshness, methodology version and integrity information.

A policy evaluation should include reason codes, relevant risk drivers,
confidence, evidence references, policy version and evaluation timestamp.

Geomacro supplies verifiable decision context. The customer controls policy
and execution.

Risk Gate does not itself custody funds, submit trades, move assets or make the
customer final financial decision.

The first commercial wedge is country and corridor risk for workflows such as
cross-border payments, treasury and institutional financial operations.

See [Geomacro Risk Gate](./RISK_GATE.md) for the canonical v1 product and
technical contract.

## Commercial boundary

Geomacro sells structured and derived intelligence, not unrestricted copies of third-party raw data.

Commercial delivery must use only sources and derived data eligible for the intended commercial use.

Source eligibility should be explicit and fail closed. Research-only, non-commercial, license-review-pending or otherwise restricted sources must not silently enter paid Risk API or Risk Gate payloads.

When commercial rights are uncertain, that source should be excluded from the commercial delivery path until its permitted use is verified.

Payment or access mechanisms, including x402, must never bypass source-license or commercial-use restrictions.

## Architecture boundary

Primary commercial path:

```text
Commercially eligible sources
        -> Structured Intelligence
        -> Shared Geomacro Risk Engine
             +-- Global scope   -> Global Risk Index
             +-- Country scope  -> Country Risk Object
             +-- Corridor scope -> Corridor Risk Object
             +-- Event scope    -> Event Risk Object
        -> Delta + Attribution + Evidence + Confidence
        -> Ask Geomacro / Risk API / Risk Gate
        -> Human or Machine Decision Systems
```

For Risk Gate, the policy boundary remains:

```text
Risk Object + Identity + Permissions + Customer Policy = Action
```

Optional x402 access or payment may sit in front of approved machine interfaces. The core risk calculation, provenance system and database must not depend on x402.

Optional secondary application path:

```text
Risk Intelligence
        -> Prediction Markets / Programmable Execution
        -> Arc / USDC / CCTP
```
