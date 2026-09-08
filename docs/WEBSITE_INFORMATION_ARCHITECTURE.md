# Geomacro Website Information Architecture

Status: commercial source of truth for the public website.

This document defines what each public route is responsible for, what it should not duplicate, and the intended buyer journey. It exists to prevent the website drifting back toward a prediction-market-first identity or mixing Live, Private Pilot, planned and Technical Proof claims.

## Product hierarchy

```text
Geomacro
  |
  +-- Public intelligence
  |     +-- Intelligence
  |     +-- Global Risk Index
  |     +-- Ask Geomacro
  |
  +-- Commercial delivery
  |     +-- Risk Gate · Private Pilot
  |     +-- Data & API · Public + Private Pilot
  |     +-- For Institutions · Early Access / pilot workflow
  |
  +-- Evidence and trust
  |     +-- Research
  |     +-- Documentation
  |     +-- About & Trust
  |     +-- Roadmap
  |
  +-- Technical Proof
        +-- Agentic Commerce Demo · public test sandbox
        +-- Data Pipeline
        +-- Prediction Markets
        +-- Arc / Onchain
        +-- Bridge & Swap
```

Prediction markets, Arc, Circle and wallet execution are secondary Technical Proof. The Agentic Commerce Demo is also a technical demonstration of the Private Pilot architecture, not a claim that Risk Gate is generally available in production. These surfaces must never displace the primary intelligence-first identity.

## Status vocabulary

Use these labels consistently:

- **LIVE**: deployed public capability users can actually use now.
- **PRIVATE PILOT**: implemented capability available only through scoped pilot access; not generally available production service.
- **COMMERCIAL DIRECTION**: planned/being built professional capability; do not imply current availability.
- **TECHNICAL PROOF**: working implementation used to demonstrate engineering/integration capability, not the primary commercial product.
- **PLANNED**: roadmap intent only.

Do not replace these with ambiguous labels such as "Soon" when a more exact status is known.

## Global navigation

### Primary desktop navigation

1. Intelligence
2. Global Risk Index
3. Risk Gate
4. Ask Geomacro
5. Data & API
6. Research
7. For Institutions
8. Technical Proof dropdown

Desktop primary navigation should only render when it fits without compression; narrower screens use the grouped mobile menu.

### Mobile navigation groups

- Intelligence products
- Reference
- Technical proof
- Account, only when relevant

The Agentic Commerce Demo belongs under Technical Proof and is also linked directly from Risk Gate. Do not add a second top-level primary product identity solely for the demo.

### Wallet rule

A disconnected visitor should not see wallet connection as a primary action on public intelligence, GRI, Risk Gate, Data/API, Research, Institutional, About, Roadmap, Contact, Docs or the free `/demo` browser sandbox.

Wallet connection belongs to explicit testnet/execution surfaces such as Prediction Markets, Arc/Onchain, Bridge & Swap, Portfolio and transaction flows. A user who is already connected may still see compact wallet state elsewhere. Agent x402 payment happens through the machine endpoint and Circle-compatible agent tooling; the browser demo itself remains wallet-free.

## Route contracts

### `/` — Homepage

**Job:** explain Geomacro in under one screen, prove that the product is real, then move the right visitor toward the appropriate product or pilot.

**Order:**

1. intelligence-first hero + three primary CTAs;
2. short Observe → Structure → Score & explain → Deliver flow;
3. live Global Risk Index proof;
4. product surfaces and exact availability states;
5. Risk Gate commercial wedge;
6. buyer/use-case fit;
7. Ask Geomacro sample interaction;
8. secondary Technical Proof links;
9. research/docs/trust references.

**Do not:** make markets/onchain the hero, require a wallet, repeat the entire Institutional page, or turn the homepage into full technical documentation.

### `/intelligence` — Live Intelligence

**Job:** professional current-intelligence workspace.

**Keep:** live/updating state, search/filter/sort, current events, highest risk, movement/emerging/fading views when supported, source/time context, GRI sidebar/context, clear empty/degraded states.

**Primary next steps:** open an event, inspect GRI, ask a grounded question, or move to institutional/Risk Gate workflows.

**Do not:** duplicate full GRI methodology or sell testnet markets as the primary value.

### `/global-risk` — Global Risk Index

**Job:** canonical public GRI score, history, composition, evidence/confidence and proof/verification surface.

**Keep:** verified snapshot state, exact score/change, attribution, evidence coverage, methodology, hashes/proof and historical context.

**Primary next steps:** Intelligence, GRI architecture, Research/Docs.

**Do not:** describe GRI as a probability, treat missing evidence as zero risk, or include Crypto as a current v1.2 scoring domain.

### `/risk-gate` — Risk Gate

**Job:** explain the first commercial B2B decision product and convert appropriate visitors into Private Pilot conversations.

**Keep:** PRIVATE PILOT label, country + directional corridor current scope, signed GRO/pre-flight architecture, customer-policy separation, implemented decision outputs, controls, limitations, live-demo link and pilot CTA.

**Primary CTAs:** run the public demo or discuss a Private Pilot.

**Do not:** claim GA, production SLA, full logistics-route modelling, autonomous transaction authorization or event-specific Risk Objects as current pilot scope. Current implemented decision outputs are `CONTINUE`, `REDUCE_LIMIT`, `REQUIRE_APPROVAL` and `PAUSE`; do not add conceptual outputs to the public list until the contract actually supports them.

### `/demo` — Agentic Commerce Demo · Technical Proof

**Job:** let external builders, agent projects, reviewers and prospective design partners test the Risk Gate resource without a sales call, inspect the machine response and give specific feedback.

**Keep:**

1. a free wallet-free browser pre-flight;
2. a small allowlisted country/corridor set while coverage is being validated;
3. current signed Risk Object output;
4. current GRI context when verifiable;
5. structural evidence shown separately from GRI v1.2;
6. exact `execution_authorized=false` boundary;
7. Circle x402 / USDC paid machine-access instructions;
8. links to CCTP, Circle App Kit, x402 and Risk Gate code proof;
9. privacy-minimized tester feedback;
10. machine-readable OpenAPI discovery at `/openapi.yaml`.

**Machine endpoints:**

- `POST /api/demo/preflight` — free public sandbox endpoint;
- `POST /api/agent/risk` — x402-paid test endpoint;
- `POST /api/demo/feedback` — tester feedback endpoint.

**Commercial boundary:** the x402 price is a testnet demo price, not institutional pricing. Structural evidence is `EVIDENCE_ONLY_NOT_IN_GRI_V1_2` until a separately versioned methodology intentionally incorporates it. The demo is not an SLA, security certification, compliance decision or autonomous payment authorization.

**Do not call the x402 path live** until seller configuration, migration, deployment and an end-to-end 402 → USDC payment → paid response test have all passed.

### `/ask-geomacro` — Ask Geomacro

**Job:** grounded conversational access to stored Geomacro intelligence and canonical GRI context.

**Keep:** example questions, evidence-grounding boundary, sources/evidence in answers, unavailable/weak-evidence state.

**Primary next steps:** Intelligence, GRI, Research.

**Do not:** imply unrestricted web search or unsupported certainty.

### `/data-api` — Data & API

**Job:** explain machine-readable delivery and exactly what access exists today.

**Order:**

1. PUBLIC + PRIVATE PILOT hero;
2. availability matrix: Live Public / Private Pilot / Commercial Direction;
3. conceptual Risk Object fields;
4. Private Pilot controls;
5. current scope and non-goals;
6. pilot CTA + technical docs.

**Do not:** publish a conceptual JSON example as if it overrides the canonical code schema, imply anonymous GA API access, or imply customer transaction custody/execution.

### `/institutional` — For Institutions

**Job:** translate Geomacro into real buyer workflows and founding-pilot scope.

**Keep:** live GRI/context where useful, current top risks, treasury/payments/risk/supply-chain/agent use cases, concrete pilot workflow, what a founding pilot can include, current boundaries and direct contact CTA.

**Primary CTA:** discuss founding pilot.

**Do not:** duplicate every research detail or make product pricing/SLAs look finalized before they are.

### `/research` — Research & Methodology

**Job:** public research hub and gateway to evidence/methodology detail.

**Keep:** GRI methodology, proof/reproducibility, change attribution, source governance/reliability, research standard, links to current GRI and 52-page Docs.

**Do not:** duplicate all Docs content or overstate predictive validation.

### `/docs` and `/docs/*` — Documentation

**Job:** canonical deep technical/product reference.

**Keep:** 52-page manifest, stable navigation, exact methodology/status boundaries, architecture/code concepts, source governance, determinism, Risk Objects/Risk Gate, commercial availability and Technical Proof sections.

**Do not:** let documentation terminology become a second product identity or silently diverge from implemented versions.

### `/about` — About & Trust

**Job:** explain company/product identity, transparency standard, current product statuses, privacy posture and important limitations.

**Do not:** make unsupported certification/audit claims or imply open-source rights beyond the repository licence.

### `/roadmap` — Roadmap

**Job:** show execution order and release gates, not a marketing wishlist.

**Keep order:** commercial/source-of-truth hardening → data/GRI → Risk Objects/Risk Gate → security/resilience → Early Access/commercial package → permanent demo/deck → design partners/paid pilots → broader production expansion.

Grant-specific/public technical demos may be shipped earlier when narrowly scoped and accurately labelled. They do not replace the later permanent commercial demo gate.

**Do not:** present planned capabilities as already live.

### `/contact` — Contact

**Job:** one low-friction path for pilots, technical questions and strategic conversations.

**Canonical email:** `contact@geomacro.live`.

### `/pipeline` — Data Pipeline · Technical Proof

**Job:** expose technical processing architecture and engineering evidence for sophisticated visitors.

**Must carry Technical Proof context.** Link back to primary Intelligence/GRI products.

### `/arena` — Prediction Markets · Technical Proof

**Job:** preserve the testnet prediction-market application/feedback layer and technical history.

**Must carry Technical Proof/Testnet context.** It is not the homepage product identity.

### `/onchain` — Arc / Onchain · Technical Proof

**Job:** show programmable-finance/onchain implementation evidence.

**Must carry Technical Proof/Testnet context.** No general production settlement claim.

### `/bridge-swap` — Bridge & Swap · Technical Proof

**Job:** show Circle/Arc bridge and swap implementation on supported testnet rails.

**Must carry Technical Proof/Testnet context.** Wallet connection is appropriate here.

### `/portfolio` and transaction/account routes

**Job:** user-specific technical/testnet account state.

These are not primary commercial navigation items. Only surface Portfolio in global navigation when a wallet is connected.

### Legacy routes

- `/feed` → redirect permanently in product terms to `/intelligence` while preserving old links.
- `/bridge` → redirect to `/bridge-swap`.

Redirect-only routes must not appear in the sitemap as canonical pages.

## Content density rules

- Homepage: concise commercial overview; roughly one decision per section.
- Product pages: enough detail to understand value, status, workflow and next action without reading Docs.
- Demo: interactive proof first, code/machine integration second, feedback last; do not turn it into another homepage.
- Institutional: workflow and buyer detail, not methodology dump.
- Research: methodology map, not the complete specification.
- Docs: deepest detail and canonical technical reference.
- Technical Proof: engineering evidence only after an explicit status boundary.

## Commercial conversion paths

### Analyst / professional

`Home → Intelligence → GRI / Ask → Research / Docs`

### Institutional buyer

`Home → For Institutions → Risk Gate → Demo / Data & API → Contact`

### Developer / agent builder

`Home → Data & API / Risk Gate → Demo → /openapi.yaml → Docs → Contact`

### Circle / ecosystem technical reviewer

`Demo → free pre-flight → x402 endpoint → Circle code proof → CCTP / App Kit / GitHub`

### Technical due diligence

`Home / About → Docs / GRI Architecture → Pipeline / Technical Proof → GitHub`

### Existing testnet user

`Technical Proof → wallet-enabled flow → Portfolio / transaction surfaces`

## Final release checks

Before a commercial website release:

1. every primary nav target builds and is reachable;
2. mobile navigation contains the same commercial products in grouped form;
3. no public-intelligence or free demo route requires wallet connection;
4. all redirect-only routes are excluded from sitemap canonical URLs;
5. GRI pages use the current three-domain v1.2 contract;
6. Risk Gate remains labelled Private Pilot until production gates are satisfied;
7. Arc/Circle/markets/demo remain truthfully labelled Technical Proof where applicable;
8. contact identity is `contact@geomacro.live`;
9. canonical/OG metadata use `https://geomacro.live`;
10. `/openapi.yaml` matches the implemented agent endpoints and decision contract;
11. x402 is not described as live before its seller env and paid end-to-end test are complete;
12. Product CI/app validation and production build pass.