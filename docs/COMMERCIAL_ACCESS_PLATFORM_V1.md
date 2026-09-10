# Geomacro Commercial Access Platform v1

Status: implementation contract for commercial launch.

## Objective

Build one Geomacro-owned commercial access layer for free users, professional users, API clients, autonomous agents and institutional customers from the same governed intelligence core.

GOAT Flow/x402 is one machine-payment adapter. It is not the product identity and must not become a hard dependency for access, entitlement or intelligence delivery.

## Launch tiers

- Free Explorer: 500 credits / 30 days, bounded public intelligence and limited governed structured digests.
- Founding Analyst Pilot: 5,000 credits / 30 days, deeper governed country/corridor profiles and agreed historical context.
- Founding API + Risk Gate Pilot: 20,000 credits / 30 days, authenticated API access, signed Risk Objects and Risk Gate decision context.
- Institutional: starting 100,000-credit monthly pool, then contracted scope and volume.

Raw/private warehouse access remains prohibited by default for every tier. Missing evidence remains explicit and is never converted to zero risk. Structural evidence remains outside GRI v1.2 scoring unless a separately versioned methodology changes that boundary.

## Shared request lifecycle

Every commercial request follows the same provider-agnostic sequence:

1. authenticate or identify the principal;
2. resolve server-side tier and entitlement;
3. validate capability and scope;
4. consume usage idempotently;
5. execute the governed intelligence capability;
6. return only the entitled structured response;
7. persist request, usage, latency and audit identifiers;
8. where payment is required, reconcile invoice/payment to entitlement before delivery.

A payment provider never decides what data the customer may receive. Payment can create or extend an entitlement. Geomacro controls product access.

## Commercial capabilities

Launch capabilities are versioned in `src/lib/commercial-access-contract.ts`:

- `intelligence_query`
- `gri_read`
- `structural_country_digest`
- `structural_corridor_digest`
- `structural_country_profile`
- `structural_corridor_profile`
- `signed_risk_object`
- `risk_gate_bundle`

Credits are product-usage units, not money, currency, tokens or withdrawable stored value.

## API direction

Stable requests use a caller-generated idempotency key and a capability-specific subject. Example:

```json
{
  "request_id": "customer-request-0001",
  "capability": "structural_corridor_profile",
  "subject": {
    "type": "corridor",
    "origin_country_iso3": "USA",
    "destination_country_iso3": "CHN"
  }
}
```

Successful responses keep entitlement metadata separate from intelligence data:

```json
{
  "ok": true,
  "request_id": "customer-request-0001",
  "entitlement": {
    "tier": "api_pilot",
    "capability": "structural_corridor_profile",
    "credit_cost": 12,
    "credits_remaining": 19988
  },
  "data": {},
  "boundaries": {
    "raw_data_included": false,
    "execution_authorized": false
  }
}
```

## Payment adapters

The intelligence API remains independent of the payment provider. Planned adapters include regulated INR collection, international USD/card/bank collection, approved production stablecoin/crypto rails, GOAT Flow/x402 for autonomous payments, and negotiated institutional invoice settlement.

GOAT Testnet3 and Arc Testnet remain technical/partner proof only and never count as commercial revenue.

## Durable commercial records

Current `commercial_credit_accounts` and `commercial_credit_usage` are the usage-accounting foundation. Launch also requires server-only durable records for principals, hashed API credentials, entitlement grants, subscriptions/contracts, invoices/orders, provider payments/refunds/disputes, request usage/latency, reconciliation and security/audit events.

## Non-negotiable invariants

- no raw API key storage;
- no provider secret in browser code;
- idempotent request charging and no double charge on retry;
- no fulfillment from unverified payment state;
- no entitlement escalation from client-supplied tier fields;
- unknown capabilities/payment methods/chains/assets fail closed;
- testnet payments never count as commercial revenue;
- signed Risk Object verification remains provider-independent;
- Risk Gate remains decision context and preserves `execution_authorized=false`.

## Implementation phases

Phase 1 builds the provider-agnostic access core: general commercial principals/API keys, tier/capability authorization, credit provisioning/consumption, stable response envelope, observability and compatibility with existing Risk Gate clients.

Phase 2 exposes real structured country/corridor APIs, signed Risk Objects and Risk Gate bundles with free-versus-paid boundary tests and developer quickstart.

Phase 3 adds invoice/order abstraction, verified payment-to-entitlement grants, refund/dispute state and production payment adapters including GOAT x402 into the same entitlement layer.

Phase 4 is the launch gate: security/abuse audit, stress/resilience tests, reconciliation tests, observability, emergency-disable controls and legal/accounting/provider onboarding checks.

## First milestone

An external authenticated client can consume a real governed Geomacro structured risk capability, usage is charged exactly once against the correct tier, only entitled structured data is returned, and stable request/audit identifiers are produced for human or machine integration.
