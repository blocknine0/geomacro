# Agentic Commerce Demo

Status: **Technical Proof + public test sandbox**

This demo lets external builders, agent projects and reviewers exercise the same risk pre-flight concept that Geomacro is developing for Private Pilot customers. It is deliberately narrow, testable and explicit about what is real today.

## Public surfaces

| Surface | Access | Purpose |
| --- | --- | --- |
| `/demo` | public browser | Run a guided pre-flight and inspect the machine response |
| `POST /api/demo/preflight` | free public API | Test the signed Risk Gate resource from another project |
| `POST /api/agent/risk` | Circle x402, Arc Testnet USDC | Test pay-per-call machine access |
| `POST /api/demo/feedback` | public feedback form | Report integration friction and missing capabilities |

The free sandbox exists so builders can evaluate the product before paying. The x402 endpoint exists to test agent-native commercial access, not to establish Geomacro's institutional pricing.

## Current demo subjects

The public sandbox is intentionally allowlisted while country/corridor coverage is being validated:

- `USA`
- `CHN`
- `USA>CHN`
- `CHN>USA`

The corridor model is directional and endpoint-composed. It is not full route, shipping, logistics or counterparty modelling.

## Free pre-flight request

```http
POST /api/demo/preflight
Content-Type: application/json
```

Example:

```json
{
  "subject": {
    "type": "corridor",
    "origin_country_iso3": "USA",
    "destination_country_iso3": "CHN"
  },
  "policy_preset": "cautious",
  "action_type": "agent_payment",
  "amount_usdc": 10000
}
```

The response includes:

- Risk Gate decision and reason codes;
- signed Risk Object metadata and integrity fields;
- score, change, confidence and top drivers;
- current verified GRI v1.2 context when available;
- commercially eligible structural evidence when the historical read connection is configured;
- explicit product boundaries.

Every successful Risk Gate response preserves:

```text
execution_authorized = false
```

Geomacro returns risk context and a policy recommendation. It does not authorize or submit the caller's payment or transaction.

## Structural evidence boundary

The demo server reads only:

```text
commercial_structural_geopolitical_observations
```

from the private historical warehouse.

Structural observations are returned with:

```text
EVIDENCE_ONLY_NOT_IN_GRI_V1_2
```

They are not a hidden fourth GRI v1.2 scoring domain and are not silently assigned an undisclosed Risk Gate weight. Missing structural evidence is disclosed and is never converted to zero risk.

Required server-only variables when structural evidence is enabled:

```text
HISTORICAL_SUPABASE_URL
HISTORICAL_SUPABASE_SERVICE_ROLE_KEY
```

Never expose those values through `VITE_*`, browser code or public logs.

## Circle x402 paid path

Endpoint:

```http
POST /api/agent/risk
```

Current test price:

```text
0.001 USDC per call
```

This is a testnet demo price only.

The endpoint uses Circle Gateway x402 payment requirements on Arc Testnet:

```text
network: eip155:5042002
asset:   0x3600000000000000000000000000000000000000
rail:    Circle Gateway batching / x402
```

The server uses `BatchFacilitatorClient` from `@circle-fin/x402-batching/server` to verify and settle the payment before delivering the paid resource.

An unpaid valid request returns HTTP `402` with a `PAYMENT-REQUIRED` header. An x402-compatible caller provides the `payment-signature` header. A settled response returns `PAYMENT-RESPONSE` metadata.

The seller address is intentionally configured separately:

```text
CIRCLE_X402_SELLER_ADDRESS
```

Do not silently reuse the AgentArena treasury contract as the x402 seller address.

## Circle code proof

The demo is additional to Circle integrations that already exist in Geomacro:

### CCTP V2

`src/lib/cctp.ts`

- USDC approval and burn on the source testnet;
- Circle TokenMessenger V2;
- Circle Iris attestation polling;
- MessageTransmitter V2 receive on the destination;
- Arc Testnet domain and USDC configuration.

### Circle App Kit

`src/lib/swap.ts`

- Circle App Kit;
- Circle ethers adapter;
- Arc Testnet token rates;
- swap estimates;
- swap execution;
- status recovery.

### Circle x402 / Gateway

`src/lib/circle-x402.server.ts`

- x402 payment requirements;
- Arc Testnet USDC;
- Circle Gateway batching verification and settlement;
- payment response metadata;
- best-effort commerce telemetry.

### Risk Gate

`src/lib/risk-gate-engine.ts`

- customer-defined policy;
- fail-closed risk checks;
- `CONTINUE`, `REDUCE_LIMIT`, `REQUIRE_APPROVAL`, or `PAUSE`;
- no autonomous execution authorization.

## Feedback

The browser demo asks testers for:

- tester type;
- whether the flow worked;
- usefulness rating;
- whether they would integrate it;
- what was useful;
- what was confusing, slow or broken;
- what capability their workflow is missing.

The feedback schema intentionally excludes IP address, wallet address, raw request payload and payment payload fields.

## Before calling the x402 demo live

Do not describe the paid endpoint as live until all of these are true:

1. `@circle-fin/x402-batching` installs with the committed Bun lockfile;
2. app tests and production build pass;
3. `CIRCLE_X402_SELLER_ADDRESS` is configured in the deployed server runtime;
4. the feedback migration is applied to the authoritative Supabase project;
5. structural read credentials are configured if the demo is expected to show structural evidence as available;
6. an end-to-end Arc Testnet test confirms unpaid `402` -> USDC payment -> settled paid response;
7. the deployed site is sourced from the current GitHub code, not a stale Lovable snapshot.

## Commercial boundary

This is a public technical demo of a Private Pilot architecture. It is not a production SLA, security certification, legal/compliance decision engine, investment recommendation or permission to move funds.
