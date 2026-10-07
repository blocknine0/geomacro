# Geomacro Agent Commerce

Status: PRODUCTION GATED. Real-money settlement remains disabled until the applicable production acceptance gates pass and the exact release candidate receives explicit owner authorization.

Geomacro exposes bounded geopolitical, macroeconomic and critical-mineral risk intelligence to software and AI agents. Payment and discovery providers are adapters around one canonical intelligence contract; they do not fork the underlying methodology or widen data entitlement.

## Canonical machine surfaces

- Agent discovery: `/.well-known/geomacro-agent.json`
- Commerce catalog: `/.well-known/geomacro-commerce.json`
- No-charge deliverability check: `POST /api/x402/risk/availability`
- Coinbase x402 adaptive intelligence: `POST /api/x402/intelligence`
- Circle Gateway adaptive intelligence: `POST /api/x402/circle/intelligence`
- Nevermined adaptive intelligence: `POST /api/x402/nevermined/intelligence`
- Human-readable product documentation: `/data-api` and `/risk-gate`

The live payment challenge or provider plan is the authoritative source for price and accepted payment terms. Static discovery documents never authorize production settlement.

## Production launch rule

A provider cannot be activated early merely because its integration finishes first. All required common gates and provider-specific checks must pass before any production-funds switch is enabled.

## Commercial delivery contract

A chargeable request must pass a no-charge deliverability decision before payment is requested. Required evidence must be available, sufficiently fresh for the product contract and commercially eligible for paid delivery. Unsupported or commercially ineligible required coverage is not chargeable.

A successful payment unlocks only the requested bounded resource. It never exposes raw/private warehouse data and never grants a broader subscription or execution authority.

## Payment invariants

- exact price and accepted rail are disclosed by the authoritative payment challenge or provider plan before authorization;
- network, asset, amount and recipient must bind to the paid retry where the provider contract exposes those terms;
- a payment proof or token cannot be reused for a changed request;
- idempotent replay of the same valid request must not create a duplicate charge;
- concurrent duplicate requests must not independently settle;
- ambiguous settlement is reconciled rather than blindly retried;
- payment and fulfillment are tracked as separate states;
- paid-but-undelivered cases must enter a visible remedy or reconciliation state;
- sensitive payment signatures, wallet keys and facilitator secrets are never stored in analytics artifacts.

## Current machine-readable request scope

Subjects:

- country by ISO3 code;
- directional corridor by origin ISO3 and destination ISO3.

Supported adaptive topics include sovereign risk, macro risk, FX/external risk, sanctions/restrictions context, conflict/geopolitics, trade corridor context, energy/commodities, critical minerals, political/governance risk, banking/financial-system context, food/agriculture, natural hazards, hot topics, Risk Gate, signed Risk Object and GRI context.

Supported request intents include single-subject assessment, comparison, bounded ranking/filter, directional corridor, change-since, audit/provenance and Risk Gate evaluation.

## Response boundary

Geomacro supplies risk context and a non-executing Risk Gate decision. `execution_authorized=false` remains the product boundary. Output is not a substitute for sanctions screening, legal advice, counterparty due diligence or a guarantee of future events.

## Provider adapters

### Coinbase x402

Prepared for the coordinated production launch. Production activation remains fail-closed until live paid acceptance and explicit owner authorization pass.

### Circle Gateway x402

Uses the same Geomacro deliverability, delivery-ledger, idempotency and reconciliation contract. Production activation remains fail-closed until live Gateway support, security acknowledgements and coordinated launch acceptance pass.

### Nevermined

Uses the same canonical commercial delivery contract. Live production credentials and activation remain gated by coordinated launch acceptance.

## Growth and marketing boundary

Marketplace presence is distribution, not revenue. Commercial revenue is counted only after a real-funds settlement is reconciled to the correct delivered Geomacro resource on an activated production rail.

Verified production milestones may generate private channel-specific marketing drafts. Automatic public publishing is disabled. Every external marketing post requires explicit owner approval, and customer/payer identity, raw requests and private source details remain excluded.
