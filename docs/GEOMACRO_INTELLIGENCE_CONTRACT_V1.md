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

## Machine response

The canonical machine resource remains:

`POST /api/x402/intelligence`

The response is JSON and includes:

`query_plan_hash`

`delivered_product_hash`

`current_state[*].state_version`

These identifiers allow a machine to persist the exact Geomacro state it last consumed and later determine whether the state has changed.

## Pricing phase

Early-adoption price:

**0.05 USDC per successful paid intelligence delivery for the first 10,000 deliveries**

Initial launch target:

**10,000 successful paid deliveries**

This is a traction/adoption phase. The intended later reference price is **0.10 USDC** after adoption evidence supports the transition. The price transition is an operator-controlled commercial change, not an automatic assumption inside the intelligence calculation.

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
