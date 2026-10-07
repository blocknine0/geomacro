# Geomacro Canonical Delivery Architecture

Status: canonical commercial architecture contract.

## Core invariant

Geomacro has **one governed intelligence foundation** and multiple product and delivery surfaces.

Real-world evidence is admitted, normalized, classified and retained with provenance in the canonical intelligence layer. Public Risk Indices, Ask Geomacro, country/corridor Risk Objects, Risk Gate, authenticated commercial APIs and agent/x402 delivery all derive from that governed foundation rather than maintaining conflicting copies of risk truth.

Different products may apply documented admission, scoring, subject, entitlement, response-shaping or policy rules. That is a different use of the **same underlying data truth**, not permission to create a second source of truth.

A payment, authentication or transport adapter is **not a separate risk engine**. There is no API-only, pay-per-call-only or x402-only risk database.

## Canonical current product architecture

```text
Real-world evidence and data
        -> Normalize, classify and preserve provenance
        -> Structured intelligence state
             +-- Separate Risk Indices - Live
             +-- Ask Geomacro - Live
             +-- Country Risk Object - Private Pilot --+
             +-- Corridor Risk Object - Private Pilot -+-> Risk Gate - Private Pilot
             +-- Commercial API / agent delivery - Production Gated

Risk Gate - Private Pilot
        -> Customer identity + permissions + policy
        -> Customer-controlled action
```

The separate public Risk Indices expose geopolitical, macroeconomic and critical-mineral risk independently while preserving versioned `gri-v1.2.0` methodology and `gri-proof-v1.2.0` proof lineage. Historical combined-GRI snapshots remain versioned audit records rather than a second current product.

The customer owns identity, permissions and policy enforcement. Geomacro may evaluate bounded caller-supplied context, but it does not authorize or submit a downstream action. The external boundary remains `execution_authorized=false`.

Event-specific Risk Objects are a broader product direction only. Current Private Pilot scope is country and directional corridor risk unless a separately implemented and verified contract expands it.

## Canonical surface classification

| Surface | Role | Current status |
| --- | --- | --- |
| `/intelligence` and event pages | Public structured intelligence | LIVE |
| `/global-risk`, `/risk-indices` | Separate risk-domain indices | LIVE |
| `/ask-geomacro` | Grounded query surface | LIVE |
| Country Risk Objects | Signed machine context | PRIVATE PILOT |
| Directional corridor Risk Objects | Signed endpoint-composed machine context | PRIVATE PILOT |
| `/risk-gate` and Risk Gate services | Non-authorizing decision context | PRIVATE PILOT |
| `/data-api`, commercial APIs, A2A | Entitled machine delivery | PRIVATE PILOT / PRODUCTION GATED |
| x402 provider adapters | Payment transport around canonical delivery | PRODUCTION GATED |
| `/institutional` | Buyer/workflow presentation | Commercial |
| `/research`, `/docs`, `/about` | Evidence, methodology and trust | LIVE reference |

Retired experimental routes are not product surfaces. They redirect to current commercial pages or fail closed and must not become alternate delivery paths.

## Delivery architecture

```text
Real-world evidence and data
        -> evidence admission + commercial-use governance
        -> normalize, classify and preserve provenance
        -> shared structured intelligence state
             +-- separate public Risk Indices
             +-- versioned GRI v1.2 proof lineage
             +-- Ask Geomacro
             +-- country Risk Object
             +-- directional corridor Risk Object
             +-- governed structural context

shared intelligence + canonical derived services
        -> browser/public presentation
        -> authenticated commercial API
        -> A2A / agent delivery
        -> x402 production payment adapter
```

The delivery branch may change authentication, entitlement, rate limits, payment, response projection, audit metadata and transport. It must not change the underlying evidence merely because a different delivery rail is used.

## Commercial pay-per-call invariant

Pay-per-call is settlement around canonical intelligence, not a separate intelligence implementation.

A chargeable request follows:

```text
request
  -> capability + entitlement check
  -> freshness + commercial-eligibility check
  -> payment challenge only if deliverable
  -> payment proof binding
  -> final deliverability recheck
  -> canonical derived product projection
  -> settlement
  -> idempotent delivery / reconciliation
```

Unavailable, stale, commercially ineligible or unverifiable required coverage is not chargeable.

## Product boundaries

- Customer-facing structured output is derived Geomacro intelligence, not raw upstream payload redistribution.
- Risk Gate remains advisory and non-authorizing.
- Payment success does not authorize a customer action.
- Missing data does not become zero risk.
- Historical or compatibility code does not create a public product.
- Production payment activation requires live acceptance evidence and explicit authorization.
