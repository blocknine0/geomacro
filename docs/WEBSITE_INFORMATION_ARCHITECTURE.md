# Geomacro Website Information Architecture

Status: commercial source of truth for the public website.

This document defines what each public route is responsible for, what it should not duplicate, and the intended buyer journey. It prevents the website from drifting back toward a prediction-market-first identity or mixing LIVE, PRIVATE PILOT, MAINNET PRE-LAUNCH and TECHNICAL PROOF claims.

## Product hierarchy

```text
Geomacro
  |
  +-- Public intelligence · LIVE
  |     +-- Intelligence
  |     +-- Geopolitical Risk Index
  |     +-- Macroeconomic Risk Index
  |     +-- Critical Minerals Risk Index
  |     +-- Ask Geomacro
  |
  +-- Commercial access
  |     +-- Access & Pricing
  |     |     +-- Free Explorer · LIVE
  |     |     +-- Pay per call · MAINNET PRE-LAUNCH
  |     |     +-- Professional intelligence · FOUNDING PILOT
  |     |     +-- API + Risk Gate · PRIVATE / FOUNDING PILOT
  |     |     +-- Institutional · CONTRACTED / PILOT-LED
  |     +-- Risk Gate · PRIVATE PILOT
  |     +-- For Institutions
  |
  +-- Resources
  |     +-- Data & API
  |     +-- Research
  |     +-- Documentation
  |     +-- About & Trust
  |     +-- Roadmap
  |     +-- Contact
  |
  +-- Technical Proof
        +-- Testnet API / agentic-commerce demo
        +-- Data Pipeline
        +-- Prediction Markets · permanent Testnet-only
        +-- Arc / Onchain
        +-- Bridge & Swap
```

Prediction markets, Arc, Circle and wallet execution are secondary Technical Proof. They must never lead the primary commercial navigation or homepage identity.

## Status vocabulary

Use these labels consistently:

- **LIVE**: deployed public capability users can actually use now.
- **FOUNDING PILOT / PRIVATE PILOT**: implemented capability available only through scoped access; not anonymous general availability.
- **MAINNET PRE-LAUNCH**: production path is prepared but real-money activation remains disabled until launch gates and explicit owner authorization are complete.
- **CONTRACTED / PILOT-LED**: availability depends on an agreed customer scope rather than public self-serve access.
- **TECHNICAL PROOF**: working implementation used to demonstrate engineering/integration capability, not the primary commercial product.
- **PLANNED**: roadmap intent only.

Do not replace these with ambiguous labels such as "Soon" when a more exact status is known.

## Commercial access ladder

A public visitor should be able to understand the access model without knowing any payment protocol:

1. **Free Explorer**: public Risk Intelligence, three Risk Indices, Ask Geomacro, Research and methodology. Cost: Free.
2. **Pay per call**: occasional governed machine intelligence for AI agents after deliberate mainnet activation. Prepared price: 0.02 USDC per successful paid call. The live HTTP 402 challenge/provider plan is authoritative.
3. **Professional intelligence**: deeper analytics/history/attribution and governed views. Starting usage allowance: 5,000 credits / 30 days. Commercial fee is agreed before activation while self-serve pricing is not live.
4. **API + Risk Gate**: recurring governed machine delivery, signed Risk Objects and Risk Gate. Starting usage allowance: 20,000 credits / 30 days. Commercial fee is agreed before activation.
5. **Institutional**: contracted volume, coverage, controls and support. Current starting usage pool: 100,000 credits / month, followed by contracted scaling and commercial terms.

Credit pools are usage allowances, not public monetary list prices. A payment rail never expands product entitlement, source rights or execution authority.

## Global navigation

### Primary desktop navigation

1. Intelligence
2. Risk Indices
3. Ask Geomacro
4. Access & Pricing
5. Risk Gate
6. For Institutions
7. Resources dropdown
8. Technical Proof dropdown

Supporting reference material belongs inside **Resources** rather than competing with the primary product journey. Resources contains Data & API, Research, Documentation, About & Trust, Roadmap and Contact.

Desktop primary navigation should render only when it fits without destructive compression; narrower screens use grouped mobile navigation.

### Mobile navigation groups

- Product
- Resources
- Technical proof
- Account, only when relevant

### Wallet rule

A disconnected visitor should not see wallet connection as a primary action on public intelligence, Risk Indices, Access & Pricing, Risk Gate, Data/API, Research, Institutional, About, Roadmap, Contact or Docs pages.

Wallet connection belongs to explicit testnet/execution surfaces such as Prediction Markets, Arc/Onchain, Bridge & Swap, Portfolio and transaction flows. A user who is already connected may still see compact wallet state elsewhere.

## Route contracts

### `/` — Homepage

**Job:** make any reasonably informed visitor understand Geomacro in roughly 40 seconds, then move that visitor to the right depth.

**Above-the-fold answer must communicate:**

- **what** Geomacro is: explainable geopolitical, macroeconomic and critical-mineral risk intelligence;
- **how** it works: evidence -> structure -> Risk Indices / context -> human or machine delivery;
- **who** it is for: traders/researchers, analysts, risk/treasury teams, developers and AI agents;
- **how to access it**: free public research, professional depth, governed API/Risk Gate, mainnet pay-per-call when deliberately enabled.

The homepage is a comprehension and conversion surface, not a procurement dossier. Detailed coverage-census evidence belongs on due-diligence surfaces such as Risk Gate, Data & API, Research, Institutional and About & Trust.

**Do not:** make markets/onchain the hero, require a wallet, show dense procurement evidence above the hero, bury current product status, or imply mainnet pay-per-call is live before activation.

### `/intelligence` — Live Intelligence

**Job:** professional current-intelligence workspace.

Keep current/updating state, search/filter/sort, current events, source/time context, clear degraded states and next steps into Risk Indices, Ask Geomacro, Access & Pricing or institutional workflows.

### `/global-risk` — Risk Indices

**Job:** canonical public presentation of the three separate current indices:

- Geopolitical Risk Index
- Macroeconomic Risk Index
- Critical Minerals Risk Index

Keep verified snapshot state, exact score/change, attribution, evidence coverage, methodology, hashes/proof and historical context. Historical combined GRI remains lineage/audit context, not a second live headline product.

### `/ask-geomacro` — Ask Geomacro

**Job:** grounded conversational access to stored Geomacro intelligence and current Risk Indices.

Do not imply unrestricted web search, unsupported certainty or autonomous trading advice.

### `/agent-access` — Access & Pricing

**Job:** explain the commercial access ladder for traders, professionals, developers and AI agents on one page.

**Must include:**

- MAINNET PRE-LAUNCH status until real-funds activation is deliberately completed;
- Free Explorer vs pay per call vs Professional vs API + Risk Gate vs Institutional;
- prepared 0.02 USDC/call economics with the live HTTP 402 challenge/provider plan as payment authority;
- Professional/API/institutional credits clearly described as usage allowances rather than monetary list prices;
- free deliverability check before a chargeable machine request;
- clear example request;
- explicit non-investment-advice and non-execution boundary;
- `execution_authorized=false` for Risk Gate context;
- customer-controlled identity, permissions, policy, funds and execution.

**Do not:** show a purchase CTA while production funds are disabled, call the service live before launch, imply every topic/country is always deliverable, present credit allowances as subscription prices, or imply paying authorizes a trade/payment.

### `/risk-gate` — Risk Gate

**Job:** explain the B2B decision-context product and convert appropriate visitors into Private Pilot conversations.

Keep PRIVATE PILOT label, country + directional-corridor current scope, signed Risk Object/pre-flight architecture, customer-policy separation, implemented controls, limitations and pilot CTA.

### `/data-api` — Data & API

**Job:** explain governed machine-readable delivery and exactly what access exists today.

Keep public-vs-commercial boundary, entitlement semantics, structural endpoint, Risk Object fields, source-rights boundary and links to Access & Pricing for commercial path selection.

### `/institutional` — For Institutions

**Job:** translate Geomacro into real buyer workflows and contracted/founding-pilot scope.

Keep treasury/payments/risk/supply-chain/agent use cases, concrete pilot workflow, current boundaries and direct contact CTA. Do not imply finalized enterprise SLA, unlimited coverage or customer adoption evidence.

### `/research` — Research & Methodology

**Job:** public research hub and gateway to evidence/methodology detail.

Keep Risk Indices methodology/proof/reproducibility/change attribution/source governance and research limitations. Detailed coverage evidence is appropriate here because the visitor is explicitly evaluating methodology and proof.

### `/docs` and `/docs/*` — Documentation

**Job:** canonical deep technical/product reference.

Docs must use the same access ladder, status vocabulary, current three-index product identity, pay-per-call pre-launch boundary and Risk Gate non-execution boundary as the website.

### `/about` — About & Trust

**Job:** explain company/product identity, transparency standard, current product statuses, privacy posture and important limitations. Due-diligence evidence can live here without cluttering the homepage.

Do not make unsupported certification, independent-audit, customer-adoption or SLA claims.

### `/roadmap` — Roadmap

**Job:** show execution order and release gates, not a marketing wishlist.

Current order:

1. public intelligence foundation;
2. commercial hardening + pre-launch machine access;
3. coordinated commercial launch after source-rights/security/operations gates;
4. production expansion after evidence and customer validation.

Mainnet activation is a controlled release action, not a development milestone automatically triggered by code completion.

### `/contact` — Contact

**Job:** one low-friction path for controlled professional access, pilots, technical questions and strategic conversations.

Canonical email: `contact@geomacro.live`.

### Technical-proof routes

`/testnet-access`, `/demo`, `/pipeline`, `/arena`, `/onchain` and `/bridge-swap` are engineering/integration proof. Prediction markets remain permanently Testnet-only. These routes must not be presented as the primary commercial product or as proof that production mainnet settlement is already live.

### Legacy routes

- `/feed` -> `/intelligence`
- `/bridge` -> `/bridge-swap`

Redirect-only routes must not appear in the sitemap as canonical pages.

## Commercial conversion paths

### Trader / individual researcher

`Home -> Intelligence / Risk Indices / Ask -> Access & Pricing -> Free or Professional path`

### AI agent / developer

`Home -> Access & Pricing -> free deliverability check / Data & API -> Docs -> commercial activation`

### Institutional buyer

`Home -> For Institutions -> Risk Gate / Data & API -> Contact`

### Technical due diligence

`Home / About -> Docs / Research -> Pipeline / Technical Proof -> GitHub`

## Final release checks

Before a commercial website release:

1. every primary nav target builds and is reachable;
2. `/agent-access` is represented as Access & Pricing in nav/footer and appears in sitemap/machine-readable product references;
3. homepage communicates what/how/who/access in roughly one screen;
4. procurement/coverage proof is absent from the homepage but available on appropriate due-diligence surfaces;
5. no public-intelligence or commercial-information route requires wallet connection;
6. all redirect-only routes are excluded from sitemap canonical URLs;
7. public Risk Indices remain the current three separate indices;
8. Risk Gate remains PRIVATE PILOT and non-authorizing until verified production evidence changes that status;
9. pay-per-call remains MAINNET PRE-LAUNCH until real-funds activation is deliberately completed;
10. Arc/Circle/markets remain TECHNICAL PROOF where applicable and prediction markets remain Testnet-only;
11. contact identity is `contact@geomacro.live`;
12. canonical/OG metadata use `https://geomacro.live`;
13. Product CI, production build, route generation and prelaunch-lock checks pass.
