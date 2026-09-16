# Geomacro Agent Commerce

Status: PRE-LAUNCH. Real-money settlement is disabled on every provider until the applicable coordinated official launch.

Geomacro exposes bounded geopolitical and macro risk intelligence to software and AI agents. Payment/discovery providers are adapters around one canonical intelligence contract; they do not fork the underlying methodology or widen data entitlement.

## Human-readable access

Canonical commercial access and pricing page:

- `https://geomacro.live/agent-access`

That page explains the current access ladder for Free Explorer, pay-per-call agents, Professional intelligence, API + Risk Gate and Institutional use. Static website pricing is informational; the live payment challenge or approved provider plan remains authoritative for machine-payment terms.

## Canonical machine surfaces

- Agent discovery: `/.well-known/geomacro-agent.json`
- Commerce catalog: `/.well-known/geomacro-commerce.json`
- No-charge deliverability check: `POST /api/x402/risk/availability`
- Coinbase pre-launch adaptive intelligence: `POST /api/x402/intelligence`
- Circle Gateway pre-launch adaptive intelligence: `POST /api/x402/circle/intelligence`
- Nevermined sandbox adaptive intelligence: `POST /api/x402/nevermined/intelligence`
- Human-readable product documentation: `/agent-access`, `/data-api` and `/risk-gate`

The payment challenge or provider plan is the authoritative source for the price and accepted payment terms. A static discovery document is never authoritative pricing.

## Pre-launch rule

The initial commercial launch cohort is Coinbase x402, Circle Gateway x402 and Nevermined. All three remain non-production/disabled until all common acceptance gates pass and the exact release candidate receives explicit owner authorization.

Circle's prepared production path is Base-mainnet USDC only and is locked behind the global launch acknowledgement, the Circle-specific acknowledgement, central real-funds security controls and runtime Circle Gateway support discovery. Arc mainnet is not enabled by this package.

GOAT Testnet3 remains a technical proof path. GOAT mainnet is deliberately excluded from the initial launch cohort because mainnet merchant access requires manual provider application/approval. Its production runtime locks remain in place, and it can be added only in a later coordinated release after that onboarding is complete.

A provider cannot be activated early merely because its integration finishes first. Within an approved launch cohort, all required common gates must pass before any production-funds switch is enabled.

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

In the initial launch cohort. Base Sepolia is used for pre-launch acceptance. Base mainnet remains disabled behind the coordinated Geomacro launch gate and the provider-specific real-USDC acknowledgement.

### Circle Gateway x402

In the initial launch cohort. The dedicated `/api/x402/circle/intelligence` adapter uses the same Geomacro deliverability, delivery-ledger, idempotency and reconciliation contract. Its prepared production network is Base mainnet with USDC, and the live Gateway verifying contract is resolved from Circle support metadata at runtime. The route fails closed unless all launch/security acknowledgements are present. Arc mainnet remains disabled.

### Nevermined

In the initial launch cohort. Integration uses the Nevermined sandbox during pre-launch and maps payment verification/settlement to the same Geomacro delivery ledger. Production/live configuration remains disabled until the coordinated launch.

### GOAT

GOAT Testnet3 remains technical proof only. GOAT mainnet is deferred from the initial commercial launch cohort pending manual merchant application/approval. The existing mainnet production locks remain fail-closed and are not a prerequisite for the Coinbase + Circle Gateway + Nevermined launch cohort.

## Machine discovery vocabulary

Supported discovery descriptions may include country risk, geopolitical risk, macroeconomic risk, treasury pre-flight risk context, cross-border corridor risk, supplier-country exposure context, geopolitical escalation context, portfolio geopolitical exposure context, signed Risk Objects and machine-readable risk evidence when those capabilities are supported by the current delivery contract.

Do not advertise autonomous execution, wallet custody, transaction signing, sanctions-screening replacement, counterparty due-diligence replacement, legal compliance, vessel routing or full logistics-path modelling.

## Growth and marketing boundary

Marketplace presence is distribution, not revenue. Testnet/sandbox settlement is technical evidence, not revenue. Commercial revenue is counted only after a real-funds settlement is reconciled to the correct delivered Geomacro resource on an activated production rail.

Verified production milestones may generate private channel-specific marketing drafts. Automatic public publishing is disabled. Every external marketing post requires explicit owner approval, and customer/payer identity, raw requests and private source details remain excluded.
