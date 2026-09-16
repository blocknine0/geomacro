# Geomacro Agent Commerce

Status: PRE-LAUNCH. Real-money settlement is disabled on every provider until the coordinated official launch.

Geomacro exposes bounded geopolitical and macro risk intelligence to software and AI agents. Payment/discovery providers are adapters around one canonical intelligence contract; they do not fork the underlying methodology or widen data entitlement.

## Canonical machine surfaces

- Discovery: `/.well-known/geomacro-agent.json`
- No-charge deliverability check: `POST /api/x402/risk/availability`
- Paid adaptive intelligence: `POST /api/x402/intelligence`
- Legacy/bounded x402 risk resource: `POST /api/x402/risk`
- Human-readable product documentation: `/data-api` and `/risk-gate`

## Pre-launch rule

Coinbase, GOAT, Nevermined and any additional compatible rail remain test/sandbox/disabled until all common acceptance gates pass. No provider may be activated early simply because its integration finishes first.

The official launch gate requires explicit owner approval after the release candidate is frozen and the exact release commit has passed the required security, payment, delivery, source-rights and reconciliation checks.

## Commercial delivery contract

A chargeable request must pass a no-charge deliverability decision before payment is requested. Required evidence must be available, sufficiently fresh for the product contract and commercially eligible for paid delivery. Unsupported or commercially ineligible required coverage is not chargeable.

A successful payment unlocks only the requested bounded resource. It never exposes raw/private warehouse data and never grants a broader subscription or execution authority.

## Payment invariants

- exact price and accepted rail are disclosed before authorization;
- network, asset, amount and recipient must bind to the paid retry;
- a payment proof/token cannot be reused for a changed request;
- idempotent replay of the same valid request must not create a duplicate charge;
- concurrent duplicate requests must not independently settle;
- ambiguous settlement is reconciled rather than blindly retried;
- payment and fulfillment are tracked as separate states;
- paid-but-undelivered cases must enter a visible remedy/reconciliation state;
- sensitive payment signatures, wallet keys and facilitator secrets are never stored in analytics artifacts.

## Response boundary

Geomacro supplies risk context and a non-executing Risk Gate decision. `execution_authorized=false` remains the product boundary. Output is not a substitute for sanctions screening, legal advice, counterparty due diligence or a guarantee of future events.

## Provider adapters

### Coinbase x402

Prepared for Base mainnet but held behind an explicit real-funds acknowledgement. Pre-launch acceptance remains on non-production infrastructure.

### GOAT

Merchant integration must complete non-production acceptance, order idempotency, provider verification and payment-to-delivery reconciliation before launch. Production configuration is not assumed from testnet configuration.

### Nevermined

Use the Nevermined sandbox during integration. Map Nevermined payment plans/permissions to the same Geomacro request and delivery ledger. Production/live facilitator configuration remains disabled until coordinated launch.

## Machine discovery vocabulary

Supported discovery descriptions may include country risk, geopolitical risk, macroeconomic risk, treasury pre-flight context, cross-border corridor risk, supplier-country exposure, geopolitical escalation context, portfolio geopolitical exposure, signed Risk Objects and machine-readable risk evidence when those capabilities are actually supported by the current production contract.

Do not advertise unsupported sanctions screening, autonomous execution, legal compliance, counterparty scoring, vessel routing or full logistics-path modelling.

## Launch evidence

Marketplace presence is distribution, not revenue. Testnet/sandbox settlement is technical evidence, not revenue. Commercial revenue is counted only after a real-funds settlement is reconciled to the correct delivered Geomacro resource on an activated production rail.
