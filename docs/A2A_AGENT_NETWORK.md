# Geomacro A2A Agent Network

Status: bounded A2A v1 implementation for paid/private-pilot and Testnet developer access.

Geomacro exposes an Agent2Agent (A2A) HTTP+JSON v1.0 interface so another authenticated software or AI agent can discover the Geomacro Agent, submit a risk-preflight task, follow the task lifecycle, receive a callback, and consume a machine-readable Risk Gate result. Geomacro can also call explicitly configured trusted A2A peers. It is not an open HTTP proxy and it never authorizes downstream execution.

## Discovery

Standard A2A discovery:

`GET https://geomacro.live/.well-known/agent-card.json`

Legacy Geomacro discovery remains available for backwards compatibility:

`GET https://geomacro.live/.well-known/geomacro-agent.json`

The preferred A2A interface is:

`https://geomacro.live/api/a2a`

Protocol binding: `HTTP+JSON`

Protocol version: `1.0`

## Authentication

A2A task endpoints require an existing Geomacro commercial identity. Supported credentials are the same governed credentials used by the commercial/Testnet API:

- Commercial bearer credential: `Authorization: Bearer ...`
- Testnet developer pair: `X-Geomacro-Api-Key: gmk_test_...` plus `X-Geomacro-Api-Secret: gms_test_...`

No anonymous A2A Risk Gate API is provided.

## Skill

The initial A2A skill is `risk_preflight`.

The caller sends one structured `data` part:

```json
{
  "message": {
    "messageId": "agent-request-001",
    "role": "ROLE_USER",
    "parts": [
      {
        "mediaType": "application/json",
        "data": {
          "skillId": "risk_preflight",
          "input": {
            "subject": {
              "type": "corridor",
              "origin_country_iso3": "IND",
              "destination_country_iso3": "SGP"
            },
            "policy_preset": "balanced",
            "action_type": "agent_payment",
            "amount_usdc": 1000
          }
        }
      }
    ]
  },
  "configuration": {
    "acceptedOutputModes": ["application/json"],
    "historyLength": 10
  }
}
```

The delivered artifact can contain the Risk Gate result, verified signed Risk Object, governed structural context, canonical GRI context and the applicable audit/provenance fields. Every A2A delivery remains advisory and read-only. `execution_authorized` must remain `false`.

## Task lifecycle

Implemented HTTP+JSON v1 task methods:

- `POST /api/a2a/message:send`
- `GET /api/a2a/tasks/{id}`
- `GET /api/a2a/tasks`
- `POST /api/a2a/tasks/{id}:cancel`
- `POST /api/a2a/tasks/{id}/pushNotificationConfigs`
- `GET /api/a2a/tasks/{id}/pushNotificationConfigs`
- `GET /api/a2a/tasks/{id}/pushNotificationConfigs/{configId}`
- `DELETE /api/a2a/tasks/{id}/pushNotificationConfigs/{configId}`
- `GET /api/a2a/extendedAgentCard`

A `messageId` is an idempotency identity within a commercial principal. Replaying the same message returns the existing task. Reusing that `messageId` with a different payload, task or context fails closed with `A2A_MESSAGE_ID_CONFLICT`; it is never silently treated as the original request.

When task history is requested, Geomacro returns the bounded most-recent messages in chronological order. This prevents an old prefix of a long conversation from being mistaken for the current task state.

Streaming and task subscription are not advertised in v1. Geomacro advertises `streaming: false` and rejects unsupported asynchronous execution semantics rather than pretending they are available.

## Testnet pay-per-call continuation

When the authenticated principal has the Testnet tester entitlement, `risk_preflight` uses the existing Testnet USDC pay-per-call policy. Geomacro performs a read-only fulfillment preflight before requesting payment.

If payment is required, the A2A task moves to `TASK_STATE_INPUT_REQUIRED`. The returned task contains the Testnet USDC quote. The client pays on the matching Testnet and sends another `ROLE_USER` message using the same `taskId`, with the payment proof inside the `risk_preflight` input.

The existing Testnet payment ledger enforces request/payment idempotency, verified-wallet matching, transaction reuse prevention, central reconciliation and no double charge on retry.

The separate `/api/agent/risk` Circle x402 Arc Testnet route remains available as the x402 technical-proof surface. A2A does not silently convert x402 technical proof into institutional pricing or production revenue.

## Push notifications

A caller can attach a task push-notification configuration or create one later. Geomacro:

- accepts public HTTPS callback URLs only;
- rejects loopback, private, link-local, metadata and internal DNS targets;
- performs DNS safety checks before outbound callback delivery;
- does not follow redirects;
- supports a task-scoped notification token;
- does not accept or persist remote Authorization credentials;
- retries callback delivery within a bounded timeout;
- disables a repeatedly failing callback after five consecutive failed delivery cycles;
- records callback evidence in the A2A audit ledger.

Push callbacks carry an A2A task update and never contain Geomacro API credentials.

## Outbound Geomacro-to-agent calls

Geomacro can act as an A2A client through:

`POST /api/a2a/outbound`

This endpoint is restricted to API Pilot or Institutional entitlements. It accepts a server-configured `peer_id` and an explicit `required_skill_id`; it never accepts a caller-supplied target URL.

Before any outbound task is sent, Geomacro performs capability negotiation against the trusted peer Agent Card. The peer must advertise:

- A2A `HTTP+JSON` protocol version `1.0`;
- the requested `required_skill_id`;
- an interface host matching the Agent Card host or an explicit server-side allowlist.

If the capability is absent, Geomacro fails closed before task dispatch.

Example outbound envelope:

```json
{
  "peer_id": "treasury-agent",
  "required_skill_id": "treasury_risk_review",
  "message": {
    "messageId": "geomacro-outbound-001",
    "role": "ROLE_USER",
    "parts": [
      {
        "data": {
          "country_iso3": "IND",
          "risk_gate_decision": "REQUIRE_APPROVAL"
        },
        "mediaType": "application/json"
      }
    ]
  }
}
```

When a trusted peer returns a non-terminal remote task, Geomacro persists the remote task identity and can refresh it through:

`GET /api/a2a/outbound/{localTaskId}`

The refresh re-discovers the configured peer, re-validates the required capability and interface boundary, fetches the exact remote task identity, rejects identity substitution, persists the new state and writes an audit event. This provides a durable Geomacro-to-agent lifecycle without creating an arbitrary outbound proxy.

Trusted peers are configured server-side with `GEOMACRO_A2A_TRUSTED_PEERS_JSON`. Example shape:

```json
[
  {
    "id": "treasury-agent",
    "agent_card_url": "https://agent.example.com/.well-known/agent-card.json",
    "authorization_env": "GEOMACRO_A2A_PEER_TREASURY_TOKEN",
    "allowed_interface_hosts": ["agent.example.com"]
  }
]
```

Peer authorization secrets are loaded from server environment variables and are never written to the A2A tables. Geomacro validates the trusted peer Agent Card, requires A2A HTTP+JSON v1.0, validates the advertised interface hostname, blocks private-network destinations and records request/response hashes in the A2A audit ledger.

## Durable evidence

Migration `926_a2a_v1_agent_network.sql` adds service-role-only RLS tables for:

- task state;
- message history;
- push notification configuration and delivery status;
- inbound, outbound and callback audit events.

Request and response hashes are retained for traceability. A2A tables do not expose the private intelligence warehouse and do not weaken the existing commercial entitlement, source-license, payment or Risk Gate boundaries.

## Permanent execution boundary

A2A does not make Geomacro an execution engine. It does not sign a customer's transaction, custody a wallet, approve a payment or make a final financial decision. The caller's own policy/execution system remains responsible for any downstream action.

`execution_authorized = false`
