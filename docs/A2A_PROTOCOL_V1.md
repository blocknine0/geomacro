# Geomacro A2A Protocol v1.0

Geomacro exposes a standards-based Agent2Agent (A2A) v1.0 interface for machine-to-machine geopolitical and macro risk pre-flight.

## Discovery and binding

- Agent Card: `GET https://geomacro.live/.well-known/agent-card.json`
- Preferred interface: `POST https://geomacro.live/a2a`
- Binding: JSON-RPC 2.0
- A2A protocol version: `1.0`
- Input/output mode: `application/json`
- Skill: `risk_preflight`
- Streaming: not supported in this release
- Push notifications: supported only for explicitly pre-approved HTTPS callback origins

The legacy `/.well-known/geomacro-agent.json` manifest remains for backward compatibility, but standards-based clients should use the A2A Agent Card.

## Security and product boundary

Commercial A2A calls use existing Geomacro commercial API credentials and exact server-side entitlement checks. A successful `risk_preflight` consumes the existing `risk_gate_bundle` credit capability. Testnet developer credentials cannot use this route to bypass Testnet pay-per-call rules.

A separate no-auth Arc Testnet Circle x402 path is available only as a technical proof. Without a payment signature it returns HTTP 402 and `PAYMENT-REQUIRED`; after a valid settlement it returns a direct A2A `Message` rather than a persistent task. This path is not production revenue.

Every Geomacro A2A risk result preserves `execution_authorized=false`. The A2A server does not custody wallets, sign customer transactions, or execute payments.

## SendMessage

Example JSON-RPC request:

```json
{
  "jsonrpc": "2.0",
  "id": "req-1",
  "method": "SendMessage",
  "params": {
    "message": {
      "role": "ROLE_USER",
      "messageId": "client-msg-001",
      "parts": [
        {
          "mediaType": "application/json",
          "data": {
            "skill": "risk_preflight",
            "subject": {
              "type": "country",
              "country_iso3": "USA"
            },
            "policy_preset": "balanced",
            "action_type": "treasury_payment",
            "amount_usdc": 100000
          }
        }
      ]
    },
    "configuration": {
      "acceptedOutputModes": ["application/json"],
      "historyLength": 2
    }
  }
}
```

Commercial requests include `Authorization: Bearer <Geomacro API key>` and may include `A2A-Version: 1.0`.

Geomacro creates a server-generated task ID, records `SUBMITTED`, `WORKING` and terminal state changes, evaluates the current signed Risk Object and Risk Gate, then returns a completed Task with a structured artifact. Reusing the same `messageId` with the identical request is idempotent. Reusing it with different content is rejected.

## Task operations

The JSON-RPC server implements:

- `SendMessage`
- `GetTask`
- `ListTasks`
- `CancelTask`
- `CreateTaskPushNotificationConfig`
- `GetTaskPushNotificationConfig`
- `ListTaskPushNotificationConfigs`
- `DeleteTaskPushNotificationConfig`

`SendStreamingMessage`, `SubscribeToTask`, and `GetExtendedAgentCard` return A2A `UnsupportedOperationError` because the public Agent Card does not advertise those capabilities.

## Push notifications

A2A callback delivery is intentionally separate from the general Geomacro signed-webhook outbox. General webhook egress remains disabled under its existing contract.

A2A callbacks are allowed only when all of these controls pass:

1. HTTPS callback URL, no embedded credentials, no fragment, and port 443 only.
2. Exact callback origin present in `GEOMACRO_A2A_PUSH_ALLOWED_ORIGINS`.
3. DNS resolution contains no private, loopback, link-local, multicast or other blocked addresses.
4. Redirects are disabled.
5. Inline callback credentials are rejected.
6. When Bearer authentication is requested, the credential comes only from server-side `GEOMACRO_A2A_PUSH_BEARER_BY_ORIGIN_JSON`.
7. Delivery uses short timeouts and at most three bounded retry attempts.
8. Delivery outcomes are persisted without plaintext secrets.

The optional A2A notification token is accepted for the immediate task-completion callback, but only its SHA-256 hash is persisted.

## Geomacro as an A2A client

`src/lib/a2a-client.server.ts` lets internal Geomacro orchestration discover and call external A2A v1.0 agents. It is server-only and is not exposed as an arbitrary URL proxy.

Outbound targets must be exact origins in `GEOMACRO_A2A_REMOTE_ORIGINS`. Geomacro fetches `/.well-known/agent-card.json`, requires a JSON-RPC v1.0 interface on the same approved origin, rejects redirects/private network targets, reads remote Bearer credentials only from `GEOMACRO_A2A_REMOTE_AUTH_JSON`, sends `SendMessage`, and polls `GetTask` with a bounded timeout when necessary. Each outbound interaction is audited with card/response hashes.

## Database migration

Migration `926_a2a_protocol_v1.sql` adds server-only task, task-event, push-config, push-delivery and outbound-interaction tables. RLS is enabled and `PUBLIC`, `anon` and `authenticated` table access is revoked.

The code must not be treated as live until migration 926 has been applied to the production Supabase project and the hosting deployment has been published.

## Runtime configuration

Optional A2A egress configuration:

```text
GEOMACRO_A2A_PUSH_ALLOWED_ORIGINS=https://partner.example
GEOMACRO_A2A_PUSH_BEARER_BY_ORIGIN_JSON={"https://partner.example":"server-side-secret"}
GEOMACRO_A2A_REMOTE_ORIGINS=https://remote-agent.example
GEOMACRO_A2A_REMOTE_AUTH_JSON={"https://remote-agent.example":"server-side-secret"}
```

Do not place those credentials in Agent Cards, task payloads, browser code, logs, or database rows.

## Scope statement

This implementation targets A2A v1.0 JSON-RPC interoperability. It does not claim A2A TCK certification until the official Technology Compatibility Kit has been run against the deployed endpoint and the evidence has been retained.
