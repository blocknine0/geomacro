# Geomacro Website Information Architecture

Status: commercial source of truth for the public website.

This document defines what each public route is responsible for, what it should not duplicate, and the intended buyer journey. It prevents the website from drifting back toward a prediction-market-first identity or mixing LIVE, PRIVATE PILOT, PRE-LAUNCH and TECHNICAL PROOF claims.

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
  |     +-- Agent Access & Plans
  |     |     +-- Free Explorer · LIVE
  |     |     +-- Pay per call · MAINNET PRE-LAUNCH
  |     |     +-- Professional intelligence · FOUNDING PILOT
  |     |     +-- API + Risk Gate · PRIVATE / FOUNDING PILOT
  |     |     +-- Institutional · CONTRACTED / PILOT-LED
  |     +-- Data & API
  |     +-- Risk Gate · PRIVATE PILOT
  |     +-- For Institutions
  |
  +-- Evidence and trust
  |     +-- Research
  |     +-- Documentation
  |     +-- About & Trust
  |     +-- Roadmap
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
- **TECHNICAL PROOF**: working implementation used to demonstrate engineering/integration capability, not the primary commercial product.
- **PLANNED**: roadmap intent only.
- **CONTRACTED / PILOT-LED**: availability depends on an agreed scope rather than public self-serve access.

Do not replace these with ambiguous labels such as "Soon" when a more exact status is known.

## Commercial access ladder

A public visitor should be able to understand the access model without knowing any payment protocol:

1. **Free Explorer**: public Risk Intelligence, three Risk Indices, Ask Geomacro, Research and methodology.
2. **Pay per call**: occasional governed machine intelligence for AI agents after deliberate mainnet activation. Prepared price: 0.02 USDC per successful paid call. The live HTTP 402 challenge/provider plan is authoritative.
3. **Professional intelligence**: deeper analytics/history/attribution and governed views. Founding package starts at 5,000 credits / 30 days.
4. **API + Risk Gate**: recurring governed machine delivery, signed Risk Objects and Risk Gate. Founding package starts at 20,000 credits / 30 days.
5. **Institutional**: contracted volume, coverage, controls and support. Current starting model uses a 100,000-credit monthly pool before contracted scaling.

A payment rail never expands product entitlement or source rights.

## Global navigation

### Primary desktop navigation

1. Intelligence
2. Risk Indices
3. Ask Geomacro
4. Agent Access
5. Risk Gate
6. Data & API
7. Research
8. For Institutions
9. Technical Proof dropdown

Desktop primary navigation should only render when it fits without destructive compression; narrower screens use the grouped mobile menu.

### Mobile navigation groups

- Intelligence products
- Reference
- Technical proof
- Account, only when relevant

### Wallet rule

A disconnected visitor should not see wallet connection as a primary action on public intelligence, Risk Indices, Agent Access, Risk Gate, Data/API, Research, Institutional, About, Roadmap, Contact or Docs pages.

Wallet connection belongs to explicit testnet/execution surfaces such as Prediction Markets, Arc/Onchain, Bridge & Swap, Portfolio and transaction flows. A user who is already connected may still see compact wallet state elsewhere.

## Route contracts

### `/` — Homepage

**Job:** make any reasonably informed public visitor understand Geomacro in roughly 40 seconds, then move that visitor to the right depth.

**Above-the-fold answer must communicate:**

- **what** Geomacro is: explainable geopolitical, macroeconomic and critical-mineral risk intelligence;
- **how** it works: evidence -> structure -> Risk Indices / context -> human or machine delivery;
- **who** it is for: traders/researchers, analysts, risk/treasury teams, developers and AI agents;
- **how to access it**: free public research, professional depth, governed API/Risk Gate, mainnet pay-per-call when deliberately enabled.

**Do not:** make markets/onchain the hero, require a wallet, bury the current product status, or imply mainnet pay-per-call is live before it is actually activated.

### `/intelligence` — Live Intelligence

**Job:** professional current-intelligence workspace.

Keep current/updating state, search/filter/sort, current events, source/time context, clear degraded states and next steps into Risk Indices, Ask Geomacro, Agent Access or institutional workflows.

### `/global-risk` — Risk Indices

**Job:** canonical public presentation of the three separate current indices:

- Geopolitical Risk Index
- Macroeconomic Risk Index
- Critical Minerals Risk Index

Keep verified snapshot state, exact score/change, attribution, evidence coverage, methodology, hashes/proof and historical context. Historical combined GRI remains lineage/audit context, not a second live headline product.

### `/ask-geomacro` — Ask Geomacro

**Job:** grounded conversational access to stored Geomacro intelligence and current Risk Indices.

Do not imply unrestricted web search, unsupported certainty or autonomous trading advice.

### `/agent-access` — Agent Access & Plans

**Job:** explain the commercial ladder for traders, professionals, developers and AI agents on one page.

**Must include:**

- MAINNET PRE-LAUNCH status until real-funds activation is deliberately completed;
- Free Explorer vs pay per call vs Professional vs API + Risk Gate vs Institutional;
- prepared 0.02 USDC/call economics with the live HTTP 402 challenge/provider plan as payment authority;
- free deliverability check before a chargeable request;
- clear example request;
- explicit non-investment-advice and non-execution boundary;
- `execution_authorized=false` for Risk Gate context;
- customer-controlled identity, permissions, policy, funds and execution.

**Do not:** show a purchase CTA while production funds are disabled, call the service live before launch, imply every topic/country is always deliverable or imply paying authorizes a trade/payment.

### `/risk-gate` — Risk Gate

**Job:** explain the B2B decision product and convert appropriate visitors into Private Pilot conversations.

Keep PRIVATE PILOT label, country + directional-corridor current scope, signed Risk Object/pre-flight architecture, customer-policy separation, implemented controls, limitations and pilot CTA.

### `/data-api` — Data & API

**Job:** explain governed machine-readable delivery and exactly what access exists today.

Keep public-vs-commercial boundary, entitlement semantics, structural endpoint, Risk Object fields, source-rights boundary and links to Agent Access for plan/payment selection.

### `/institutional` — For Institutions

**Job:** translate Geomacro into real buyer workflows and contracted/founding-pilot scope.

Keep treasury/payments/risk/supply-chain/agent use cases, concrete pilot workflow, current boundaries and direct contact CTA. Do not imply finalized enterprise SLA, unlimited coverage or customer adoption evidence.

### `/research` — Research & Methodology

**Job:** public research hub and gateway to evidence/methodology detail.

Keep Risk Indices methodology/proof/reproducibility/change attribution/source governance and research limitations. Do not duplicate all Docs content or overstate predictive validation.

### `/docs` and `/docs/*` — Documentation

**Job:** canonical deep technical/product reference.

Docs must use the same access ladder, status vocabulary, current three-index product identity, pay-per-call pre-launch boundary and Risk Gate non-execution boundary as the website.

### `/about` — About & Trust

**Job:** explain company/product identity, transparency standard, current product statuses, privacy posture and important limitations.

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

**Job:** one low-friction path for pilots, professional access, technical questions and strategic conversations.

Canonical email: `contact@geomacro.live`.

### Technical-proof routes

`/testnet-access`, `/demo`, `/pipeline`, `/arena`, `/onchain` and `/bridge-swap` are engineering/integration proof. Prediction markets remain permanently Testnet-only. These routes must not be presented as the primary commercial product or as proof that production mainnet settlement is already live.

### Legacy routes

- `/feed` -> `/intelligence`
- `/bridge` -> `/bridge-swap`

Redirect-only routes must not appear in the sitemap as canonical pages.

## Commercial conversion paths

### Trader / individual researcher

`Home -> Intelligence / Risk Indices / Ask -> Agent Access -> Free or Professional path`

### AI agent / developer

`Home -> Agent Access -> free deliverability check / Data & API -> Docs -> commercial activation`

### Institutional buyer

`Home -> For Institutions -> Risk Gate / Data & API -> Contact`

### Technical due diligence

`Home / About -> Docs / Research -> Pipeline / Technical Proof -> GitHub`

## Final release checks

Before a commercial website release:

1. every primary nav target builds and is reachable;
2. `/agent-access` is in nav, footer, sitemap and machine-readable product references;
3. homepage communicates what/how/who/access in roughly one screen;
4. no public-intelligence or commercial-information route requires wallet connection;
5. all redirect-only routes are excluded from sitemap canonical URLs;
6. public Risk Indices remain the current three separate indices;
7. Risk Gate remains PRIVATE PILOT and non-authorizing until production evidence changes that status;
8. pay-per-call remains MAINNET PRE-LAUNCH until real-funds activation is deliberately completed;
9. Arc/Circle/markets remain TECHNICAL PROOF where applicable;
10. contact identity is `contact@geomacro.live`;
11. canonical/OG metadata use `https://geomacro.live`;
12. Product CI, production build, route generation and prelaunch-lock checks pass.
