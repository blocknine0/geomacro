# Geomacro Signed Webhook Delivery Contract

Version: `geomacro-webhook-1.0`

## Current status

Geomacro now has the **signed structured event outbox foundation** for Risk Gate decisions.

Current implementation can:

- build a bounded machine-readable `risk_gate.decision.created` event;
- preserve `execution_authorized=false` inside the signed event;
- sign the canonical event with a **dedicated Ed25519 webhook key**;
- self-verify the signature before persistence;
- persist one immutable event per Risk Gate `audit_id`;
- reconcile a missing event during an exact idempotent Risk Gate retry;
- fail closed instead of returning a successful Risk Gate response while the enabled outbox is unavailable.

Current implementation **does not send outbound HTTP webhooks yet**. No customer callback URL is fetched by this phase.

That boundary is intentional. Arbitrary outbound callback delivery is not enabled until the egress/SSRF controls in this document are implemented and tested.

## Product and data boundary

Webhook delivery is part of Geomacro's verified intelligence and decision infrastructure. It is not an execution rail.

Every webhook event is built only from already-structured Risk Gate response fields. The webhook event does **not** contain:

- raw/private warehouse rows;
- original customer request payloads;
- customer `action_context` metadata;
- source-file bodies or raw source artifacts;
- wallet private keys, seed phrases or signing authority;
- transaction submission instructions.

The permanent execution boundary remains:

```json
{
  "execution_authorized": false
}
```

## Event type

Initial event:

`risk_gate.decision.created`

The event contains:

- immutable `audit_id`;
- Risk Gate `request_id`;
- country/corridor subject;
- decision and recommended action;
- reason codes;
- counterfactual blockers;
- structured risk summary;
- top driver contributions;
- policy ID/version;
- `execution_authorized=false`.

## Canonical envelope

```json
{
  "schema_version": "geomacro-webhook-1.0",
  "event_id": "gwe_...",
  "event_type": "risk_gate.decision.created",
  "occurred_at": "2026-09-09T18:00:00.000Z",
  "client_id": "institution.example",
  "data": {
    "audit_id": "rga_...",
    "request_id": "request-...",
    "decision": "REQUIRE_APPROVAL",
    "recommended_action": "REQUIRE_HUMAN_APPROVAL",
    "reason_codes": [],
    "counterfactual": {},
    "subject": {},
    "risk": {},
    "top_drivers": [],
    "policy": {},
    "execution_authorized": false
  },
  "integrity": {
    "canonicalization": "geomacro-canonical-json-1.0",
    "payload_hash": "sha256-hex",
    "signature_scheme": "Ed25519",
    "signing_key_id": "geomacro-webhook-...",
    "signature": "base64"
  }
}
```

## Signature model

Webhook signing uses a separate key domain from Risk Object signing.

Server-only configuration:

- `WEBHOOK_SIGNING_KEY_ID`
- `WEBHOOK_SIGNING_PRIVATE_KEY_PKCS8_B64`
- `WEBHOOK_SIGNING_PUBLIC_KEY_SPKI_B64`

Risk Object private keys are never used as a fallback for webhook events.

The signed canonical payload is the full event with these two integrity fields temporarily set to `null`:

- `integrity.payload_hash`
- `integrity.signature`

`integrity.signing_key_id`, canonicalization version and signature scheme remain inside the signed payload. This prevents key-ID or algorithm metadata from being changed without invalidating the signature.

## Receiver verification contract

When outbound delivery is activated, a receiver must:

1. Parse JSON with a bounded request size.
2. Require `schema_version=geomacro-webhook-1.0`.
3. Require the expected event type.
4. Require `data.execution_authorized=false`.
5. Resolve `integrity.signing_key_id` only from Geomacro's trusted public-key registry.
6. Reject revoked/unknown keys.
7. Recreate the canonical signable event with `payload_hash=null` and `signature=null`.
8. SHA-256 the canonical payload and compare it with `integrity.payload_hash`.
9. Verify the Ed25519 signature.
10. Deduplicate by `event_id` and/or immutable `audit_id` before applying downstream business logic.

A valid signature proves event integrity/issuer authenticity under the trusted key. It does not grant payment, trading or transaction authority.

## Outbox and replay semantics

`public.webhook_event_outbox` is immutable and service-role only.

Database constraints bind the stored envelope to its indexed fields:

- event ID;
- client ID;
- audit ID;
- schema version;
- event type;
- payload hash;
- signature scheme;
- signing key ID;
- signature;
- `execution_authorized=false`.

When `WEBHOOK_OUTBOX_ENABLED=false` (default), existing Risk Gate delivery behavior is unchanged.

When `WEBHOOK_OUTBOX_ENABLED=true`:

- the successful Risk Gate audit is persisted by the existing audited path;
- the idempotency wrapper ensures one signed event exists for that audit before allowing the successful response to complete;
- if event persistence fails, the API returns a retryable 503 instead of a false success;
- the claim is deliberately not released after the immutable audit already exists;
- an exact retry reconciles the audit through the existing idempotency ledger, reconstructs/validates the event, and only then replays the successful response.

This closes the practical "audit exists but delivery event disappeared" failure window without rewriting the canonical Risk Gate audit implementation.

## Outbound delivery security gates

Outbound callback delivery must remain disabled until all of the following are implemented and evidenced:

1. HTTPS-only endpoint registration.
2. Explicit customer ownership verification of callback endpoints.
3. Block localhost, link-local, private, carrier-grade NAT, multicast, metadata-service and other non-public address ranges for IPv4 and IPv6.
4. Resolve DNS server-side and validate every resolved address before connection.
5. Revalidate after DNS changes; do not trust registration-time resolution forever.
6. Disable redirects, or validate every redirect target with the full policy before following it.
7. Use bounded connect/read/total timeouts.
8. Bound request and response body sizes.
9. Enforce concurrency and per-client delivery budgets.
10. Do not forward customer API credentials to callback hosts.
11. Sign every event and publish a rotation-aware public verification-key registry.
12. Persist delivery attempts separately from the immutable signed event.
13. Use retry backoff with a finite dead-letter policy.
14. Keep at-least-once delivery semantics explicit; receivers must deduplicate.
15. Run SSRF-specific tests against IPv4, IPv6, DNS rebinding, redirects and cloud metadata targets before activation.

Until those controls pass CI/security review, Geomacro should describe webhooks externally as **signed webhook/outbox foundation, outbound delivery not yet enabled**.

## Future delivery attempt model

The signed event source should remain immutable. Delivery state belongs in a separate table with fields such as:

- subscription ID;
- event ID;
- attempt number;
- attempted at;
- HTTP status class;
- latency;
- retry-after/next-attempt time;
- delivered/dead-letter status;
- bounded error code (not arbitrary response body).

Do not mutate the signed event to record retries.

## Commercial boundary

This webhook work does not implement billing.

Geomacro's planned commercial payment system remains a separate production-only real-money track with INR/USD and multi-currency/multi-chain support. Arc Testnet x402 remains technical proof and is not production commercial billing.
