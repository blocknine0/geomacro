# Geomacro Autonomous Agent on Arc Testnet

This document defines the first bounded autonomous-agent proof for Geomacro.

## What the proof demonstrates

An external AI-agent runtime can:

1. discover the Geomacro risk endpoint;
2. request a signed geopolitical/macro risk pre-flight;
3. receive an HTTP 402 payment challenge;
4. validate that the challenge is Arc Testnet + USDC + the fixed 0.05 USDC technical-proof price;
5. inspect the paid service with Circle CLI and validate its HTTP method;
6. authorize one bounded Testnet payment through the Circle CLI;
7. retry the same request;
8. receive the prepared Risk Object and Risk Gate result;
9. verify that the Risk Object is marked `VERIFIED`;
10. verify that `execution_authorized=false` remains fail-closed.

The payment runner is deliberately a client-side/agent-runtime concern. The Geomacro server never receives a private wallet key and never gets permission to make arbitrary transfers.

## Run

Use an isolated staging host. Never point this proof at `geomacro.live`.

Required environment:

```bash
export GEOMACRO_X402_BASE_URL="https://<isolated-staging-host>"
export GEOMACRO_X402_AGENT_WALLET_ADDRESS="0x..."
export GEOMACRO_AGENT_PAYMENT_ACK="ARC_TESTNET_USDC"
export GEOMACRO_AGENT_MAX_PAYMENT_USDC="0.05"
export GEOMACRO_AGENT_COUNTRY="USA"
```

Then:

```bash
bun run agentic:arc-agent
```

Optional country override:

```bash
export GEOMACRO_AGENT_COUNTRY=USA
```

The paid Arc Testnet proof uses a country Risk Object. The current directional corridor pilot remains independently unverified and is not eligible for paid delivery.

## Security boundary

The v1 proof is intentionally constrained:

- Arc Testnet only
- USDC only
- maximum 0.05 USDC per request
- Circle Gateway x402 seller only
- no arbitrary contract calls
- no mainnet
- no user-wallet spending
- no financial execution authorization
- Risk Gate must remain `execution_authorized=false`

## Production acceptance

This runner is a technical proof, not a production payment product.

Before presenting it as a production commercial capability, the acceptance flow should additionally prove:

- exact payment-to-intelligence delivery ledger;
- replay does not create a second charge;
- tampered Risk Objects are rejected;
- unpaid live requests return 402 without intelligence leakage;
- the same Git SHA is deployed publicly;
- payment settlement references are retained in the commercial proof ledger.

Those checks remain separate from the bounded Arc Testnet agent demo.
