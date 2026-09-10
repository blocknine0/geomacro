# Geomacro Commercial Access Platform v1

Status: implementation contract for commercial launch.

## Objective

Build one Geomacro-owned commercial access layer for professional users, API clients, autonomous agents and institutional customers from the same governed intelligence core, while keeping the Free Explorer as a public website/dashboard experience rather than a free API tier.

GOAT Flow/x402 is one machine-payment adapter. It is not the product identity and must not become a hard dependency for access, entitlement or intelligence delivery.

## Launch tiers

- Free Explorer: public website/dashboard only. No API credential, structured-data download, signed Risk Object or Risk Gate.
- Founding Analyst Pilot: 5,000 credits / 30 days, paid dashboard/research workflow, deeper governed country/corridor context, history and agreed exports. Default founding quote: USD 1,500 / 30 days.
- Founding API + Risk Gate Pilot: 20,000 credits / 30 days, authenticated API access, governed structured data, signed Risk Objects and Risk Gate decision context. Default founding quote: USD 2,500 / 30 days.
- Institutional: starting 100,000-credit monthly pool, then contracted scope and volume. Current annual discussion anchor starts around USD 24k-36k.

These are launch references and pilot anchors, not a claim that self-serve public billing is already generally available.

Raw/private warehouse access remains prohibited by default for every commercial tier. Missing evidence remains explicit and is never converted to zero risk. Structural evidence remains outside GRI v1.2 scoring unless a separately versioned methodology changes that boundary.

## Shared request lifecycle

Every commercial structured-data request follows the same provider-agnostic sequence:

1. authenticate or identify the commercial principal;
2. resolve verified payment/subscription/manual contract into a canonical entitlement;
3. resolve the entitlement through `STRUCTURED_DATA_ENTITLEMENT_REGISTRY`;
4. validate capability, subject and server-owned output limits;
5. consume usage idempotently;
6. execute the governed intelligence capability;
7. return only the entitled structured response;
8. persist request, usage, latency and audit identifiers;
9. reconcile payment/refund/dispute state independently of the intelligence calculation.

A payment provider never decides what data the customer may receive. Payment can create or extend a canonical entitlement. Geomacro controls product access.

## Commercial capabilities

Launch capabilities are versioned in `src/lib/commercial-access-contract.ts` and mapped through `src/lib/structured-data-entitlement-registry.ts`:

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

There is no free commercial API tier. Stable paid API requests use a caller-generated idempotency key and a capability-specific subject. Example:

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
    "registry_version": "structured-entitlements-v1.0.0",
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

Every adapter must map to one canonical Geomacro offer. Provider payloads cannot inject arbitrary capabilities, observation limits, history depth, signing rights or Risk Gate rights.

## Durable commercial records

Current `commercial_credit_accounts`, `commercial_credit_usage`, `commercial_principals`, `commercial_api_credentials` and `commercial_entitlement_grants` form the access/accounting foundation. Launch also requires durable records for subscriptions/contracts, invoices/orders, provider payments/refunds/disputes, request usage/latency, reconciliation and security/audit events.

## Non-negotiable invariants

- no free API access;
- no free structured-data download;
- no raw API key storage;
- no provider secret in browser code;
- idempotent request charging and no double charge on retry;
- no fulfillment from unverified payment state;
- no entitlement escalation from client-supplied tier fields;
- unknown capabilities/payment methods/chains/assets fail closed;
- testnet payments never count as commercial revenue;
- signed Risk Object verification remains provider-independent;
- Risk Gate remains decision context and preserves `execution_authorized=false`;
- source licensing/commercial eligibility cannot be bypassed by payment.

## Implementation phases

Phase 1 builds the provider-agnostic access core: commercial principals/API keys, tier/capability authorization, credit provisioning/consumption, stable response envelope, observability and compatibility with existing Risk Gate clients.

Phase 2 centralizes exact delivery policy in the Structured Data Entitlement Registry and exposes real paid structured country/corridor APIs, signed Risk Objects and Risk Gate bundles with paid-boundary tests and developer quickstart.

Phase 3 adds invoice/order abstraction, verified payment-to-entitlement grants, one-shot machine entitlements, refund/dispute state and production payment adapters including GOAT x402 into the same entitlement layer.

Phase 4 is the launch gate: security/abuse audit, stress/resilience tests, reconciliation tests, observability, emergency-disable controls and legal/accounting/provider onboarding checks.

## First milestone

An external authenticated paid client can consume a real governed Geomacro structured risk capability, usage is charged exactly once against the correct entitlement, only registry-authorized structured data is returned, and stable request/audit identifiers are produced for human or machine integration.
