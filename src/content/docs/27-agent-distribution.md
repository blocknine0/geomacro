# 27. Agent Distribution

Geomacro's machine-delivery foundation is the authenticated Private Pilot Risk API / Risk Gate interface, with a separate Arc Testnet x402 technical-proof path for agent-native pay-per-call access.

The product remains transport-agnostic: the intelligence and Risk Object contracts do not depend on one marketplace, wallet or payment rail.

## Current

- authenticated country/corridor Risk Gate API foundation
- signed machine-readable Risk Objects
- versioned verification and audit contracts
- free public technical sandbox at `POST /api/demo/preflight`
- Circle x402 / USDC technical-proof route at `POST /api/agent/risk`
- Arc Testnet payment requirements using HTTP 402 and Circle Gateway batching
- `execution_authorized = false` preserved in both free and paid responses

## x402 implementation status

The x402 route is **IMPLEMENTED AS TECHNICAL PROOF**, not yet a production commercial endpoint.

Current test contract:

- network: Arc Testnet (`eip155:5042002`)
- asset: test USDC
- test price: `0.001 USDC` per call
- supported public demo subjects: USA, CHN, USA→CHN, CHN→USA
- seller/pay-to address supplied by server-only `CIRCLE_X402_SELLER_ADDRESS`
- unpaid valid requests return HTTP `402` with `PAYMENT-REQUIRED`
- paid retries are verified and settled before the prepared Risk Gate resource is returned
- payer identity is hashed before persistence in telemetry

The test price is not institutional pricing. The route does not authorize or execute customer transactions.

## Public-deployment gates

Do not describe the x402 route as publicly live until all of these are complete:

1. a dedicated Arc Testnet seller address is configured;
2. migration `035_agentic_demo_feedback.sql` is applied to the authoritative application database;
3. the real unpaid `402 → payment → settlement → resource` path passes end-to-end on Arc Testnet;
4. isolated staging HTTP resilience testing passes;
5. the scoped pre-demo security review is complete and critical/high findings are fixed and re-tested.

## Planned distribution options

Potential future interfaces include:

- formal OpenAPI developer specification and SDK generation
- webhooks
- MCP-compatible adapters
- agent-to-agent interfaces
- marketplace integrations
- additional payment/access rails where appropriate

These remain **PLANNED** unless separately implemented and verified.

A payment/access mechanism must never bypass source-rights restrictions or become part of the core risk calculation methodology.
