# 27. Agent Distribution

Geomacro's machine-delivery foundation uses the same governed intelligence system as the public product. Agent and API access may change authentication, entitlement, payment and response shaping, but it does not create a second dataset or risk engine.

## Current commercial architecture

- authenticated country and directional-corridor intelligence
- signed machine-readable Risk Objects
- versioned verification and audit contracts
- no-charge deliverability checks before payment
- x402 production endpoints that remain fail-closed until production activation
- `execution_authorized = false` preserved in machine responses

## x402 production boundary

The production commercial contract is availability-first:

1. confirm the requested product is currently deliverable;
2. confirm freshness and commercial source eligibility;
3. issue a payment challenge only when a chargeable result can be produced;
4. bind payment proof to the exact request;
5. re-check deliverability before settlement;
6. deliver the bounded derived product;
7. reconcile payment and delivery under idempotent audit records.

Unavailable, stale, commercially ineligible or unverifiable required coverage is not chargeable.

The live HTTP payment challenge is the authority for network, asset, amount and recipient. Static documentation does not authorize real-money settlement.

## Distribution options

Supported or planned distribution may include:

- OpenAPI and SDK-based integration
- webhooks
- MCP-compatible adapters
- agent-to-agent interfaces
- marketplace integrations
- additional production payment/access rails where appropriate

A payment or access mechanism must never bypass source-rights restrictions or become part of the core risk calculation methodology.
