# Geomacro Agent-to-Agent Network v1

Status: bounded production-capable machine interface for commercial-credit A2A requests, with a separate Arc Testnet x402 technical-proof payment mode.

This is the Geomacro A2A protocol (`geomacro-a2a/1`). It is not presented as an implementation of an unrelated third-party A2A standard. The protocol is deliberately small and focused on risk-preflight tasks.

## Flow

1. Discover `https://geomacro.live/.well-known/geomacro-a2a.json`.
2. Negotiate protocol, capability, payment mode and callback mode at `POST /api/a2a/negotiate`.
3. Register an Ed25519 public key at `POST /api/a2a/identity` using an existing authorized Geomacro commercial or Testnet developer API credential.
4. Sign each task request with the registered Ed25519 identity.
5. Send a `risk_preflight` task to `POST /api/a2a/tasks`.
6. Use either an entitled commercial-credit path or the separate Arc Testnet Circle x402 proof path.
7. Receive the completed machine-readable Risk Gate bundle synchronously, poll the signed task status endpoint, or use an allowlisted HTTPS push callback.
8. Inspect the durable task audit trail through the signed task-status request.

Geomacro remains read-and-recommend only. Every result must preserve `execution_authorized=false`.

## Request signature

Required headers:

- `x-geomacro-a2a-agent-id`
- `x-geomacro-a2a-timestamp`
- `x-geomacro-a2a-nonce`
- `x-geomacro-a2a-signature`

The detached Ed25519 signature is calculated over:

```text
geomacro-a2a/1
<METHOD>
<PATHNAME>
<TIMESTAMP>
<NONCE>
<SHA256_HEX_OF_RAW_BODY>
```

For GET task-status requests the raw body is the empty string. Timestamps have a short acceptance window and every nonce is persisted with a uniqueness constraint, so replayed signed requests fail closed.

Private keys are never uploaded to Geomacro. Only the Ed25519 public JWK and its fingerprint are stored.

## Identity registration

Example body:

```json
{
  "agent_id": "treasury-agent.acme",
  "public_key_jwk": {
    "kty": "OKP",
    "crv": "Ed25519",
    "x": "<base64url-public-key>"
  },
  "callback_origins": [
    "https://agent.acme.example"
  ]
}
```

Identity registration/rotation is authenticated through the existing Geomacro commercial access layer. A registered `agent_id` cannot be taken over by another commercial principal.

## Task request

```json
{
  "protocol_version": "geomacro-a2a/1",
  "client_task_id": "acme-risk-2026-09-15-0001",
  "capability": "risk_preflight",
  "subject": {
    "type": "country",
    "country_iso3": "IND"
  },
  "policy_preset": "balanced",
  "action_type": "treasury_payment",
  "amount_usdc": 250000,
  "payment_mode": "commercial_credit"
}
```

`client_task_id` is idempotent per commercial principal. Reusing the same ID with different request content returns a conflict. Retrying the same body cannot double-charge the commercial credit ledger because the durable server task ID is reused as the usage request ID.

## Commercial-credit mode

`commercial_credit` uses the canonical entitlement registry and the `risk_gate_bundle` credit capability. It returns a signed Risk Object, Risk Gate decision, governed structural context and canonical GRI context subject to the caller's server-resolved tier limits.

The A2A layer does not create or expand an entitlement. It consumes only what the existing commercial access contract already allows.

## x402 Testnet mode

`x402_testnet` is an Arc Testnet technical proof. When no `payment-signature` header is supplied, Geomacro returns HTTP 402 and `PAYMENT-REQUIRED`. The agent can pay and retry the exact same task body with a fresh A2A nonce/signature and the x402 payment proof.

A successful Circle settlement is persisted before intelligence execution. If the application process fails after settlement, the same idempotent task can reuse the stored settlement state instead of intentionally charging again.

Testnet x402 activity is not classified as commercial revenue.

## Task status and audit

`GET /api/a2a/tasks/{task_id}` is itself signed. It returns the task state plus bounded audit events such as:

- `task.accepted`
- `task.payment_required`
- `payment.x402_settled`
- `task.processing`
- `task.completed`
- `task.failed`
- `callback.delivered`
- `callback.failed`
- `callback.blocked`

No API secret or private signing key is written to the A2A audit tables.

## HTTPS push callbacks

Push callbacks are optional. A callback URL must satisfy all of the following:

- HTTPS only
- origin was registered on the A2A identity
- origin is also present in the server-controlled `GEOMACRO_A2A_CALLBACK_ALLOWLIST`
- DNS resolves only to public addresses at validation time
- redirects are rejected
- request is time-bounded

A failed callback never changes a successfully completed risk result. The caller can still poll the task status.

## Geomacro as an outbound A2A client

Geomacro also contains a controlled outbound client for discovery, negotiation and signed task dispatch to compatible `geomacro-a2a/1` peers. The operational route is owner-only and every remote origin must be explicitly listed in `GEOMACRO_A2A_OUTBOUND_ALLOWLIST`.

Required outbound configuration:

- `GEOMACRO_A2A_OUTBOUND_AGENT_ID`
- `GEOMACRO_A2A_OUTBOUND_PRIVATE_KEY_PEM`
- `GEOMACRO_A2A_OUTBOUND_ALLOWLIST`

The remote peer must register Geomacro's corresponding public key before accepting signed tasks.

The generic outbound dispatcher does not auto-spend from an arbitrary wallet. If a remote peer returns HTTP 402, the payment requirement is surfaced to the controlled caller. Automated outbound payments require a separately approved wallet/spend-policy adapter.

## Data and execution boundaries

A2A does not weaken existing Geomacro boundaries:

- no raw private warehouse access
- no upstream private/news-source identity exposure
- no wallet custody
- no transaction signing
- no final financial execution authorization
- `execution_authorized=false` is enforced again before task completion
