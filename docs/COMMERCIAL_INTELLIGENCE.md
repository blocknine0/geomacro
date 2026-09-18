# Geomacro Commercial Intelligence Contract

## Product identity

Geomacro is geopolitical, macroeconomic and critical-mineral risk intelligence infrastructure.

The core product turns real-world events into structured, explainable, machine-readable risk intelligence for human and machine decision systems.

Prediction markets and programmable onchain execution are secondary application, feedback and technical-proof layers.

## Intelligence Contract v1

The canonical current commercial intelligence response contract is documented in [Geomacro Intelligence Contract v1](./GEOMACRO_INTELLIGENCE_CONTRACT_V1.md). The contract keeps the existing adaptive API identity while adding versioned current state, deterministic direct answers and redacted structural developments.

Early-adoption pricing is **0.02 USDC per successful paid intelligence delivery for the first 10,000 deliveries**. The later reference price is **0.10 USDC**, subject to adoption evidence and an explicit commercial transition.

Current commercial responses do not redistribute raw upstream article material or source identity. Internal provenance and commercial-rights checks remain governed server-side.

## Product status

| Surface | Status | Role |
| --- | --- | --- |
| Risk Intelligence | Live | Structured geopolitical, macroeconomic and critical-mineral risk intelligence |
| Geopolitical Risk Index | Live | Separate verified geopolitical risk reading with audited GRI v1.2 lineage |
| Macroeconomic Risk Index | Live | Separate verified macroeconomic risk reading with audited GRI v1.2 lineage |
| Critical Minerals Risk Index | Live | Separate verified critical-minerals risk reading with audited GRI v1.2 lineage |
| Ask Geomacro | Live | Intelligence query surface grounded in stored Geomacro data |
| Risk API | Private Pilot | Machine-readable country/corridor intelligence delivery |
| Risk Gate | Private Pilot | Verifiable pre-flight country/corridor risk context before customer-owned policy and execution |
| Prediction Markets | Technical Proof | Experimental market and feedback layer |
| Arc / USDC / Circle / CCTP | Technical Proof | Programmable execution and settlement proof |

Private Pilot does not mean a generally available public hosted API, self-serve production authentication, production SLA or finalized public pricing interface currently exists.

The separate public Risk Indices preserve the audited `gri-v1.2.0` parent methodology and `gri-proof-v1.2.0` proof lineage. Historical combined-GRI snapshots remain versioned audit records rather than a second live headline product.

## Canonical architecture

```text
Real-world evidence and data
        -> Normalize, classify and preserve provenance
        -> Structured intelligence state
             +-- Separate Risk Indices - Live
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

The current Private Pilot consumes country and directional corridor Risk Objects rather than blindly applying a global or standalone public index score to every decision.

Event-specific Risk Objects remain a broader product direction only. They must not be represented as part of the current Private Pilot until a corresponding implementation, production contract, verification path and commercial eligibility boundary are separately established.

The public Risk Indices, audited GRI lineage and Risk Gate share the same governed intelligence, provenance, attribution and verification principles while retaining product-specific admission, scoring and decision-context rules.

Canonical product sequence:

```text
Country / directional corridor Risk Object
        -> Risk Gate recommendation / decision context
        -> Customer identity + permissions + policy
        -> Customer-controlled action
```

Where an approved integration supplies a customer-owned policy profile to Risk Gate, the service may evaluate that profile to return bounded decision context. That does not transfer ownership or enforcement of the policy to Geomacro.

Current Risk Gate v1 recommendation outcomes are:

- CONTINUE
- REDUCE_LIMIT
- REQUIRE_APPROVAL
- PAUSE

`REROUTE` is not a current v1 machine decision. It remains a future/advisory alternative only when a lower-risk corridor or route is separately validated.

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
             +-- Public domains -> Separate Risk Indices - Live
             +-- Country scope  -> Country Risk Object - Private Pilot
             +-- Corridor scope -> Corridor Risk Object - Private Pilot
        -> Delta + Attribution + Evidence + Confidence + Freshness + Integrity
        -> Ask Geomacro / approved Risk API delivery / Risk Gate
        -> Human or customer-controlled machine decision systems
```

The public indices preserve the audited GRI v1.2 parent/proof lineage; historical combined-GRI records remain audit evidence rather than a second current product.

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
