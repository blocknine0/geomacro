# Geomacro Structured Data Entitlement Registry

Status: canonical commercial access policy for launch

This registry is the single source of truth for what a public website visitor, paid human customer, API client, autonomous machine or institutional integration is allowed to receive.

Payment providers do not decide which Geomacro data is returned. They only create or renew a canonical Geomacro entitlement. The intelligence delivery layer resolves that entitlement against this registry and returns only the permitted product envelope.

## Canonical flow

`identity -> payment/subscription/manual grant -> canonical entitlement -> registry policy -> usage charge -> governed structured data -> audit receipt`

Public website access is deliberately separate from commercial API access.

## Permanent safety rules

- no free API access;
- free users receive the public website/dashboard experience only;
- free users do not receive Risk Gate, signed Risk Objects, structured API responses or structured data downloads;
- payment-provider metadata cannot widen a Geomacro data entitlement;
- no commercial tier receives raw private warehouse access by default;
- missing data never becomes zero risk;
- structural evidence is not silently weighted into GRI v1.2;
- Risk Gate never authorizes execution;
- a lower-value SKU cannot request a higher-value capability by changing request fields;
- retries may be idempotent, but a mutated retry must fail closed;
- output limits are server-enforced from the registry, never trusted from client input;
- commercial source eligibility remains fail-closed and payment cannot bypass licensing restrictions.

## Public / Free layer

Purpose: public trust, discovery and product evaluation through `geomacro.live`.

Public website/dashboard may show:
- selected public geopolitical and macro intelligence;
- event pages and public evidence summaries;
- current public GRI visibility and methodology context;
- selected public country/corridor views where already approved for the website;
- public research and documentation.

Not included:
- API credentials;
- commercial structured JSON delivery;
- structured-data download/export;
- signed Risk Objects;
- Risk Gate;
- paid historical/attribution depth;
- commercial machine access.

The free layer has no commercial API credit allocation because it has no commercial API entitlement.

## Founding Analyst Pilot

Purpose: paid professional analyst and research workflows.

Commercial access may include:
- deeper intelligence and analytics;
- alerts and monitoring within the agreed pilot scope;
- historical context and change attribution where commercially eligible;
- premium Ask Geomacro access;
- governed country structural profile;
- governed corridor structural profile;
- agreed structured exports only where the signed pilot scope permits them.

Default launch allocation: 5,000 credits per 30 days, subject to the signed pilot scope.

Risk Gate and signed Risk Object access are not assumed at this tier unless the contracted offer explicitly maps the customer to the API + Risk Gate entitlement.

## Founding API + Risk Gate Pilot

Purpose: paid application, developer and autonomous-agent integration.

Includes the governed paid intelligence capabilities plus:
- authenticated commercial API access;
- country and corridor structured digests/profiles;
- signed Risk Objects;
- Risk Gate bundles;
- machine-readable delivery;
- controlled structured API/export access;
- payment-to-entitlement fulfillment through any approved provider adapter.

`execution_authorized` is permanently false. Geomacro supplies decision context; the customer retains policy and execution control.

Default launch allocation: 20,000 credits per 30 days, subject to the signed pilot scope.

## Institutional

Purpose: contracted enterprise/institutional deployment.

Includes API + Risk Gate capabilities with contracted:
- countries and corridors;
- historical depth;
- monitoring cadence;
- usage volume;
- structured exports;
- workspaces/integrations where implemented;
- enterprise controls and support terms where contracted.

Starting allocation reference: 100,000 credits per month, subject to contract.

Raw/private warehouse delivery remains false unless a future separately reviewed product contract explicitly changes that global policy and source-rights rules allow it.

## Agent commerce / one-shot machine purchase

Autonomous agents may purchase a bounded machine service through an approved payment adapter such as GOAT/x402 or another future rail.

The payment adapter resolves to a canonical Geomacro offer. It never decides the response schema or capability set.

Initial machine service example:

`machine_risk_preflight -> API + Risk Gate entitlement envelope -> signed Risk Object + Risk Gate decision -> execution_authorized=false`

A one-shot payment grants only the named bounded capability/fulfillment. It does not silently grant an entire monthly commercial tier.

## Canonical commercial product IDs

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

Every payment adapter must resolve provider-specific payment or product data into a canonical Geomacro offer or entitlement. Supported architecture includes fiat/subscription billing, direct invoice/manual institutional grants, USDC rails and GOAT/x402 machine payments.

Adapters may submit verified payment evidence, amount, currency, provider order ID and settlement metadata. They must not submit arbitrary capability lists, history depth, observation limits or response fields that override this registry.

## Versioning

Registry changes are versioned in code. Every commercial request and usage record must remain attributable to the active registry and credit-contract version used when the request was fulfilled.

Any future tier, SKU, price or structured-data product must be added to the canonical registry and regression-tested before a payment adapter can sell or fulfill it.
