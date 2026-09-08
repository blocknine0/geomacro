# Geomacro Risk Gate

## Status

Risk Gate is a **Private Pilot** capability.

The current repository implements the first commercial backend foundation for country and corridor pre-flight risk evaluation, including:

- versioned Geomacro Risk Objects (GROs);
- Ed25519 issuer signing and signature verification;
- persisted Risk Objects and read-back verification;
- fail-closed pre-flight evaluation;
- country and directional corridor subjects;
- authenticated external Risk Gate requests;
- database-backed per-client rate limiting;
- immutable decision audit records;
- caller-owned execution after an explicit policy decision.

These capabilities are implemented and tested as Private Pilot infrastructure. They **must not** be represented as generally available production service, production wallet interception, autonomous transaction authorization, full corridor/logistics modelling, or independently validated institutional risk methodology.

`execution_authorized` remains `false` at the Geomacro boundary. Geomacro supplies risk context and a policy decision response; the customer or caller retains control of any downstream execution.

Commercial source eligibility is not yet fully verified across all candidate evidence sources. Restricted, research-only or license-review-pending sources must fail closed and remain outside paid delivery until their permitted use is confirmed.

## Thesis

Financial systems and autonomous agents increasingly have rails to move money, rebalance positions and initiate transactions.

What they often lack is a verifiable way to understand when geopolitical or macroeconomic conditions have changed enough that their financial behaviour should be reviewed.

Geomacro provides that external risk context.

> Geomacro turns changes in geopolitical and macro risk into verifiable, machine-readable context that financial systems and autonomous agents can check before they act.

## Core principle

Geomacro should not ask a downstream system to blindly trust a risk score.

A Risk Object should expose enough information to inspect:

- what changed;
- by how much;
- which drivers contributed;
- which evidence supports the result;
- how confident the system is;
- when the object was generated and expires;
- which methodology/schema version produced it;
- whether its integrity and issuer signature verify.

The product primitive is therefore **decision context**, not merely a scalar score.

## Relationship to the Global Risk Index

GRI and Risk Gate share Geomacro's broader intelligence, provenance, attribution and verification principles, but they are not interchangeable outputs.

Risk Gate does **not** apply the global GRI score as a universal transaction rule.

The shared architecture supports subject-specific views:

```text
Shared Geomacro Risk Architecture
        |
        +-- Global scope   -> Global Risk Index
        +-- Country scope  -> Country Risk Object
        +-- Corridor scope -> Corridor Risk Object
        +-- Event scope    -> Event Risk Object direction
                                  |
                                  v
                              Risk Gate
```

Country and corridor Risk Objects are the current Private Pilot commercial wedge. Event-specific Risk Objects remain part of the broader product architecture and must only be labelled live when the corresponding production contract is actually implemented and verified.

## First commercial wedge

Risk Gate v1 begins with country and corridor risk.

Example subjects:

```text
Country: India
Corridor: India -> UAE
```

Relevant risk drivers may include, where validated and commercially eligible:

- sanctions and restrictions;
- conflict and political instability;
- macroeconomic stress;
- FX/currency stress;
- shipping or supply-chain disruption;
- relevant policy and regulatory shocks.

The buyer is not purchasing a prediction about one isolated headline. The intended value is continuously updated, explainable external-risk context that can be incorporated into an existing decision or approval process.

## Current corridor scope

The current corridor implementation is a **directional endpoint-composed pilot**.

It evaluates corridor context using the origin and destination country Risk Objects under the pilot corridor methodology. It is useful for validating the product/API/policy architecture, but it is **not** a claim of full physical-route risk modelling.

The current corridor pilot must not be described as modelling all of the following unless those capabilities are separately built and validated:

- maritime route/path exposure;
- port-by-port logistics risk;
- intermediary jurisdictions;
- counterparty-specific exposure;
- sanctions-screening of a particular transaction or entity;
- vessel or shipment routing;
- full supply-chain dependency graphs.

## Geomacro Risk Object (GRO)

The **Geomacro Risk Object (GRO)** is the machine-readable risk primitive used by the Private Pilot architecture.

A GRO is designed to carry subject, risk, attribution, evidence/confidence, freshness, methodology and integrity information so a downstream system can inspect and verify the context rather than trusting a naked score.

Conceptual shape:

```json
{
  "schema_version": "gro-...",
  "object_id": "gro_...",
  "subject": {
    "type": "country-or-corridor",
    "id": "..."
  },
  "risk": {
    "score": 74,
    "label": "ELEVATED",
    "previous_score": 61,
    "delta": 13
  },
  "attribution": [],
  "confidence": 0.91,
  "evidence": [],
  "methodology_version": "...",
  "generated_at": "...",
  "expires_at": "...",
  "integrity": {
    "payload_hash": "...",
    "signature_scheme": "Ed25519",
    "signing_key_id": "...",
    "signature": "..."
  }
}
```

The exact canonical schema is defined in code and versioned contracts. Documentation examples are illustrative and must not override the implemented schema.

## Signing and verification

Private Pilot GRO signing is implemented with Ed25519 issuer keys.

The signing path:

1. validates the supported GRO schema;
2. canonicalizes the signable payload;
3. computes a SHA-256 payload hash;
4. signs the canonical payload with the configured Ed25519 private key;
5. self-verifies the signature before returning the signed object.

Verification uses the signing key id and configured public-key registry. Old verification keys can be retained during controlled key rotation.

Operational rules:

- signing private keys must remain server-side and outside source control;
- public verification keys may be distributed as needed for verification;
- unsupported schema/signature states must fail closed;
- key rotation must preserve verification of already-issued objects where required by the pilot contract;
- signing implementation does not by itself constitute external security certification.

## Risk delta and change attribution

Risk delta is a first-class signal.

A downstream system should be able to understand not only the current risk state, but what changed since the previous trusted state and which drivers caused the movement.

Conceptually:

```text
Risk: 61 -> 78 (+17)

Sanctions            +8
Conflict             +5
FX stress            +3
Shipping disruption  +1
                     ---
                      17
```

For deterministic methodologies, material score movement should reconcile to its component contributions subject to explicitly documented normalization and rounding rules.

Risk Objects should preserve the previous score/state, current score/state, delta, attribution, methodology version and integrity data required to audit the change.

## Pre-flight Risk Gate

The preferred integration point is **before** a financial action is submitted by the customer's system.

```text
Signed Geomacro Risk Object
        |
        v
Verification + freshness checks
        |
        v
Customer identity + permissions + policy
        |
        v
CONTINUE / REDUCE_LIMIT / REQUIRE_APPROVAL / PAUSE / REROUTE
        |
        v
Customer-controlled execution
```

The current code includes a fail-closed agent/wallet pre-flight adapter. The caller-owned executor is invoked only after an explicit `CONTINUE` decision under the caller's policy.

This does **not** mean Geomacro is a wallet custodian or autonomous transaction signer.

## Policy boundary

Risk intelligence alone does not determine the customer's final financial action.

The canonical model is:

```text
Risk Object
+ Identity
+ Permissions
+ Customer Policy
= Policy decision
```

The same verified Risk Object may produce different outcomes under different customer mandates.

Geomacro provides external risk context and evaluates the supplied policy contract. The customer remains responsible for its policy, permissions, compliance obligations and execution.

Geomacro Risk Gate does not itself:

- custody customer funds;
- submit customer trades;
- sign customer wallet transactions;
- move customer assets;
- replace sanctions/compliance screening;
- make the customer's final fiduciary or investment decision.

## Private Pilot external API

The current external Risk Gate API foundation supports authenticated country and corridor requests.

Key controls include:

- bearer API credentials;
- server-side SHA-256 API-key storage rather than plaintext keys;
- timing-safe hash comparison;
- enabled/disabled client state;
- database-backed per-client request limits;
- explicit JSON/content-type validation;
- country ISO3 validation;
- subject-aware country and corridor requests;
- immutable request/response audit records;
- `Cache-Control: no-store` responses;
- `execution_authorized=false` enforcement.

Legacy country request compatibility is retained while subject-aware requests provide the forward interface.

The API remains **Private Pilot**. Authentication, rate limiting and real test calls do not imply a generally available SLA or production support commitment.

## Audit trail

Authenticated Risk Gate evaluations write an immutable audit record containing enough metadata to correlate the client, request, subject, risk object, methodology, policy, decision, reason codes, status and request/response hashes.

Audit persistence is part of the commercial decision contract. A successful decision must not silently bypass the required audit record.

Unauthenticated attacker-controlled traffic is not written into the commercial audit ledger merely for observability.

## Verification and degraded states

Risk Gate must distinguish a valid verified state from a degraded or unverifiable state.

Relevant states should include, as supported by the implemented contracts:

- `VERIFIED` — required integrity/freshness checks passed;
- `STALE` — a last verified object exists but freshness has passed;
- `EXPIRED` — outside its policy-evaluation window;
- `INCOMPLETE` — required evidence/calculation inputs are missing;
- `UNVERIFIABLE` — integrity, schema, methodology, provenance or signature checks cannot be completed.

A stale, expired, malformed or unverifiable object must never be silently converted into fresh verified context or an implicit `CONTINUE`.

A temporary upstream failure should not destroy the last valid verified state. Where preserved, the last-known-good object must retain its actual timestamp and degraded/freshness status.

## Failure behaviour

Risk Gate is designed to fail closed at the Geomacro execution boundary.

Examples of conditions that should not silently authorize execution include:

- authentication backend failure;
- rate-limit backend failure;
- unsupported subject/schema/methodology;
- invalid or missing signature;
- expired Risk Object;
- audit persistence failure for an otherwise successful decision;
- unavailable required risk inputs;
- malformed customer request.

The customer's own policy determines whether a degraded state should cause approval escalation, pause, reduced limits or another customer-defined fallback.

## Machine access and x402 boundary

The GRO can serve as a common machine-readable primitive across institutional integrations, autonomous agents and machine-to-machine workflows.

Conceptually:

```text
Agent / Financial System
        |
        v
Risk API / Risk Gate
        |
        +-- optional commercial access/payment rail
        |
        v
Signed GRO
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

x402 or another machine-payment/access mechanism may become a commercial rail, but it is not part of the core risk methodology and must never be required for the risk engine/database to function.

No live x402 integration should be claimed until it is actually implemented and verified.

## Why Risk Gate is different

Risk Gate combines five layers in one decision-context architecture:

1. **External-world intelligence** — geopolitical and macro developments become structured risk rather than remaining only headlines or narrative research.
2. **Change intelligence** — the system exposes what changed, by how much and why instead of returning only a static score.
3. **Subject-specific risk** — global, country and corridor views share verification principles without applying one global scalar to every decision.
4. **Verifiable machine context** — Risk Objects carry versioning, freshness, integrity and issuer-verification primitives.
5. **Pre-flight policy separation** — Geomacro provides external risk context before action while customer identity, permissions, policy and execution remain customer-controlled.

```text
World change
    -> structured risk
    -> quantified delta
    -> attribution
    -> evidence + confidence
    -> signed/verifiable Risk Object
    -> customer policy
    -> customer-controlled action
```

## Initial buyers and workflows

Initial design-partner profiles may include:

- investment and risk teams;
- treasury and cross-border payment teams;
- institutional wallet/financial infrastructure providers;
- commodity and critical-mineral research/operations teams;
- autonomous financial-agent builders.

The first commercial workflow should remain narrow enough to validate with real customers.

Example:

```text
Proposed action: India -> UAE payment or treasury movement
        |
        v
Request corridor risk context
        |
        v
Signed endpoint-composed corridor GRO
        |
        v
Current risk + previous risk + delta
        |
        v
Attribution + evidence + confidence + freshness
        |
        v
Customer policy evaluation
        |
        v
CONTINUE / REDUCE_LIMIT / REQUIRE_APPROVAL / PAUSE / REROUTE
```

For early pilots, the same underlying intelligence may be delivered through founder-supported workflows, controlled product access, structured reports/alerts and private machine-readable interfaces while the production service is hardened.

## Commercial data and source eligibility

Commercial Risk Gate outputs must use only sources and derived intelligence eligible for the intended commercial use.

For each source, Geomacro should maintain policy metadata sufficient to decide whether it may be used for:

- commercial analysis;
- raw-data storage;
- derived intelligence;
- redistribution;
- customer-facing evidence/citations;
- machine-readable commercial delivery.

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
   |                       GRO / Risk Gate
   |
   +-- not eligible ------> excluded from commercial delivery
```

Geomacro commercializes structured/derived risk intelligence, not unrestricted copies of third-party datasets.

Source rights must be evaluated **before** paid delivery. Payment or access mechanisms must never bypass source-license restrictions.

## Private Pilot -> production launch gates

Risk Gate must remain labelled **Private Pilot** until deployed evidence satisfies the relevant launch gates.

### Product gates

- stable, documented and versioned GRO schema;
- validated production country/corridor risk inputs and methodology;
- deterministic delta and attribution generation where claimed;
- consistent evidence/confidence/provenance/freshness;
- explicit degraded-state handling;
- documented customer-policy input and decision-output contract.

### Interface gates

- authenticated production interface for approved customers;
- stable request/response contracts;
- rate limiting and abuse controls;
- documented compatibility/version rules;
- documented errors/retries/timeouts;
- no dependence on undocumented internal database interfaces.

### Integrity and security gates

- reproducible calculation and integrity verification;
- controlled production issuer identity/key management;
- secret/credential isolation;
- least-privilege authorization boundaries;
- externally reachable surface security review;
- stress/resilience testing;
- critical/high findings remediated and re-tested before Early Access launch;
- smart-contract/execution claims reviewed separately where applicable.

### Operational gates

- monitoring and structured logs;
- dependency/health visibility;
- incident and recovery procedures;
- last-known-good preservation where appropriate;
- controlled methodology/schema releases;
- rollback/compatibility plan for breaking changes.

### Commercial gates

- real design-partner validation;
- clear country/corridor customer workflow;
- verified commercially eligible source path;
- customer-facing terms and permitted-use boundaries;
- pilot pricing and support expectations;
- service/availability commitments documented only when they can actually be supported.

Passing these gates must be based on deployed and verified capability, not roadmap intent or documentation alone.

## Current evidence boundary

The current Risk Gate foundation has passed repository-level tests and real authenticated Private Pilot proof flows for country and directional corridor requests, including immutable audit persistence.

That evidence is meaningful engineering proof, but it is **not** equivalent to:

- independent third-party security certification;
- independent methodology validation;
- production SLA evidence;
- full commercial source-rights clearance;
- full route/logistics modelling;
- customer adoption or willingness-to-pay proof.

Those remain explicit commercialization gates rather than implied claims.
