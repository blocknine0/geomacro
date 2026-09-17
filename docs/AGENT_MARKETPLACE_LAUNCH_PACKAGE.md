# Geomacro agent marketplace launch package

Status: **PRE-LAUNCH HOLD**

This package prepares Geomacro for coordinated distribution without publishing or activating a real-money service early. The approved initial production cohort is Coinbase x402 + Circle Gateway x402 + Nevermined. GOAT mainnet is deferred until manual merchant onboarding is complete.

## Canonical provider identity

**Service name:** Geomacro Risk Intelligence

**Website:** https://geomacro.live

**Contact:** contact@geomacro.live

**Short description:**

> Machine-readable geopolitical and macro risk intelligence for country, directional-corridor and financial-agent pre-flight decisions.

**Long description:**

> Geomacro provides source-governed geopolitical and macro risk intelligence to software and AI agents. Requests are checked for current deliverability, freshness and commercial source eligibility before payment is requested. Paid delivery can include structured risk context, signed Risk Objects and non-executing Risk Gate decision context. Geomacro does not custody funds, sign customer transactions or replace sanctions screening, legal advice or counterparty due diligence.

## Canonical machine surfaces

- Commerce catalog: `https://geomacro.live/.well-known/geomacro-commerce.json`
- Agent card: `https://geomacro.live/.well-known/geomacro-agent.json`
- LLM discovery: `https://geomacro.live/llms.txt`
- Agent-commerce docs: `https://geomacro.live/agent-commerce.md`
- Free deliverability check: `POST https://geomacro.live/api/x402/risk/availability`
- Coinbase x402 adaptive resource: `POST https://geomacro.live/api/x402/intelligence`
- Circle Gateway x402 adaptive resource: `POST https://geomacro.live/api/x402/circle/intelligence`
- Nevermined adaptive resource: `POST https://geomacro.live/api/x402/nevermined/intelligence`

Static discovery documents do not set the payable price. The actual provider payment challenge or configured provider plan is authoritative.

## Approved discovery vocabulary

Use these terms where a registry supports tags, keywords or semantic descriptions:

- geopolitical risk
- macroeconomic risk
- country risk
- sovereign risk
- treasury pre-flight risk context
- cross-border corridor risk
- supplier-country exposure context
- geopolitical escalation context
- portfolio geopolitical exposure context
- signed Risk Object
- machine-readable risk evidence
- Risk Gate
- AI-agent risk intelligence

Do not market Geomacro as autonomous execution, wallet custody, transaction signing, sanctions-screening replacement, legal advice, counterparty-due-diligence replacement, vessel routing or full logistics-path modelling.

## Launch-day distribution sequence

### 1. Coinbase Bazaar

The resource emits Bazaar discovery metadata, but payment success and metadata emission are not treated as proof that the catalog has indexed the resource. After owner-authorized production activation, complete one capped reconciled smoke purchase, then query Coinbase's current Bazaar discovery/search surfaces. Mark the listing verified only when the exact Geomacro resource is actually observed with the expected endpoint, description, schema and payment terms.

If the paid endpoint works but Bazaar visibility is absent, keep the marketplace state unverified and do not publicly claim that Geomacro is listed.

### 2. Coinbase Agentic.Market

Treat downstream visibility as dependent on observed Bazaar visibility, not as an automatic consequence of a successful payment. Verify the exact production resource and metadata independently before making any listing claim. Do not create a conflicting second listing with different copy.

### 3. x402.new

Verify propagation only after the production Bazaar resource is actually observable. Do not infer directory presence from a successful payment or from a local discovery document alone.

### 4. Circle Agent Marketplace

Use Circle's current provider-listing submission path only after the dedicated Circle production endpoint is explicitly activated and returns a valid production 402. Preferred category for the current product is `FINANCIAL_ANALYSIS` unless Circle's submission taxonomy changes before launch.

Submit the canonical provider identity above and the dedicated Circle endpoint `https://geomacro.live/api/x402/circle/intelligence`. After approval/listing, query Circle's Discovery API and verify the returned resource URL, network, USDC asset, amount, recipient and provider metadata against Geomacro's own authoritative payment contract before marking the listing verified.

The prepared Circle settlement path is Base-mainnet USDC only. Arc mainnet remains disabled. The runtime must discover the currently supported Circle Gateway verifying contract before advertising or accepting payment.

### 5. x402scan

First run x402scan's origin/schema discovery without registering. Review exactly which routes are detected. Register only approved production x402 endpoints after the launch gate is open. Do not register Testnet3, Base Sepolia or sandbox routes as commercial services.

### 6. x402-list

After approved production endpoints return valid 402 challenges, submit:

- base URL: `https://geomacro.live`
- service name: `Geomacro Risk Intelligence`
- website: `https://geomacro.live`
- contact: `contact@geomacro.live`
- endpoint paths: `/api/x402/intelligence` and `/api/x402/circle/intelligence` when each is live and verified
- description: use the canonical short/long copy above
- category: resolve against the directory's live category list on submission day rather than hard-coding a stale category

The directory probes endpoints and then performs human review. Record the submission ID/status as operational evidence, but do not count a pending or approved listing as revenue.

### 7. Nevermined registry

Complete sandbox acceptance first. At coordinated launch, configure the approved production plan and production endpoint, then submit/publish the provider listing using the same product description and machine-readable scope. Verify the listing exposes the correct plan/payment terms and does not widen the Geomacro entitlement beyond the canonical intelligence contract.

## Deferred distribution

### GOAT mainnet

Not part of the initial launch cohort. GOAT Testnet3 remains technical proof. Mainnet listing/activation waits for manual merchant application and approval, then goes through a later coordinated release with the existing mainnet locks still enforced.

### pay.sh / pay-skills

Deferred for the initial launch. The current provider-publication contract requires paid endpoints on Solana mainnet accepting USDC or USDT. Geomacro will not add a new Solana settlement rail merely to gain directory coverage before real demand justifies the added operational/security surface.

## Verification evidence required per listing

A registry becomes `verified` internally only after Geomacro records:

1. canonical production resource URL;
2. observed listing URL or public discovery identifier;
3. observed network/asset/payment terms where exposed;
4. metadata parity with the approved service description;
5. non-execution boundary retained;
6. timestamp of verification;
7. evidence/reference hash or public reference;
8. no customer/payer identity in public marketing evidence.

Once verified, the owner-only growth queue may generate a private marketing draft. The listing itself never triggers automatic public posting.

## What remains disabled before launch

- real-money production funds;
- Coinbase Base mainnet production acknowledgement;
- Circle production environment and Circle mainnet acknowledgement;
- Arc mainnet for the Circle path;
- Nevermined production/live facilitator use;
- GOAT mainnet commercial fulfillment;
- public marketplace submissions that would prematurely announce the production service;
- automatic social publishing.
