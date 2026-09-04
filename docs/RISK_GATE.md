# Geomacro Risk Gate

## Status

Risk Gate is a Private Pilot product direction.

This document defines the v1 technical and commercial contract.

It does not claim that production wallet interception, cryptographically
signed Risk Objects, or a generally available Risk Gate API are live today.

## Thesis

Financial systems and autonomous agents already have rails to move money.

What they often lack is a verifiable way to understand when geopolitical or
macroeconomic conditions have changed enough that their financial behaviour
should change too.

Geomacro provides that external risk context.

> Geomacro turns changes in geopolitical and macro risk into verifiable,
> machine-readable context that financial systems and autonomous agents can
> check before they act.

## Core principle

Geomacro should not ask a downstream system to blindly trust a risk score.

It should provide enough information to inspect what changed, why it changed,
how the result was calculated, how confident the system is, and which evidence
supports the result.


## Relationship to the Global Risk Index

GRI and Risk Gate share the same intelligence, provenance, attribution and
verification architecture.

Risk Gate does not simply apply the global GRI score to every decision.

The shared Geomacro risk engine should support subject-specific risk views:

- global risk
- country risk
- corridor risk
- event risk

The Global Risk Index is the global view. Country, corridor and event Risk
Objects use the same verification principles but are scoped to their subject.


### Shared risk architecture

```text
Shared Geomacro Risk Engine
        |
        +-- Global scope   -> Global Risk Index
        +-- Country scope  -> Country Risk Object
        +-- Corridor scope -> Corridor Risk Object
        +-- Event scope    -> Event Risk Object
                                  |
                                  v
                              Risk Gate
```


## First commercial wedge

Risk Gate v1 should begin with country and corridor risk.

Example subjects:

```text
Country: India
Corridor: India -> UAE
```

Initial risk drivers may include:

- sanctions
- conflict
- political instability
- FX and currency stress
- shipping disruption
- macroeconomic stress
- relevant policy and regulatory shocks

The commercial output is not only the current risk level.

It should also expose the risk delta, attribution, confidence, evidence,
freshness and methodology.


## Geomacro Risk Object

The working name for the machine-readable risk primitive is the **Geomacro Risk Object (GRO)**.

A GRO should provide enough information for a downstream system to inspect and verify the risk context instead of blindly trusting a single score.

Example v1 shape:

```json
{
  "schema_version": "gro-1.0",
  "object_id": "gro_...",
  "subject": {
    "type": "corridor",
    "id": "IND-UAE"
  },
  "risk": {
    "score": 74,
    "label": "ELEVATED",
    "previous_score": 61,
    "delta": 13
  },
  "attribution": [
    {"driver": "sanctions", "contribution": 8},
    {"driver": "conflict", "contribution": 5}
  ],
  "confidence": 0.91,
  "evidence": [],
  "evidence_coverage": 0.82,
  "methodology_version": "country-corridor-1.0",
  "input_hash": "...",
  "data_hash": "...",
  "calculation_hash": "...",
  "generated_at": "...",
  "expires_at": "...",
  "issuer": "Geomacro",
  "verification_status": "verified"
}
```

A cryptographic issuer signature is part of the intended production design.
It must not be represented as a live capability until signing and verification are actually implemented.


## Risk delta and change attribution

Risk delta is a first-class signal.

A downstream system should be able to understand not only the current risk score, but what changed since the previous trusted state and which drivers caused that movement.

Example:

```text
Risk: 61 -> 78 (+17)

Sanctions            +8
Conflict             +5
FX stress            +3
Shipping disruption  +1
                     ---
                      17
```

For a deterministic methodology, material score movement should reconcile to its component contributions, subject to explicitly documented rounding or normalization rules.

The Risk Object should preserve the previous score, current score, delta, component attribution, methodology version and calculation integrity required to reproduce or audit the change.


## Pre-flight Risk Gate

The preferred integration point is before a financial action is submitted.

```text
Geomacro Risk Object
        |
        v
Wallet / Agent Pre-flight
        |
        v
Identity + Permissions + Customer Policy
        |
        v
CONTINUE / REDUCE_LIMIT / REQUIRE_APPROVAL / PAUSE / REROUTE
        |
        v
Customer-controlled execution
```

Wallet-level or agent-level integration provides broad coverage without requiring every downstream protocol to integrate Geomacro independently.

A smart-contract gate can remain a secondary integration option for pooled capital or workflows that require onchain verification.

## Policy boundary

Risk intelligence alone does not determine the final financial action.

The canonical model is:

```text
Risk Object
+ Identity
+ Permissions
+ Customer Policy
= Action
```

The same Risk Object may therefore produce different outcomes for different agents, permissions or customer mandates.

Geomacro supplies verifiable decision context. The customer controls policy and execution.

Risk Gate does not itself custody funds, submit trades, move assets or make the customer final financial decision.


## Reproducibility and verification

Risk calculations should be deterministic and versioned.

For the same validated inputs and methodology version, the risk engine should produce the same result.

A Risk Object should expose the information needed to audit that result, including methodology version, evidence references, timestamps, confidence, input hash, data hash and calculation hash.

Freshness is part of the verification contract.

A downstream system should be able to determine when the Risk Object was generated, when it expires, which evidence supports it and whether it is still valid for policy evaluation.

An expired or unverifiable object should not silently be treated as fresh verified risk context.


## Machine access and x402 boundary

The Geomacro Risk Object can become the common machine-readable primitive across Risk API, institutional integrations, wallets, autonomous agents and other machine-to-machine workflows.

Conceptually:

```text
Agent / Financial System
        |
        v
Risk API / Risk Gate
        |
        +-- Optional x402 access or payment layer
        |
        v
Geomacro Risk Object
        |
        v
Verification
        |
        v
Customer Policy
        |
        v
Customer-controlled action
```

x402 is an optional commercial access and payment rail. It is not part of the core risk calculation methodology and the core risk engine or database must not depend on x402 to function.

Risk API and Risk Gate remain Private Pilot capabilities until their production interfaces, authentication, operational guarantees and commercial access model are actually deployed.

This document must not be interpreted as claiming that a live x402 integration, generally available public Risk API or production wallet interception already exists.


## Why Risk Gate is different

Risk Gate is designed as more than a geopolitical news feed, generic risk dashboard or transaction rule engine.

Its differentiation comes from combining five layers in one decision-context architecture:

1. **External-world intelligence** - geopolitical and macro events become structured risk rather than remaining only headlines or narrative research.
2. **Change intelligence** - the system exposes what changed, by how much and which drivers contributed to the movement instead of returning only a static score.
3. **Subject-specific risk** - global, country, corridor and event views share provenance and methodology principles without applying one global scalar to every decision.
4. **Verifiable machine context** - Risk Objects are designed to carry evidence, confidence, methodology version, timestamps and integrity hashes so downstream systems can inspect the basis of a result.
5. **Pre-flight policy separation** - Geomacro provides external risk context before action while identity, permissions, customer policy and execution remain customer-controlled.

The intended product primitive is therefore not simply a score API.

```text
World change
    -> structured risk
    -> quantified delta
    -> attribution
    -> evidence + confidence
    -> verifiable Risk Object
    -> customer policy
    -> action
```

The commercial value is the ability to turn changes in the external world into explainable, auditable and machine-readable decision context before financial systems act.

This differentiation should remain consistent across Risk Intelligence, Risk API, Risk Gate, institutional integrations and agent-facing interfaces.


## Initial buyers and workflows

Risk Gate should initially target organizations where geopolitical and macro changes can materially affect financial decisions, capital movement or operating exposure.

Initial buyer profiles may include:

- investment and risk teams
- treasury and cross-border payment teams
- commodity and critical-mineral research firms
- institutional wallets and financial infrastructure providers
- autonomous financial-agent builders

The first commercial workflow should remain narrow enough to validate with real customers.

### Country and corridor pre-flight

Example:

```text
Proposed action: India -> UAE payment or treasury movement
        |
        v
Request corridor risk context
        |
        v
Current risk + previous risk + delta
        |
        v
Attribution + evidence + confidence
        |
        v
Customer policy evaluation
        |
        v
CONTINUE / REDUCE_LIMIT / REQUIRE_APPROVAL / PAUSE / REROUTE
```

The buyer is not purchasing a prediction about one isolated headline. The buyer is purchasing continuously updated, explainable external-risk context that can be incorporated into an existing decision process.

For early commercial pilots, Geomacro may deliver the same underlying intelligence through a combination of product access, structured reports, alerts, founder-supported workflows and private machine-readable interfaces while the production API and Risk Gate interfaces are hardened.

Any delivery method must preserve the same methodology, provenance and product truth boundaries.


## Failure and degraded-state behaviour

Risk Gate must distinguish a valid risk state from a degraded or unverifiable state.

A stale, expired, malformed or unverifiable Risk Object must never be silently presented as fresh verified context.

Relevant states should include:

- VERIFIED - object passed required integrity and freshness checks
- STALE - last verified object exists but its freshness window has passed
- EXPIRED - object is outside its permitted policy-evaluation window
- INCOMPLETE - required evidence or calculation inputs are missing
- UNVERIFIABLE - integrity, methodology or provenance checks cannot be completed

When verification is degraded, Risk Gate should expose the state, reason and last verified timestamp to the downstream policy layer.

Risk Gate itself should not silently convert a verification failure into CONTINUE.

The customer policy determines the appropriate response, such as REQUIRE_APPROVAL, PAUSE, REDUCE_LIMIT or another customer-defined fallback.

A temporary upstream data failure must not overwrite or destroy the last valid verified state. Where a last verified object exists, it may remain available with its actual freshness and verification status clearly preserved.

Methodology-version mismatches, unsupported schema versions and failed integrity checks must be explicit machine-readable conditions rather than hidden application errors.


## Private Pilot to production launch gates

Risk Gate must not be represented as generally available or production-ready until the required launch gates are satisfied.

### Required product gates

- stable and documented Risk Object schema with explicit versioning
- production country and corridor risk calculations backed by validated inputs
- deterministic delta and attribution generation
- evidence, confidence, provenance and freshness exposed consistently
- explicit degraded-state and verification-status handling
- documented customer-policy input and decision-output contract

### Required interface gates

- authenticated production interface for approved customers
- stable request and response contracts
- rate limiting and abuse controls
- schema and methodology compatibility rules
- documented errors, retries and timeout behaviour
- no dependency on undocumented internal database interfaces

### Required integrity and security gates

- reproducible calculation and integrity verification
- production-safe issuer identity
- cryptographic signing and signature verification before signed Risk Objects are advertised
- secret and credential isolation
- authorization boundaries and least-privilege access
- security review of externally reachable Risk Gate surfaces

### Required operational gates

- monitoring and structured logs
- health and dependency visibility
- incident and recovery procedure
- last-known-good preservation where appropriate
- controlled methodology and schema releases
- rollback or compatibility plan for breaking changes

### Required commercial gates

- real design-partner validation of the country or corridor workflow
- explicit customer use case and policy boundary
- commercially eligible source-data path
- customer-facing terms and permitted-use boundaries
- pilot pricing and support expectations
- production availability or service commitments documented only when they can actually be supported

Until these gates are satisfied, Risk Gate should remain labelled **Private Pilot**.

Passing the gates should be based on deployed and verified capability, not roadmap intent or documentation alone.


## Commercial data and source eligibility

Commercial Risk Gate outputs must be built only from data sources and derived intelligence that are eligible for the intended commercial use.

Source eligibility should be explicit and fail closed.

For every source, Geomacro should maintain enough policy metadata to determine whether it may be used for:

- commercial analysis
- redistribution
- raw-data storage
- derived intelligence
- customer-facing evidence or citations
- machine-readable commercial delivery

A source that is research-only, non-commercial, license-review pending or otherwise commercially restricted must not silently enter a paid Risk Gate or Risk API payload.

Conceptually:

```text
Source
   |
   v
Rights + eligibility check
   |
   +-- eligible ----------> normalization + risk engine
   |                              |
   |                              v
   |                       derived intelligence
   |                              |
   |                              v
   |                       Risk Object / Risk Gate
   |
   +-- not eligible ------> excluded from commercial delivery
```

Geomacro commercializes structured and derived risk intelligence, not unrestricted copies of third-party raw datasets.

Derived outputs should remain traceable to their permitted evidence and provenance without redistributing source material beyond the applicable rights.

Commercial eligibility must be evaluated before delivery, not after a customer request reaches the interface.

Payment or access mechanisms, including x402, must never bypass source-license or commercial-use restrictions.

When source rights are uncertain, the commercial path should exclude that source until its permitted use is verified.
