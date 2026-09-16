# Geomacro pre-mainnet x402 full-readiness package

Status: **PRELAUNCH HOLD — production funds are not authorized**.

This document is the launch-time checklist for turning the already-built pay-per-call system into a coordinated real-USDC release. It deliberately completes code/config/discovery preparation without setting any mainnet flag, merchant credential, real-funds acknowledgement or marketplace submission.

## Canonical commercial product

The canonical machine product is `geomacro_adaptive_risk_intelligence_v1`.

- Free deliverability check: `POST /api/x402/risk/availability`
- Canonical Coinbase-compatible paid resource: `POST /api/x402/intelligence`
- Nevermined adapter: `POST /api/x402/nevermined/intelligence`
- Existing Circle/Arc proof: `POST /api/agent/risk` on Arc Testnet only
- Standard discovery: `/.well-known/x402` and `/.well-known/x402.json`
- Commerce catalog: `/.well-known/geomacro-commerce.json`
- Focused marketplace OpenAPI: `/openapi-x402.json`

Every paid or private-pilot Risk Gate output remains non-executing: `execution_authorized=false`.

## 1. Coinbase CDP x402 / Base mainnet

Implementation status: **code-ready and locked**.

Already implemented:

- Base Sepolia acceptance and paid E2E evidence
- Bazaar extension and indexing evidence
- Base-mainnet configuration path
- exact price binding
- payment/query binding
- delivery ledger, replay protection and idempotent replay
- conflicting-proof rejection
- ambiguous-settlement manual-review state
- no blind retry after a signed payment exists
- commercial-pending-accounting boundary before reconciliation
- approved production price: 0.02 USDC per call

Launch-time external inputs still required:

- dedicated production receiver address
- production CDP credentials
- exact deployment commit with CI/security green
- explicit owner acknowledgements and coordinated launch acknowledgement
- one capped real-USDC smoke purchase followed by ledger/onchain reconciliation

These are launch actions, not missing implementation.

## 2. Circle Gateway / Circle Agent Marketplace

Implementation status: **production adapter prepared and locked**.

The legacy Circle route remains an Arc Testnet technical proof. Production preparation uses a separate adapter so testnet semantics are not silently upgraded to real money.

Production adapter properties:

- `BatchFacilitatorClient()` uses Circle's production hosted Gateway configuration
- supported-kind discovery is performed at runtime with `getSupported()`
- initial approved production network is Base mainnet (`eip155:8453`)
- Base mainnet USDC is explicitly bound
- Gateway `verifyingContract` must come from current Circle supported-kind discovery
- Circle production cannot pass unless the provider-wide central real-funds gate, coordinated-launch gate and Circle-specific acknowledgement are all satisfied
- settlement remains `commercial_pending_accounting` until reconciliation
- `execution_authorized=false` is preserved

Arc mainnet is **not** enabled by this package. Do not use private/pre-GA Arc-mainnet switches. Add Arc mainnet only after Circle publicly supports it for this seller path and the support state is independently re-verified.

Circle Agent Marketplace can list the canonical Geomacro x402 service after production is live; Circle Gateway is additive and is not treated as a reason to publish before launch.

## 3. Nevermined

Implementation status: **provider code-ready; live-plan inputs intentionally absent**.

Existing Nevermined adapter already supports sandbox/live separation, provider verification/settlement, amount limits, scheme/network validation, and the global coordinated-launch lock.

Launch-time external inputs:

- approved live Nevermined provider credential
- approved live plan ID and current plan economics
- supported scheme/network confirmed from the live provider
- sandbox acceptance evidence preserved
- first live purchase reconciled before revenue reporting

Do not set `NEVERMINED_X402_ENVIRONMENT=live` before the coordinated launch.

## 4. GOAT Flow mainnet

Implementation status: **mainnet-capable code + onboarding package ready; external merchant approval pending**.

The runtime already supports separate Testnet3 and Mainnet origins, merchant credentials and dynamic supported-environment/token discovery. Mainnet remains additionally locked by the global launch gate and `GOATX402_MAINNET_COMMERCIAL_ENABLED`.

Current official flow requires a merchant application and approval. After approval, read receiving chains, token contracts, decimals, min/max amounts and capabilities from the live Mainnet portal/API/QuickPay manifest. Do not copy Testnet3 values into Mainnet.

Launch/onboarding sequence:

1. submit merchant application manually
2. wait for approval
3. enable 2FA and create server-only production API credentials
4. configure a dedicated receiving address for the approved USDC chain/token
5. inspect live Mainnet capabilities
6. publish one bounded QuickPay product or paid API/MPP route for Geomacro intelligence
7. perform one capped real purchase
8. reconcile order/session/transaction and Geomacro delivery evidence
9. only then mark the GOAT listing live

No application is submitted by this repository change.

## 5. Standard seller discovery package

The repository now carries one launch package for marketplaces and autonomous buyers:

- `/.well-known/x402`
- `/.well-known/x402.json`
- `/openapi-x402.json`
- `/.well-known/geomacro-commerce.json`
- `/.well-known/geomacro-agent.json`
- `/llms.txt`
- `/api/x402/risk/availability`

The x402 discovery document is deliberately fail-closed. While production flags are off, its `resources` array is empty and `productionFundsAuthorized=false`. It can describe planned resources without advertising a payable mainnet service.

Static catalog prices are never authoritative. The live HTTP 402 challenge or provider plan is the payment authority.

## 6. Marketplace/distribution launch queue

The canonical machine queue is `config/agent-marketplace-distribution.json`.

Primary coordinated-launch cohort:

- Coinbase Bazaar
- Coinbase Agentic Market
- Circle Agent Marketplace
- x402.new
- Agent402.tools
- PayAPI Market
- x402scan
- x402 List
- Nevermined registry
- true402

Parallel onboarding:

- GOAT Flow Mainnet

Secondary after primary launch proof:

- 402bazaar

Deferred:

- pay.sh / pay-skills while its required payment-rail shape does not justify adding a new Geomacro chain solely for directory coverage

Every target remains `production_enabled=false` until launch.

## Provider-wide real-funds security invariant

Any one of these runtime intents is enough to trigger the central real-funds gate:

- Coinbase `production`
- Circle Gateway `production`
- Nevermined `live`
- GOAT `mainnet`

The request is blocked unless all of the following are simultaneously present:

- central security mode is `enforce`
- explicit real-funds security acknowledgement
- explicit coordinated commercial launch acknowledgement
- dedicated fingerprint pepper
- dedicated API-credential pepper
- production database security readiness

Provider-specific credentials or flags cannot bypass this gate.

## What remains intentionally manual at the actual launch

The implementation is allowed to be complete while the following remain unset because they are external authorization/operational inputs rather than code work:

- real production credentials
- production receiver/merchant wallets
- GOAT merchant approval
- Nevermined live plan creation/approval
- Circle marketplace submission
- directory registration submissions
- real-USDC smoke purchase
- final owner launch acknowledgements

Those actions must occur only after the owner explicitly authorizes the coordinated launch.
