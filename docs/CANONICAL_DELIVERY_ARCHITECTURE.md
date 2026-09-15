# Geomacro Canonical Delivery Architecture

Status: canonical architecture contract.

## Core invariant

Geomacro has **one governed intelligence foundation** and multiple product and delivery surfaces.

Real-world evidence is admitted, normalized, classified and retained with provenance in the canonical intelligence/data layer. GRI, Ask Geomacro, country/corridor Risk Objects, Risk Gate, authenticated APIs, Testnet pay-per-call delivery and agent/x402 technical-proof surfaces must derive from that governed foundation rather than maintaining conflicting copies of risk truth.

Different products may apply their own documented admission, scoring, subject, entitlement, response-shaping or policy rules. That is a different **use of the same underlying data truth**, not permission to create a second source of truth.

A payment, authentication or transport adapter is **not a separate risk engine**.

## Canonical current product architecture

This is the product-level architecture that every public surface, document and machine-delivery adapter must preserve:

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

The customer owns the identity, permissions and policy layer. Geomacro may evaluate a caller-supplied policy profile as part of a bounded Risk Gate response, but that does not transfer ownership or enforcement of customer policy to Geomacro. Geomacro does not authorize or submit the downstream action. The current external boundary is always `execution_authorized=false`.

Event-specific Risk Objects are a broader product direction only. The current Private Pilot contract is country and directional corridor Risk Objects plus Risk Gate unless a separately implemented and verified contract expands that scope.

## Delivery architecture

The same governed foundation can be delivered through different access and transport surfaces:

```text
Real-world evidence and data
        -> evidence admission + source/commercial-use governance
        -> normalize, classify and preserve provenance
        -> shared structured intelligence state
             +-- Global Risk Index
             +-- Ask Geomacro
             +-- country Risk Object
             +-- directional corridor Risk Object
             +-- governed structural context

shared structured intelligence + canonical derived services
        -> browser/public presentation
        -> authenticated commercial API
        -> Testnet pay-per-call API
        -> agent delivery
        -> Circle/x402 technical proof
        -> GOAT/Coinbase/A2A or other transport/payment adapters when implemented
```

The delivery branch may change authentication, entitlement, rate limits, payment, response projection, audit metadata and transport. It must not change the underlying evidence simply because a different delivery rail is used.

## What “same data” means

“Same data” means every surface resolves from the same governed evidence/provenance foundation and canonical service contracts for the relevant product. It does **not** mean every response is byte-for-byte identical.

Examples:

- the public GRI and machine `gri_read` use the canonical GRI read service;
- the website Ask Geomacro flow and machine `intelligence_query` use the same answer engine;
- structural country/corridor delivery resolves through the governed structural-context service;
- signed Risk Object delivery resolves from the canonical Risk Object store and verification path;
- Risk Gate delivery uses the canonical country/corridor Risk Gate services;
- a paid surface may redact restricted fields or enforce commercial source eligibility while still using the same governed foundation.

Product-specific rules remain explicit. GRI scoring rules do not become Risk Gate policy rules, and Risk Gate output does not rewrite the GRI. Shared evidence and provenance do not mean all products have identical calculation semantics.

## Customer-control boundary

The canonical sequence is:

```text
Country / directional corridor Risk Object
        -> Risk Gate - Private Pilot
        -> Customer identity + permissions + policy
        -> Customer-controlled action
```

The Risk Gate service can accept a caller-supplied policy profile to produce bounded decision context. That is an evaluation input, not Geomacro ownership of the customer's policy. The customer remains responsible for its identity, permissions, policy design, compliance obligations, funds and final execution.

Geomacro must not be described as:

- a wallet custodian;
- a customer transaction signer;
- the owner or enforcer of customer permissions;
- a replacement for customer compliance or sanctions screening;
- the final fiduciary or investment decision-maker.

## Pay-per-call contract

Testnet **pay-per-call** is an access and settlement model around canonical intelligence delivery.

The intended sequence is:

```text
request
 -> authenticate / resolve entitlement
 -> preflight requested capability against canonical services
 -> if eligible, return exact Testnet payment requirement
 -> verify and reconcile payment proof
 -> execute the canonical intelligence capability
 -> return governed response + payment/delivery audit metadata
```

Payment must never:

- create a parallel risk database;
- select a different score or Risk Object merely because the request is paid;
- bypass provenance, freshness, verification or commercial-source eligibility;
- authorize downstream financial execution;
- turn Testnet settlement into a production or revenue claim.

The current machine boundary remains `execution_authorized=false`.

## Delivery adapters

| Surface | What can differ | What must remain canonical |
| --- | --- | --- |
| Public website | UI, explanation depth, public redaction | stored intelligence, canonical GRI, evidence/provenance contracts |
| Ask Geomacro | query and presentation | canonical stored-intelligence answer engine |
| Authenticated API | entitlement, quotas, response limits | governed structural state and relevant canonical product service |
| Testnet pay-per-call | Testnet USDC quote, proof, credit accounting, audit | canonical capability runner and underlying intelligence |
| Risk Object | subject selection and compatible-object lookup | canonical signed object payload + cryptographic verification |
| Risk Gate | bounded caller context / optional supplied policy profile | canonical country/corridor Risk Object, non-authorizing Risk Gate evaluation and customer-owned downstream policy/execution |
| Circle/x402 technical proof | HTTP 402/payment rail and settlement telemetry | same Risk Gate/structural/GRI service layer used by the technical demo |
| GOAT/Coinbase/A2A adapters | provider protocol, transport, payment or task envelope | same canonical intelligence and non-authorizing Risk Gate boundary |
| Prediction-market / Arc proof | application mechanics and onchain state | intelligence remains an input/application layer, not a new core risk truth |

## Permanent boundaries

1. There is no API-only, pay-per-call-only or x402-only risk database.
2. Delivery adapters may not re-compute an alternative GRI or silently synthesize missing risk data.
3. Commercial delivery may be narrower than internal/public research when source rights require it; excluded data must be excluded explicitly and fail closed rather than replaced with invented values.
4. Country and directional corridor are the current Private Pilot Risk Object/Risk Gate scopes unless a separately implemented and verified contract expands them.
5. `execution_authorized=false` is invariant for current external Risk Gate delivery.
6. Customer identity, permissions, policy, funds and final execution remain customer-owned and outside Geomacro's authority.
7. Arc, Circle, x402, USDC, CCTP, Bridge & Swap and prediction markets are delivery/application/technical-proof layers, not independent risk engines.
8. Research and documentation explain evidence, methodology and proof; they must not become a separate source of risk truth.
9. Public Risk Intelligence, GRI and Ask Geomacro remain wallet-free by default. Wallet requirements belong only to explicit technical/execution surfaces.

## Regression requirement

Repository tests must fail if:

- a machine-delivery path stops using the canonical Ask, GRI, structural-context, Risk Object or Risk Gate services;
- pay-per-call/x402/A2A is changed into an alternate risk-calculation path;
- public positioning promotes prediction markets, Arc/Circle or settlement rails above the intelligence product;
- current Private Pilot copy expands Risk Objects/Risk Gate beyond country and directional corridor without a separately verified contract;
- a public surface implies that Geomacro owns customer identity, permissions, policy, funds or final execution;
- a public surface implies that Risk Gate can authorize execution.

This contract is the central reference when adding a new API, payment rail, agent protocol or product surface: **reuse canonical intelligence first; add only the access, transport, entitlement, policy-input or settlement adapter required by that surface while preserving the customer-control boundary.**
