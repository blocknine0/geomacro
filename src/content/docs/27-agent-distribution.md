# 27. Agent Distribution

Geomacro's machine-delivery foundation is the authenticated Risk API / Risk Gate interface with provider adapters for controlled pay-per-call delivery.

The product remains transport-agnostic: intelligence and Risk Object contracts do not depend on one marketplace, wallet or payment rail.

## Current

- authenticated country/corridor Risk Gate API foundation
- signed machine-readable Risk Objects
- versioned verification and audit contracts
- no-charge deliverability check before a payment challenge
- provider adapters for x402-compatible agent access
- durable delivery-ledger, idempotency and reconciliation controls
- `execution_authorized = false` preserved in machine responses

## x402 implementation status

The x402 path is implemented behind runtime-controlled commercial gates. Static documentation never determines whether a production payment rail is active.

The authoritative state comes from:

- the live Geomacro health contract;
- the exact HTTP payment challenge for the requested resource;
- provider-specific runtime support and authorization gates.

A request is chargeable only when the requested intelligence is deliverable, sufficiently fresh and commercially eligible. Successful payment unlocks only the bounded requested resource and does not authorize a downstream financial action.

## Distribution options

Geomacro can support distribution through:

- formal API specifications and SDK generation
- webhooks
- MCP-compatible adapters
- agent-to-agent interfaces
- marketplace integrations
- additional payment/access rails where justified

A payment or access mechanism must never bypass source-rights restrictions, entitlement scope or the core risk methodology.

## Commercial boundary

Price, accepted network, asset and settlement terms are disclosed by the live provider challenge/plan for the requested resource. Static examples are not authoritative pricing.

Provider availability can differ by runtime state. An integration being present in the repository is not sufficient evidence that real-funds settlement is active.
