# Geomacro Website Information Architecture

Status: commercial source of truth for the public website.

The public website is commercial risk-intelligence infrastructure. Retired experimental, market, wallet and non-production payment surfaces are not part of the public information architecture.

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
  |     +-- Data & API
  |     +-- For Institutions
  |     +-- Risk Objects · Private Pilot
  |     +-- Risk Gate · Private Pilot
  |     +-- x402 machine delivery · Production Gated
  |
  +-- Evidence and trust
        +-- Research & Evidence
        +-- Documentation
        +-- About & Trust
        +-- Roadmap
        +-- Ecosystem & Partnerships
```

## Status vocabulary

- **LIVE**: deployed public capability available now.
- **PRIVATE PILOT**: implemented capability available only in a controlled customer scope.
- **PRODUCTION GATED**: commercial runtime remains fail-closed until required acceptance evidence and explicit production activation are present.
- **PLANNED**: future product direction only.
- **LEGACY**: retained internally for compatibility or reproducibility and not presented as a customer product.

## Global navigation

### Primary

1. Intelligence
2. Risk Indices
3. API & Agents
4. Institutions
5. Pricing
6. Explore
7. Contact

### Explore

- Ask Geomacro
- Risk Gate · Private Pilot
- Ecosystem & Partnerships
- Research & Evidence
- Documentation
- About & Trust
- Roadmap

The public shell must not expose wallet controls or retired experimental navigation.

## Route contracts

### `/`

Commercial explanation and conversion surface. It must make the category, three risk domains, buyer value and next action understandable quickly without becoming a live dashboard.

### `/intelligence`

Professional current-intelligence workspace for governed geopolitical, macroeconomic and critical-mineral developments.

### `/global-risk` and `/risk-indices`

Canonical public presentation of the separate Geopolitical, Macroeconomic and Critical Minerals Risk Indices. Historical combined GRI material remains versioned proof lineage, not a second current headline product.

### `/ask-geomacro`

Grounded conversational access to governed Geomacro intelligence. Weak evidence must be withheld rather than fabricated.

### `/data-api`

Commercial machine-delivery surface. Free Explorer is website/dashboard access, not a free anonymous structured API. Paid access is availability-first and production-gated.

### `/institutional`

Buyer workflow surface for treasury, risk, payments, supply chain, research and software teams.

### `/risk-gate`

Controlled Private Pilot decision context for supported country and directional-corridor workflows. The external boundary remains `execution_authorized=false`.

### `/research`, `/docs`, `/about`

Evidence, methodology, technical reference and trust surfaces. They do not create separate product truth.

### `/ecosystem`

Partnership surface. Membership or directory listing must never be presented as endorsement of Geomacro methodology or customer decisions.

### `/pricing`

Public commercial pricing and payment-boundary explanation. A displayed price does not activate real-money settlement.

### `/roadmap`

Only current commercial product stages and future product work. Retired experimental products are not roadmap items.

## Retired route rule

Legacy public routes for prior experimental products permanently resolve to the nearest current commercial surface or fail closed. They must not appear in navigation, sitemap, public documentation, machine-discovery metadata or customer-facing copy.

## Commercial conversion paths

- First-time visitor: `Home → Intelligence / Risk Indices / Institutions → Contact`
- Institutional buyer: `Home → Institutions → Risk Gate / Data & API → Contact`
- AI or software buyer: `Home → Data & API → Docs → Contact`
- Analyst: `Home → Intelligence / Risk Indices → Ask Geomacro → Research`
- Technical due diligence: `Home / About → Docs / Research → GitHub`

## Permanent commercial claim rules

1. Never present Private Pilot as general availability.
2. Never infer real-money activation from code, pricing copy or provider configuration alone.
3. Never imply Geomacro authorizes or executes a customer financial action.
4. Never imply an ecosystem partner endorses Geomacro merely because a listing or membership exists.
5. Never claim an independent audit, certification or production SLA unless it is actually completed or contracted.
6. Never silently turn missing risk evidence into zero risk or approval.
7. Runtime payment status must come from the live production contract.
8. Public copy must not expose retired experimental product identities.
9. Customer-facing output is derived intelligence, not raw upstream data.
10. Every retired route must remain unreachable as an alternate commercial product.

## Final release checks

Before every public release:

1. primary navigation contains only commercial product, buyer, evidence and company surfaces;
2. no public commercial route requires a wallet;
3. no retired product appears in the sitemap or public machine discovery;
4. Risk Gate remains Private Pilot until evidence supports a status change;
5. real-money agent status remains runtime-derived and fail-closed until explicit production activation;
6. public docs and machine discovery use the same product/status truth;
7. canonical and OG metadata use `https://geomacro.live`;
8. legacy routes resolve to current commercial surfaces or 404;
9. Product CI, SEO/static contracts and production build pass on the exact candidate SHA;
10. after merge, production verification must be performed against the exact deployed canonical SHA.

## Website freeze principle

After the exact candidate is verified live, website changes should be driven by a real product-status change, buyer learning, legal/compliance need, verified new evidence or measured conversion problem rather than cosmetic churn.
