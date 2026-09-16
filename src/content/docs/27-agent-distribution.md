# 27. Agent Distribution

Geomacro separates the intelligence product from the transport or payment rail used to access it. The same governed product boundaries apply whether access is through an authenticated Private Pilot API, a subscription, an invoice, x402 or another approved marketplace/provider.

## Current distribution architecture

### Governed API / Risk Gate — PRIVATE PILOT

- authenticated country/corridor Risk Gate API foundation;
- signed machine-readable Risk Objects;
- versioned verification and audit contracts;
- entitlement-controlled structured delivery;
- `execution_authorized=false` preserved in Risk Gate responses.

### Agent pay per call — MAINNET PRE-LAUNCH

Canonical product: `geomacro_adaptive_risk_intelligence_v1`.

Prepared public machine flow:

- free deliverability check: `POST /api/x402/risk/availability`;
- canonical Coinbase-compatible paid resource: `POST /api/x402/intelligence`;
- prepared production price: **0.02 USDC per successful paid call**;
- standard discovery: `/.well-known/x402` and `/.well-known/x402.json`;
- focused OpenAPI: `/openapi-x402.json`;
- agent discovery: `/.well-known/geomacro-agent.json`;
- commerce catalog: `/.well-known/geomacro-commerce.json`.

The live HTTP 402 challenge or approved provider plan is authoritative for price when production is enabled. Static website/catalog prices are informational only.

Production real-money activation remains disabled until the coordinated launch gates and explicit owner authorization are satisfied.

## Provider readiness

### Coinbase CDP x402 / Base mainnet

Code-ready and locked for coordinated launch. The implementation includes exact price binding, payment/query binding, replay protection, idempotent delivery, duplicate/conflicting-proof controls, settlement telemetry and a central real-funds gate.

### Circle Gateway / Circle Agent Marketplace

Production adapter prepared and locked. The legacy Arc/Circle route remains a separate Testnet technical proof. Circle production cannot bypass the provider-wide launch/security gate.

### Nevermined

Provider integration is code-ready with live-plan/provider inputs intentionally absent before launch. Sandbox/live separation and the coordinated-launch lock remain mandatory.

### GOAT Flow

Mainnet-capable code and onboarding material are prepared, while external merchant approval remains a manual launch dependency. Testnet values must never be copied into mainnet configuration.

## Existing Testnet technical proof

Geomacro also retains the earlier agentic-commerce proof path:

- free public technical sandbox at `POST /api/demo/preflight`;
- Circle x402 / USDC technical-proof route at `POST /api/agent/risk`;
- Arc Testnet payment requirements using test USDC;
- Testnet technical-proof price: `0.001 USDC` per call where that route is configured;
- `execution_authorized=false` preserved.

This Testnet route is not the production commercial pay-per-call product and must not be used to imply mainnet availability.

## Coordinated-launch distribution queue

Prepared primary launch cohort includes:

- Coinbase Bazaar;
- Coinbase Agentic Market;
- Circle Agent Marketplace;
- x402.new;
- Agent402.tools;
- PayAPI Market;
- x402scan;
- x402 List;
- Nevermined registry;
- true402.

GOAT Flow mainnet onboarding runs in parallel after merchant approval. Additional directories/marketplaces can be added only when their current requirements are compatible with Geomacro's entitlement, security and source-rights boundaries.

A marketplace listing never widens the intelligence product, supported subjects, source rights or execution authority.

## Launch gates

No provider becomes production-enabled merely because its adapter exists. Real-money activation requires the provider-wide security invariant and coordinated-launch acknowledgement, including:

- security mode in enforce state;
- explicit real-funds security acknowledgement;
- explicit coordinated commercial launch acknowledgement;
- dedicated fingerprint/API-credential secrets;
- production database security readiness;
- provider-specific production credentials/receiver configuration;
- exact deployment commit with required CI/security checks green;
- capped first real-money purchase and settlement/delivery reconciliation.

The payment/access mechanism must never bypass source-rights restrictions or become part of the core risk-calculation methodology.
