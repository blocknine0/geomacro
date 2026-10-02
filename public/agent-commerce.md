# Geomacro Agent Commerce

Status: RUNTIME-CONTROLLED. Production payment availability is advertised only by the live health contract and authoritative payment challenge for the requested resource.

Geomacro exposes bounded geopolitical and macro risk intelligence to software and AI agents. Payment/discovery providers are adapters around one canonical intelligence contract; they do not fork the underlying methodology or widen data entitlement.

## Canonical machine surfaces

- Agent discovery: `/.well-known/geomacro-agent.json`
- Commerce catalog: `/.well-known/geomacro-commerce.json`
- No-charge deliverability check: `POST /api/x402/risk/availability`
- Coinbase x402 adaptive intelligence: `POST /api/x402/intelligence`
- Circle Gateway adaptive intelligence: `POST /api/x402/circle/intelligence`
- Nevermined adaptive intelligence: `POST /api/x402/nevermined/intelligence`
- Human-readable product documentation: `/data-api` and `/risk-gate`

The payment challenge or provider plan is the authoritative source for price and accepted payment terms. A static discovery document is never authoritative pricing or proof that settlement is active.

## Activation rule

The prepared commercial provider set includes Coinbase x402, Circle Gateway x402 and Nevermined. Each provider remains governed by the common Geomacro acceptance gates, provider-specific controls and explicit production authorization. A provider cannot become chargeable merely because an integration exists.

Circle's prepared production path uses Base-mainnet USDC and remains protected by the coordinated launch acknowledgement, Circle-specific acknowledgement, central real-funds security controls and runtime support discovery. Other programmable-finance networks are not implicitly enabled by this package.

GOAT production merchant access depends on provider onboarding and remains outside the initial provider activation path until that onboarding is complete.

Within an approved launch cohort, all required common gates must pass before any production-funds switch is enabled.

## Commercial delivery contract

A chargeable request must pass a no-charge deliverability decision before payment is requested. Required evidence must be available, sufficiently fresh for the product contract and commercially eligible for paid delivery. Unsupported or commercially ineligible required coverage is not chargeable.

A successful payment unlocks only the requested bounded resource. It never exposes raw/private warehouse data and never grants a broader subscription or execution authority.

## Payment invariants

- exact price and accepted rail are disclosed by the authoritative payment challenge/provider plan before authorization;
- network, asset, amount and recipient must bind to the paid retry where the provider contract exposes those terms;
- a payment proof/token cannot be reused for a changed request;
- idempotent replay of the same valid request must not create a duplicate charge;
- concurrent duplicate requests must not independently settle;
- ambiguous settlement is reconciled rather than blindly retried;
- payment and fulfillment are tracked as separate states;
- paid-but-undelivered cases must enter a visible remedy/reconciliation state;
- sensitive payment signatures, wallet keys and facilitator secrets are never stored in analytics artifacts.

## Current machine-readable request scope

Subjects:

- country by ISO3 code;
- directional corridor by origin ISO3 and destination ISO3.

Supported adaptive topics include sovereign risk, macro risk, FX/external risk, sanctions/restrictions context, conflict/geopolitics, trade corridor context, energy/commodities, critical minerals, political/governance risk, banking/financial-system context, food/agriculture, natural hazards, hot topics, Risk Gate, signed Risk Object and GRI context.

Supported request intents include single-subject assessment, comparison, bounded ranking/filter, directional corridor, change-since, audit/provenance and Risk Gate evaluation.

Risk Gate context currently supports balanced/cautious/strict policy presets for treasury payment, vendor payment, agent payment and exposure-review contexts. The output remains advisory and non-executing.

## Response boundary

Geomacro supplies risk context and a non-executing Risk Gate decision. `execution_authorized=false` remains the product boundary. Output is not a substitute for sanctions screening, legal advice, counterparty due diligence or a guarantee of future events.

## Provider adapters

### Coinbase x402

The adapter uses the same Geomacro deliverability, idempotency and fulfillment contract as every other payment rail. Production availability is determined by the live runtime and required real-funds acknowledgements.

### Circle Gateway x402

The dedicated `/api/x402/circle/intelligence` adapter uses the same Geomacro deliverability, delivery-ledger, idempotency and reconciliation contract. Its prepared production network is Base mainnet with USDC, and the live Gateway verifying contract is resolved from Circle support metadata at runtime. The route fails closed unless all required launch/security acknowledgements are present.

### Nevermined

Integration maps provider verification and settlement to the same Geomacro delivery ledger. Production/live configuration remains governed by the coordinated activation contract and provider-specific runtime state.

### GOAT

GOAT production access remains dependent on merchant onboarding and is not a prerequisite for the Coinbase + Circle Gateway + Nevermined provider set.

## Machine discovery vocabulary

Supported discovery descriptions may include country risk, geopolitical risk, macroeconomic risk, treasury pre-flight risk context, cross-border corridor risk, supplier-country exposure context, geopolitical escalation context, portfolio geopolitical exposure context, signed Risk Objects and machine-readable risk evidence when those capabilities are supported by the current delivery contract.

Do not advertise autonomous execution, wallet custody, transaction signing, sanctions-screening replacement, counterparty due-diligence replacement, legal compliance, vessel routing or full logistics-path modelling.

## Growth and marketing boundary

Marketplace presence is distribution, not revenue. Non-production settlement evidence is technical validation, not revenue. Commercial revenue is counted only after a real-funds settlement is reconciled to the correct delivered Geomacro resource on an activated production rail.

Verified production milestones may generate private channel-specific marketing drafts. Automatic public publishing is disabled. Every external marketing post requires explicit owner approval, and customer/payer identity, raw requests and private source details remain excluded.
