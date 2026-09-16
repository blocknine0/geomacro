# Geomacro Canonical Delivery Architecture

Status: canonical architecture contract.

## Core invariant

Geomacro has **one governed intelligence foundation** and multiple product and delivery surfaces.

Real-world evidence is admitted, normalized, classified and retained with provenance in the canonical intelligence/data layer. Public Risk Indices, the audited GRI v1.2 lineage, Ask Geomacro, country/corridor Risk Objects, Risk Gate, authenticated APIs, Testnet pay-per-call delivery and agent/x402 technical-proof surfaces must derive from that governed foundation rather than maintaining conflicting copies of risk truth.

Different products may apply their own documented admission, scoring, subject, entitlement, response-shaping or policy rules. That is a different **use of the same underlying data truth**, not permission to create a second source of truth.

A payment, authentication or transport adapter is **not a separate risk engine**.

## Canonical current product architecture

This is the product-level architecture that every public surface, document and machine-delivery adapter must preserve:

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

The separate public Risk Indices are the current headline risk-score product. They expose geopolitical, macroeconomic and critical-mineral risk independently while preserving the audited `gri-v1.2.0` parent methodology and `gri-proof-v1.2.0` proof lineage. Historical combined-GRI snapshots remain versioned audit records rather than a second current product.

The customer owns the identity, permissions and policy layer. Geomacro may evaluate a caller-supplied policy profile as part of a bounded Risk Gate response, but that does not transfer ownership or enforcement of customer policy to Geomacro. Geomacro does not authorize or submit the downstream action. The current external boundary is always `execution_authorized=false`.

Event-specific Risk Objects are a broader product direction only. The current Private Pilot contract is country and directional corridor Risk Objects plus Risk Gate unless a separately implemented and verified contract expands that scope.

## Canonical surface classification

Every current user-facing or machine-facing surface must fit one of the roles below. A route may present or deliver a canonical product, but it must not silently become a new source of risk truth.

| Surface / route family | Architecture role | Current status / boundary |
| --- | --- | --- |
| `/intelligence` and event pages | Public presentation of the structured intelligence state | Live, wallet-free |
| `/global-risk` | Separate Geopolitical, Macroeconomic and Critical Minerals Risk Indices derived from the governed intelligence state | Live, wallet-free; audited GRI v1.2 parent lineage |
| `/ask-geomacro` | Grounded query surface over the governed intelligence state | Live, wallet-free |
| Country Risk Object delivery | Signed country-specific machine context | Private Pilot |
| Directional corridor Risk Object delivery | Signed endpoint-composed corridor machine context | Private Pilot; not full physical-route modelling |
| `/risk-gate` and canonical Risk Gate services | Non-authorizing pre-decision context over verified Risk Objects | Private Pilot; `execution_authorized=false` |
| `/data-api` and commercial API endpoints | Access, entitlement and delivery over canonical intelligence/services | Controlled commercial / pilot delivery; never a parallel risk engine |
| `/institutional` | Buyer/workflow presentation of the same intelligence and Private Pilot capabilities | No institutional-only risk truth |
| `/research`, `/docs`, `/about` | Methodology, evidence, trust and explanation | Reference surfaces; no independent risk engine |
| `/testnet-access` and Testnet pay-per-call | Testnet access/payment adapter around canonical capabilities | Testnet-only; non-revenue proof unless separately contracted otherwise |
| Agent, x402, GOAT, Coinbase and A2A adapters | Transport/payment/task envelopes around canonical capabilities | Must reuse canonical intelligence and preserve non-authorization |
| `/arena` | Prediction-market application/feedback layer | Permanent Arc Testnet technical proof; not production/mainnet product |
| `/onchain`, `/bridge-swap` | Arc/Circle programmable-finance implementation | Secondary technical proof |
| `/pipeline` | Technical visibility into data-processing architecture | Technical/reference surface, not a second intelligence state |

The primary commercial hierarchy therefore remains:

1. governed real-world evidence and provenance;
2. structured intelligence state;
3. live public intelligence, separate Risk Indices and Ask Geomacro;
4. Private Pilot country/corridor Risk Objects and Risk Gate;
5. customer-owned identity, permissions and policy;
6. customer-controlled action;
7. separate technical-proof/application rails where useful.

Data/API, institutional packaging, agent protocols and payment rails are **delivery or presentation layers around this hierarchy**. They do not insert a new risk engine between the structured intelligence state and the canonical products and are never a parallel risk engine.

## Delivery architecture

The same governed foundation can be delivered through different access and transport surfaces:

```text
Real-world evidence and data
        -> evidence admission + source/commercial-use governance
        -> normalize, classify and preserve provenance
        -> shared structured intelligence state
             +-- separate public Risk Indices
             +-- audited GRI v1.2 parent/proof lineage
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

- the current public Risk Indices and compatibility machine risk reads preserve the same audited GRI v1.2 evidence/proof lineage;
- the website Ask Geomacro flow and machine `intelligence_query` use the same answer engine;
- structural country/corridor delivery resolves through the governed structural-context service;
- signed Risk Object delivery resolves from the canonical Risk Object store and verification path;
- Risk Gate delivery uses the canonical country/corridor Risk Gate services;
- a paid surface may redact restricted fields or enforce commercial source eligibility while still using the same governed foundation.

Product-specific rules remain explicit. Audited GRI v1.2 scoring rules do not become Risk Gate policy rules, and Risk Gate output does not rewrite the public Risk Indices or historical GRI proof lineage. Shared evidence and provenance do not mean all products have identical calculation semantics.

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
| Public website | UI, explanation depth, public redaction | stored intelligence, current Risk Indices, audited GRI v1.2 lineage, evidence/provenance contracts |
| Ask Geomacro | query and presentation | canonical stored-intelligence answer engine |
| Authenticated API | entitlement, quotas, response limits | governed structural state and relevant canonical product service |
| Testnet pay-per-call | Testnet USDC quote, proof, credit accounting, audit | canonical capability runner and underlying intelligence |
| Risk Object | subject selection and compatible-object lookup | canonical signed object payload + cryptographic verification |
| Risk Gate | bounded caller context / optional supplied policy profile | canonical country/corridor Risk Object, non-authorizing Risk Gate evaluation and customer-owned downstream policy/execution |
| Circle/x402 technical proof | HTTP 402/payment rail and settlement telemetry | same Risk Gate/structural/risk-context service layer used by the technical demo |
| GOAT/Coinbase/A2A adapters | provider protocol, transport, payment or task envelope | same canonical intelligence and non-authorizing Risk Gate boundary |
| Prediction-market / Arc proof | application mechanics and onchain state | intelligence remains an input/application layer, not a new core risk truth |

## Permanent boundaries

1. There is no API-only, pay-per-call-only or x402-only risk database.
2. Delivery adapters may not re-compute an alternative Risk Index/GRI or silently synthesize missing risk data.
3. Commercial delivery may be narrower than internal/public research when source rights require it; excluded data must be excluded explicitly and fail closed rather than replaced with invented values.
4. Country and directional corridor are the current Private Pilot Risk Object/Risk Gate scopes unless a separately implemented and verified contract expands them.
5. `execution_authorized=false` is invariant for current external Risk Gate delivery.
6. Customer identity, permissions, policy, funds and final execution remain customer-owned and outside Geomacro's authority.
7. Arc, Circle, x402, USDC, CCTP, Bridge & Swap and prediction markets are delivery/application/technical-proof layers, not independent risk engines.
8. Research and documentation explain evidence, methodology and proof; they must not become a separate source of risk truth.
9. Public Risk Intelligence, Risk Indices and Ask Geomacro remain wallet-free by default. Wallet requirements belong only to explicit technical/execution surfaces.

## Regression requirement

Repository tests must fail if:

- a machine-delivery path stops using the canonical Ask, risk-context, structural-context, Risk Object or Risk Gate services;
- pay-per-call/x402/A2A is changed into an alternate risk-calculation path;
- public positioning promotes prediction markets, Arc/Circle or settlement rails above the intelligence product;
- current Private Pilot copy expands Risk Objects/Risk Gate beyond country and directional corridor without a separately verified contract;
- a public surface implies that Geomacro owns customer identity, permissions, policy, funds or final execution;
- a public surface implies that Risk Gate can authorize execution;
- an institutional, API, agent or payment surface creates or implies a separate risk truth;
- a technical-proof route loses its Testnet/technical-proof boundary and begins presenting itself as the primary commercial product.

This contract is the central reference when adding a new API, payment rail, agent protocol or product surface: **reuse canonical intelligence first; add only the access, transport, entitlement, policy-input or settlement adapter required by that surface while preserving the customer-control boundary.**
