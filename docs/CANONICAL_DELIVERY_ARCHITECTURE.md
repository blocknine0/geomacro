# Geomacro Canonical Delivery Architecture

Status: canonical architecture contract.

## Core invariant

Geomacro has **one governed intelligence foundation** and multiple product and delivery surfaces.

Real-world evidence is admitted, normalized, classified and retained with provenance in the canonical intelligence/data layer. GRI, Ask Geomacro, country/corridor Risk Objects, Risk Gate, authenticated APIs, Testnet pay-per-call delivery and agent/x402 technical-proof surfaces must derive from that governed foundation rather than maintaining conflicting copies of risk truth.

Different products may apply their own documented admission, scoring, subject, entitlement, response-shaping or policy rules. That is a different **use of the same underlying data truth**, not permission to create a second source of truth.

A payment, authentication or transport adapter is **not a separate risk engine**.

## Canonical flow

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

country/corridor Risk Object
        -> Risk Gate
        -> customer identity + permissions + customer policy
        -> recommendation / decision context
        -> customer-controlled action

shared structured intelligence + canonical derived services
        -> browser/public presentation
        -> authenticated commercial API
        -> Testnet pay-per-call API
        -> agent delivery
        -> Circle/x402 technical proof
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

Product-specific rules remain explicit. GRI scoring rules do not become Risk Gate policy rules, and Risk Gate policy does not rewrite the GRI. Shared evidence and provenance do not mean all products have identical calculation semantics.

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
| Risk Gate | customer policy/action context | canonical country/corridor Risk Object and Risk Gate evaluation |
| Circle/x402 technical proof | HTTP 402/payment rail and settlement telemetry | same Risk Gate/structural/GRI service layer used by the technical demo |
| Prediction-market / Arc proof | application mechanics and onchain state | intelligence remains an input/application layer, not a new core risk truth |

## Permanent boundaries

1. There is no API-only, pay-per-call-only or x402-only risk database.
2. Delivery adapters may not re-compute an alternative GRI or silently synthesize missing risk data.
3. Commercial delivery may be narrower than internal/public research when source rights require it; excluded data must be excluded explicitly and fail closed rather than replaced with invented values.
4. Country and directional corridor are the current Private Pilot Risk Object/Risk Gate scopes unless a separately implemented and verified contract expands them.
5. `execution_authorized=false` is invariant for current external Risk Gate delivery.
6. Customer identity, permissions, policy, funds and final execution remain outside the Geomacro risk calculation.
7. Arc, Circle, x402, USDC, CCTP, Bridge & Swap and prediction markets are delivery/application/technical-proof layers, not independent risk engines.

## Regression requirement

Repository tests must fail if a machine-delivery path stops using the canonical Ask, GRI, structural-context, Risk Object or Risk Gate services, or if pay-per-call/x402 is changed into an alternate risk-calculation path.

This contract is the central reference when adding a new API, payment rail, agent protocol or product surface: **reuse canonical intelligence first; add only the access, transport, policy or settlement adapter required by that surface.**
