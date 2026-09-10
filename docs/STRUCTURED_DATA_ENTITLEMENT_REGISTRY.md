# Geomacro Structured Data Entitlement Registry

Status: canonical commercial access policy design for launch

This registry is the single source of truth for what structured intelligence a human, application, API client or autonomous machine is allowed to receive after access is resolved.

Payment providers do not decide which Geomacro data is returned. They only create or renew a canonical Geomacro entitlement. The intelligence delivery layer resolves that entitlement against the registry and returns only the permitted product envelope.

## Canonical flow

`identity -> payment/subscription/manual grant -> canonical entitlement -> registry policy -> usage charge -> governed structured data -> audit receipt`

The same registry applies to free users, paid human users, API clients, autonomous agents and institutional integrations.

## Permanent safety rules

- no tier receives raw private warehouse access;
- missing data never becomes zero risk;
- structural evidence is not silently weighted into GRI v1.2;
- Risk Gate never authorizes execution;
- payment-provider metadata cannot widen a data entitlement;
- a lower-value SKU cannot request a higher-value capability by changing request fields;
- retries may be idempotent, but a mutated retry must fail closed;
- output limits are server-enforced from the registry, not trusted from client input.

## Launch tiers

### Free Explorer

Purpose: public trust, discovery and product evaluation.

Included structured products:
- grounded intelligence query;
- current verified GRI read;
- country structural digest;
- corridor structural digest.

Limits:
- latest/current summary use;
- one subject per request;
- maximum 3 structural observations per response;
- maximum 5 evidence references where applicable;
- no signed Risk Object;
- no Risk Gate bundle;
- no bulk export.

Default usage allocation: 500 credits per 30 days.

### Founding Analyst Pilot

Purpose: professional analyst and research workflow.

Includes Free capabilities plus:
- governed country structural profile;
- governed corridor structural profile;
- historical structured context where commercially eligible.

Limits:
- maximum 12 structural observations per profile response;
- agreed structured exports only;
- no signed Risk Object;
- no Risk Gate bundle.

Default allocation: 5,000 credits per 30 days.

### Founding API + Risk Gate Pilot

Purpose: application and agent integration.

Includes Analyst capabilities plus:
- signed Risk Object;
- Risk Gate bundle;
- machine-readable API delivery;
- controlled structured API/export access.

`execution_authorized` is permanently false.

Default allocation: 20,000 credits per 30 days.

### Institutional

Purpose: contracted enterprise/institutional deployment.

Includes API + Risk Gate capabilities with contracted countries, corridors, history, cadence, volume and structured exports.

Raw/private warehouse delivery remains false even for Institutional unless a future separately reviewed product contract explicitly changes that global policy.

Starting allocation reference: 100,000 credits per month, subject to contract.

## Canonical product IDs

- `intelligence_query`
- `gri_read`
- `structural_country_digest`
- `structural_corridor_digest`
- `structural_country_profile`
- `structural_corridor_profile`
- `signed_risk_object`
- `risk_gate_bundle`

Each product ID has one server-owned delivery envelope defining subject support, credit cost, observation/evidence limits, history mode, signing, Risk Gate availability, export mode and safety boundaries.

## Payment mapping

Every payment adapter must resolve its provider-specific payment or product into a canonical Geomacro commercial offer or entitlement. Examples include fiat subscription billing, direct invoice/manual institutional grants, USDC rails and GOAT/x402 machine payments.

Adapters may provide payment evidence, amount, currency, provider order ID and settlement metadata. They must not provide arbitrary capability lists or response limits that override this registry.

## Versioning

Registry changes are versioned in code. A commercial request and usage record should remain attributable to the active registry/credit contract version used when the request was fulfilled.

Any future tier, SKU or data product must be added to the canonical registry and regression-tested before a payment adapter can sell or fulfill it.
