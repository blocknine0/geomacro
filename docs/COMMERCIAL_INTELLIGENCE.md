# Geomacro Commercial Intelligence Contract

## Product identity

Geomacro is geopolitical and macro risk intelligence infrastructure.

The core product turns real-world events into structured, explainable, machine-readable risk intelligence for human and machine decision systems.

Prediction markets and programmable onchain execution are secondary application, feedback and technical-proof layers.

## Product status

| Surface | Status | Role |
| --- | --- | --- |
| Risk Intelligence | Live | Structured geopolitical and macro risk intelligence |
| Global Risk Index | Live | Versioned aggregate risk with evidence, confidence and change attribution |
| Ask Geomacro | Live | Intelligence query surface grounded in stored Geomacro data |
| Risk API | Private Pilot | Machine-readable country/corridor intelligence delivery |
| Risk Gate | Private Pilot | Verifiable pre-flight country/corridor risk context before customer-owned policy and execution |
| Prediction Markets | Technical Proof | Experimental market and feedback layer |
| Arc / USDC / Circle / CCTP | Technical Proof | Programmable execution and settlement proof |

Private Pilot does not mean a generally available public hosted API, self-serve production authentication, production SLA or finalized public pricing interface currently exists.

## Canonical architecture

```text
Real-world evidence and data
        -> Normalize, classify and preserve provenance
        -> Structured intelligence state
             +-- Global Risk Index - Live
             +-- Ask Geomacro - Live
             +-- Country Risk Object - Private Pilot --+
             +-- Corridor Risk Object - Private Pilot -+-> Risk Gate - Private Pilot
             +-- Arc / Circle / prediction-market technical proof

Risk Gate - Private Pilot
        -> Customer identity + permissions + policy
        -> Customer-controlled action
```

Data & API is an access and delivery surface over the shared intelligence state. Research and documentation are methodology, evidence and trust surfaces. Neither should become an independent risk engine or a conflicting product truth.

The customer owns the identity, permissions and policy layer. A caller may supply a customer-owned policy profile to a bounded Risk Gate request, but Geomacro does not own or enforce that policy and never authorizes downstream execution.

## Risk API

Risk API is the machine-readable delivery layer for approved pilot workflows.

Current Private Pilot scope is country and directional corridor risk.

Flow:

real-world evidence
→ structured intelligence
→ subject-specific risk score and delta
→ evidence and confidence
→ freshness and historical context
→ signed / verifiable machine-readable delivery

A production contract should expose risk scope, score, delta, drivers, confidence, evidence references, timestamps, methodology, provenance and integrity information.

Undocumented Supabase internals are not a public API contract.

## Risk Gate

Risk Gate is the pre-flight decision-context layer.

The current Private Pilot consumes country and directional corridor Risk Objects rather than blindly applying the global GRI score to every decision.

Event-specific Risk Objects remain a broader product direction only. They must not be represented as part of the current Private Pilot until a corresponding implementation, production contract, verification path and commercial eligibility boundary are separately established.

GRI and Risk Gate share the same governed intelligence, provenance, attribution and verification principles, while retaining product-specific admission and decision-context rules.

Canonical product sequence:

```text
Country / directional corridor Risk Object
        -> Risk Gate recommendation / decision context
        -> Customer identity + permissions + policy
        -> Customer-controlled action
```

Where an approved integration supplies a customer-owned policy profile to Risk Gate, the service may evaluate that profile to return bounded decision context. That does not transfer ownership or enforcement of the policy to Geomacro.

Canonical recommendation outcomes include:

- CONTINUE
- REDUCE_LIMIT
- REQUIRE_APPROVAL
- PAUSE
- REROUTE

A Risk Object should expose current risk, previous risk, delta, attribution, confidence, evidence, freshness, methodology version and integrity information.

A Risk Gate response should include reason codes, relevant risk drivers, confidence, evidence references, methodology/policy-profile version where applicable and evaluation timestamp.

Geomacro supplies verifiable decision context. The customer controls identity, permissions, policy, funds and execution. The current external Risk Gate boundary remains `execution_authorized=false`.

Risk Gate does not itself custody funds, submit trades, move assets or make the customer's final financial decision.

The first commercial wedge is country and directional corridor risk for workflows such as cross-border payments, treasury and institutional financial operations.

See [Geomacro Risk Gate](./RISK_GATE.md) for the canonical current product and technical contract.

## Commercial boundary

Geomacro sells structured and derived intelligence, not unrestricted copies of third-party raw data.

Commercial delivery must use only sources and derived data eligible for the intended commercial use.

Source eligibility should be explicit and fail closed. Research-only, non-commercial, license-review-pending or otherwise restricted sources must not silently enter paid Risk API or Risk Gate payloads.

When commercial rights are uncertain, that source should be excluded from the commercial delivery path until its permitted use is verified.

Payment or access mechanisms, including x402, must never bypass source-license or commercial-use restrictions.

## Architecture boundary

Current primary commercial path:

```text
Commercially eligible evidence and data
        -> Normalize, classify and preserve provenance
        -> Shared structured intelligence state
             +-- Global scope   -> Global Risk Index - Live
             +-- Country scope  -> Country Risk Object - Private Pilot
             +-- Corridor scope -> Corridor Risk Object - Private Pilot
        -> Delta + Attribution + Evidence + Confidence + Freshness + Integrity
        -> Ask Geomacro / approved Risk API delivery / Risk Gate
        -> Human or customer-controlled machine decision systems
```

For Risk Gate, the execution boundary remains:

```text
Country / directional corridor Risk Object
        -> Risk Gate - Private Pilot
        -> Customer Identity + Permissions + Policy
        -> Customer-Controlled Action
```

Optional x402 access or payment may sit in front of approved machine interfaces. The core risk calculation, provenance system and database must not depend on x402.

Optional secondary technical-proof path:

```text
Structured Risk Intelligence
        -> Prediction Markets / Programmable Execution Proof
        -> Arc / USDC / Circle / CCTP
```
