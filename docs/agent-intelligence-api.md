# Geomacro Agent Intelligence API

Status: **FOUNDATION ONLY on the feature branch. Paid delivery is NOT LIVE until the official GOAT/x402 verifier is wired and a real settlement is verified.**

## Purpose

This is the canonical Geomacro intelligence service. It is transport-neutral so the same read model can later serve x402/GOAT, MCP, institutional B2B access, and API marketplaces. Arc/Circle markets remain a separate application layer.

The service reads stored `events` and the canonical published GRI snapshot. It does not call an LLM, search live news, invent probabilities, or calculate a private fallback index.

## Endpoints

### `GET /api/v1/agent/catalog`

Free discovery endpoint. It returns API/schema versions, the available capability, current availability, and payment model. The catalog does not claim x402 is live unless the server-side payment configuration is complete.

### `GET /api/v1/agent/events/:eventId/intelligence`

Returns the versioned machine-readable event intelligence DTO after entitlement checks.

A successful response contains:

- `apiVersion` and `schemaVersion`
- `capability`
- event identity, title, category, summary, narrative, stage, and timestamps
- severity, confidence, and delta, with unavailable values as `null`
- source provenance
- classification provider/model/version/prompt/hash metadata where stored
- canonical published GRI score, coverage, counts, methodology/proof identity, hashes, verification status, and as-of timestamp where verified

No probability is synthesized. GRI fields are `null` when the canonical published snapshot is unavailable or fails its existing verification contract.

## Errors

Errors use a stable envelope and never expose provider, database, stack-trace, header, or secret data:

```json
{
  "error": {
    "code": "INTELLIGENCE_NOT_FOUND",
    "message": "The requested intelligence record was not found."
  }
}
```

The endpoint uses `INVALID_REQUEST`, `INTELLIGENCE_NOT_FOUND`, `PAYMENT_REQUIRED`, `PAYMENT_INVALID`, `PAYMENT_SETTLEMENT_FAILED`, `PAYMENT_NOT_CONFIGURED`, `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`, and `INTERNAL_ERROR` as appropriate.

## Payment abstraction

Payment is separate from intelligence delivery. The route calls a payment/entitlement interface, and only then calls `getEventIntelligence(eventId)`. The default adapter is conservative: it never accepts a payment. An official x402 adapter can be inserted without changing the DTO or intelligence service.

Pricing is server-configured, never embedded in route logic:

- `AGENT_PAYMENT_ENABLED`
- `AGENT_PAYMENT_CAPABILITY`
- `AGENT_PAYMENT_AMOUNT` (smallest asset units, integer string)
- `AGENT_PAYMENT_ASSET`
- `AGENT_PAYMENT_NETWORK`
- `AGENT_PAYMENT_RAIL`
- `AGENT_PAYMENT_PAY_TO`
- `AGENT_X402_FACILITATOR_URL`

The intended validation price is approximately $0.01 equivalent, but no token, network, asset, address, facilitator, or credential is assumed by this code.

## x402 status

- **LIVE:** free catalog; canonical stored-intelligence response model; payment-required response boundary; durable telemetry schema; idempotency model; safe errors.
- **PLANNED:** official x402/GOAT verifier and settlement adapter, production payment configuration, and a real testnet payment verification.
- **Not claimed:** no mocked test is a real network payment, and compilation is not payment readiness.

## Telemetry and privacy

`agent_api_requests` links request, payment, and delivery outcomes. `agent_payments` stores settlement metadata needed for volume and transaction reporting. Indexes support DAU, unique external-agent, paid-request, repeat-agent, transaction, settlement-volume, and delivery-success/failure queries.

When `AGENT_IDENTITY_SECRET` is configured, the server stores a keyed HMAC identity derived from an explicit `x-agent-id` or a bounded user-agent/IP request signal. The raw signal is not stored and raw IP is never a permanent identity. If the secret is absent, identity is `null` rather than fabricated. Idempotency uses `Idempotency-Key` together with the keyed identity.

## Future transports

The stable capability identifier `event.intelligence.v1` and the transport-neutral DTO are intended to be reused by MCP tools, API keys/subscriptions, B2B credentials, and marketplaces. Those transports must implement their own authentication and entitlement adapter; none should duplicate or alter the intelligence logic.

## Real first paid request checklist

1. Select and document an official x402-compatible network, asset, scheme, and facilitator.
2. Add the official verifier/settlement adapter using the provider's current documentation.
3. Configure all server-only payment variables and `AGENT_IDENTITY_SECRET`.
4. Apply migration `011_agent_intelligence_commerce.sql` only through the GitHub-owned forward migration process.
5. Run a real testnet payment end to end and verify request, payment, and delivery linkage in telemetry.
6. Only then mark paid x402 delivery live in the catalog.

Expected infrastructure cost at this stage: **$0** beyond the existing hosting/database allocation. No paid rate limiter, analytics SaaS, Redis, inference provider, or new hosted service is required.
