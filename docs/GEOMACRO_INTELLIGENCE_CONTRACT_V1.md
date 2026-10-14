# Geomacro Intelligence Contract v1

## Product

The canonical commercial intelligence product is:

`geomacro_adaptive_risk_intelligence_v1`

The stable public response schema remains:

`geomacro.adaptive-intelligence-response.v1`

The new product contract version is:

`geomacro.intelligence-contract.v1`

The contract is shared by human query surfaces and machine delivery. x402 is only the payment boundary; it does not define the intelligence calculation.

## What a paid call returns

A current question returns a concise deterministic answer plus the structured state used to support it.

### 1. Direct answer

- `answer.status`
- `answer.headline`
- `answer.what_changed`
- `answer.why_it_matters`

The answer is derived from stored Geomacro intelligence. It is not a generative web-search summary.

### 2. Current state

Each requested country or directional corridor receives a versioned state:

- current risk score and label;
- previous published score and delta when available;
- direction;
- confidence;
- top attributed drivers;
- structural evidence summary;
- current live-development signal;
- canonical structural developments;
- `state_version`.

A state version is stable while its governed inputs remain unchanged. A material input or event-state change creates a new state version.

### 3. Structural context

Historical structural observations are returned in bounded form:

- dimension;
- country/corridor relationship;
- metric and value;
- observation/published timestamps;
- freshness;
- event/signal classification.

Commercial responses do **not** expose:

- source URLs;
- source names or publishers;
- raw article text;
- internal provenance blobs;
- internal source identifiers.

## Current developments

Many upstream reports can describe the same real-world development. Geomacro therefore uses a canonical event identity:

`story_key`

The commercial output does not expose that internal identity. It exposes:

- `event_id`;
- `event_version`;
- event type;
- structural families;
- affected countries;
- materiality;
- confidence;
- direction;
- first/last seen timestamps;
- evidence count;
- corroboration count;
- structure/classification versions.

A material update advances the same canonical development instead of creating a second copy of the event.

This is the required invariant:

`10 reports about one event != 10 commercial events`

## Human query behavior

Current natural-language requests without an explicit historical `as_of` are automatically bound to:

- the current verified Risk Object;
- current structured developments;
- the requested structural modules.

Historical requests remain explicit and are not silently mixed with current live developments.

## Commercial source boundary

Commercial machine and human responses contain derived Geomacro intelligence only. They do not expose upstream source URLs, publisher/provider names, internal source IDs, source record IDs, source families, raw provider payloads, raw article text or internal provenance blobs. Those remain server-side for governance, reproducibility and commercial-use enforcement.

A source may be added to the internal acquisition mesh without changing the customer contract. New sources must enter through the same normalized evidence-fragment and commercial-eligibility gates before their derived intelligence becomes chargeable.

## Machine response

The canonical machine resource remains:

`POST /api/v1/intelligence/query`

The previous `POST /api/x402/intelligence` route is retained only as a compatibility alias during migration. It shares the same handler and cannot become a second intelligence truth.

The response is JSON and includes:

`query_plan_hash`

`delivered_product_hash`

`current_state[*].state_version`

These identifiers allow a machine to persist the exact Geomacro state it last consumed and later determine whether the state has changed.

## Founder-locked capability-based x402 pricing (supersedes legacy pilot)

Canonical source: `src/lib/capability-pricing-catalog.ts` (`geomacro.capability-usdc.v1`).
Exact prices (USDC, six-decimal precision):

| Capability ID | Approved variant and exact price |
| --- | --- |
| `gri_read` | verified cached 0.005; verified change attribution 0.01 |
| `structural_country_digest` | standard 0.02 |
| `structural_corridor_digest` | standard 0.05 |
| `structural_country_profile` | standard 0.03 |
| `structural_corridor_profile` | standard 0.08 |
| `intelligence_query` | focused 0.05; standard 0.10; complex multi-source 0.15 |
| `signed_risk_object` | existing valid signed 0.05; newly qualified signed 0.10 |
| `risk_gate_bundle` | existing-proof preflight 0.10; standard 0.15; complex multi-source 0.25 |

The Risk Gate bundle includes its signed Risk Object; never charge it again.
Capability credits are independent usage units and cannot silently convert into USDC.

**Pay only for successfully prepared, verified and deliverable intelligence. No mandatory subscription.**

The public catalog is free. A buyer receives an exact capability/variant/network/asset/recipient/amount/expiry quotation **only after live availability, rights, signing and delivery prerequisites** are verified. Unavailable, stale, unverified or out-of-scope requests fail without payment. A tier change needs an explicit new buyer authorization. Historical technical/testnet references to 0.05 USDC per call and the former first-20,000 target are not the public launch schedule, are not automatically repriced and do not create credits or funding obligations. The first 0.05 USDC actual mainnet purchase remains a separate owner-authorized launch canary.

## Product boundary

Geomacro sells derived structural intelligence, not unrestricted copies of third-party raw information.

Internal source governance, licensing checks, corroboration and provenance remain part of the private evidence chain. The commercial answer is the derived Geomacro state.

## Core product loop

```text
Real-world information
        ↓
Normalize + deduplicate
        ↓
Canonical event state
        ↓
Historical structural context
        ↓
Risk / attribution / confidence
        ↓
Geomacro Intelligence State
        ↓
Human answer + machine JSON
        ↓
Versioned state
        ↓
Return when state changes
```

The product goal is not to make users return for more news. The goal is to make Geomacro the continuously updated structural-risk state they query when the world changes.
