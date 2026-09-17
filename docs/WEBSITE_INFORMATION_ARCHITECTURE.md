# Geomacro Website Information Architecture

Status: commercial source of truth for the public website.

This document defines the permanent public information architecture. The homepage is a commercial explanation and conversion surface, not a live data dashboard. Detailed intelligence, scores, evidence, methodology and technical proof live on dedicated routes.

## Product hierarchy

```text
Geomacro
  |
  +-- Public product
  |     +-- Risk Intelligence
  |     +-- Separate Risk Indices
  |     +-- Ask Geomacro
  |
  +-- Commercial delivery
  |     +-- For Institutions
  |     +-- Risk Gate · Private Pilot
  |     +-- Data & API · public data + controlled machine access
  |
  +-- Ecosystem & partnerships
  |     +-- Circle Alliance Directory membership
  |     +-- infrastructure / data / distribution / AI partnerships
  |
  +-- Evidence and trust
  |     +-- Research & Evidence
  |     +-- Documentation
  |     +-- About & Trust
  |     +-- Roadmap
  |
  +-- Technical Proof
        +-- Testnet API / agentic commerce demo
        +-- Data Pipeline
        +-- Prediction Markets · permanently Testnet-only
        +-- Arc / Onchain
        +-- Bridge & Swap
```

Prediction markets, Arc transaction surfaces, Circle payment experiments and wallet execution are secondary Technical Proof. They must not define the homepage or primary commercial identity.

## Status vocabulary

- **LIVE**: deployed public capability available now.
- **PRIVATE PILOT**: implemented capability available only in a controlled scope; not general production availability.
- **CONTROLLED PRE-LAUNCH**: production-capable commercial path remains fail-closed pending explicit launch authorization and acceptance evidence.
- **TECHNICAL PROOF**: working implementation that demonstrates integration/engineering capability but is not the primary commercial product.
- **PLANNED**: future roadmap intent only.

Do not use ambiguous “coming soon” language when a more precise state is known.

## Global navigation

### Primary desktop navigation

1. Intelligence
2. Risk Indices
3. For Institutions
4. Ecosystem
5. Explore dropdown
6. Technical Proof dropdown
7. Contact

### Explore dropdown

- Ask Geomacro
- Risk Gate · Private Pilot
- Data & API
- Research & Evidence
- Documentation
- About & Trust
- Roadmap

### Mobile navigation

- Product & buyers
- Explore
- Reference
- Technical proof
- Account only when relevant

### Wallet rule

A disconnected visitor must not see wallet connection as a primary action on public product, buyer, ecosystem, evidence, trust, roadmap or contact pages.

Wallet connection belongs only to explicit testnet/transaction surfaces such as Prediction Markets, Arc/Onchain, Bridge & Swap, Portfolio and related execution proof.

## Route contracts

### `/` — Homepage

**Job:** explain Geomacro in about 40 seconds, make the value obvious, establish trust, and create a reason to adopt or partner.

**Permanent order:**

1. category + plain-language value proposition;
2. the fragmented external-risk problem;
3. why Geomacro is different / why adopt it;
4. who it is for;
5. exact live vs Private Pilot status;
6. ecosystem and partnership rationale;
7. Circle Alliance verification point;
8. one clear partnership/customer CTA.

**Homepage must not contain:**

- live risk scores;
- event feeds or tables;
- the 114/194 country census banner;
- Ask Geomacro interactive demo content;
- detailed methodology;
- testnet wallet controls;
- prediction-market or Bridge & Swap feature grids;
- dense infrastructure proof.

Those belong one click deeper.

### `/intelligence` — Risk Intelligence

Professional current-intelligence workspace. Owns current events, highest-risk/movement views, filters and event drill-down.

### `/global-risk` — Risk Indices

Canonical public workspace for the separate Geopolitical, Macroeconomic and Critical Minerals Risk Indices. Owns scores, history, evidence counts, change attribution and integrity proof.

Historical combined GRI material remains versioned proof/audit lineage, not a second current headline product. Public wording must distinguish Geomacro's internal/versioned proof system from any independent external audit or certification.

### `/ask-geomacro` — Ask Geomacro

Grounded conversational access to stored Geomacro evidence and current risk context. It must expose evidence limitations rather than imply unrestricted web search or unsupported certainty.

### `/institutional` — For Institutions

Translate Geomacro into treasury, payments, risk, strategy, supply-chain and software workflows. This page owns founding-pilot conversion and buyer workflow detail.

### `/risk-gate` — Risk Gate

Controlled Private Pilot decision-context capability. Owns detailed country/corridor scope, signed Risk Object behavior, four-state v1 decision contract, control boundary, limitations, launch gates and the dated 114/194 coverage evidence.

The current v1 machine decision states remain `CONTINUE`, `REDUCE_LIMIT`, `REQUIRE_APPROVAL`, `PAUSE`. `REROUTE` is not a v1 authorization state.

### `/data-api` — Data & API

Explain public data access, controlled machine delivery, agent access status and exact commercial boundaries. Free Explorer means website/dashboard access, not a free anonymous API.

Commercial x402 status must be runtime-derived from the live endpoint rather than hardcoded as live before activation.

### `/ecosystem` — Ecosystem & Partnerships

Visible commercial partnership surface.

**Owns:**

- Circle Alliance Program membership and direct official-directory verification;
- infrastructure, data, distribution, financial-services and AI/agent partnership models;
- partner vs customer responsibility boundaries;
- partnership CTA.

**Wording rule:** use “Circle Alliance Program member” or “listed in the Circle Alliance Directory.” Do not invent an “Official Circle Partner” badge or imply Circle endorsement of Geomacro methodology, scores, customer decisions or future services.

### `/research` — Research & Evidence

Owns methodology map, reproducibility, source governance, reliability, change attribution, dated coverage evidence and limitations.

The detailed 114/194 census banner may appear here and on Risk Gate, but not on the homepage.

### `/docs` and `/docs/*` — Documentation

Deep canonical technical and product reference. Must remain aligned with implemented versions and explicit status boundaries.

Featured documentation entry points must prioritize risk intelligence, source governance, Risk Objects, access and partner architecture. Prediction-market documentation may remain available as Technical Proof reference but must not be a featured commercial starting point.

### `/about` — About & Trust

Owns company/product identity, transparency standard, privacy, product-use boundaries, security-claim boundaries and trust disclosures.

### `/roadmap` — Roadmap

Show live, Private Pilot and future work without presenting planned capabilities as current production services.

### `/contact` — Contact

One low-friction path for buyers, design partners, infrastructure/data partners, technical questions and strategic conversations.

Canonical email: `contact@geomacro.live`.

### Technical Proof routes

`/testnet-access`, `/demo`, `/pipeline`, `/arena`, `/onchain`, `/bridge-swap` remain secondary engineering/integration evidence.

Prediction markets remain permanently Testnet-only.

Arc public mainnet launched on 16 Sep 2026. This external network fact must not be confused with Geomacro activation: Geomacro onchain transaction features remain on Arc Testnet until a separately approved production configuration is explicitly enabled.

Every Technical Proof surface must make clear that a working implementation is not itself a claim of general production availability, real-money production settlement, customer authorization or a service-level commitment.

## Commercial conversion paths

### First-time visitor

`Home → For Institutions / Risk Indices / Ecosystem → Contact`

### Institutional buyer

`Home → For Institutions → Risk Gate / Data & API → Contact`

### AI / agent / financial-platform partner

`Home → Ecosystem → Data & API / Docs → Contact`

### Analyst / professional

`Home → Intelligence / Risk Indices → Ask Geomacro → Research`

### Technical due diligence

`Home / About → Docs / Research → Technical Proof → GitHub`

## Content-density rules

- **Homepage:** commercial clarity only; one decision per section.
- **Product pages:** enough detail to understand value, status and next action.
- **Institutional:** buyer workflows, not methodology dump.
- **Ecosystem:** partnership fit and verified memberships, not technical marketing clutter.
- **Research:** evidence/methodology map and dated proof.
- **Docs:** deepest specification.
- **Technical Proof:** engineering evidence after an explicit boundary.

## Permanent commercial claim rules

1. Never present Private Pilot as GA/production.
2. Never present Testnet settlement as commercial revenue.
3. Never imply Geomacro authorizes or executes a customer's financial action.
4. Never imply Circle endorses Geomacro because of Alliance membership.
5. Never claim independent audit/certification/SLA until it exists.
6. Never silently turn missing risk evidence into zero risk or approval.
7. Runtime commercial-payment status must come from the live endpoint.
8. Public Arc mainnet availability does not activate Geomacro mainnet features.
9. Do not call the GRI methodology or proof lineage “audited” in public copy if that wording could be read as an independent external audit. Use precise terms such as versioned methodology, verified proof lineage, reproducible proof package or versioned audit record as appropriate.
10. A working Technical Proof is evidence of implementation, not evidence of production availability, revenue, security certification or customer adoption.

## Final release checks

Before every public website release:

1. homepage can be understood without scrolling through live data;
2. homepage contains no live score/event/census dashboard blocks;
3. every primary nav target builds and is reachable;
4. `/ecosystem` is visible in desktop/mobile navigation and sitemap;
5. Circle Alliance link resolves to the official Geomacro directory profile;
6. detailed coverage evidence is limited to Risk Gate and Research;
7. no public commercial route requires a wallet;
8. Risk Gate remains Private Pilot until launch evidence supports a status change;
9. real-money agent status is runtime-derived and fail-closed;
10. technical-proof surfaces remain secondary, noindex and clearly labelled;
11. featured docs remain intelligence-first rather than prediction-market-first;
12. public copy does not imply an independent GRI/security audit, certification, SLA, customer authorization or production settlement without matching evidence;
13. canonical/OG metadata use `https://geomacro.live`;
14. legacy `/feed` and `/bridge` resolve to their canonical product routes rather than creating duplicate identities;
15. Product CI, SEO/static contracts, final commercial closure tests and production build pass on the exact candidate SHA;
16. after merge, the canonical main SHA must sync to the Lovable mirror and be published once;
17. after publication, the live build marker must match that exact canonical main SHA before the website is called production-aligned.

## Website freeze principle

After the final release checks pass and the exact candidate SHA is verified live, ordinary fundraising, partnership, customer and demo work should reuse this website rather than trigger ad-hoc positioning edits. Future website changes should be driven by a real product-status change, verified new evidence, a material buyer-learning signal, a legal/compliance requirement or a measured conversion problem. Cosmetic churn alone is not a reason to reopen the commercial architecture.
