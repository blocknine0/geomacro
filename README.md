# Geomacro

**Explainable geopolitical, macroeconomic and critical-mineral risk intelligence for human and machine decisions.**

[![Live App](https://img.shields.io/badge/Live-geomacro.live-FF6B00?style=for-the-badge)](https://geomacro.live)
[![Arc Testnet](https://img.shields.io/badge/Technical_Proof-Arc_Testnet-2775CA?style=for-the-badge)](https://testnet.arcscan.app/address/0x2F874FB07084a22D2bB314D0762Af57Cb1856868)
[![USDC](https://img.shields.io/badge/Technical_Rail-USDC-2775CA?style=for-the-badge)](https://www.circle.com/usdc)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=for-the-badge)](LICENSE.txt)

**Live product:** https://geomacro.live  
**Documentation:** https://geomacro.live/docs  
**Security policy:** [SECURITY.md](SECURITY.md)

Geomacro turns real-world geopolitical, macroeconomic and strategic-resource developments into structured, explainable risk intelligence. The primary product is the intelligence layer: live event intelligence, separate verified Risk Indices, grounded research, machine-readable Risk Objects and bounded Risk Gate decision context.

The current public product presents three independent risk domains: **Geopolitical Risk Index**, **Macroeconomic Risk Index** and **Critical Minerals Risk Index**. They preserve the audited `gri-v1.2.0` parent methodology and `gri-proof-v1.2.0` proof lineage. Historical combined-GRI snapshots remain versioned audit records rather than a second live headline product.

Prediction markets, Arc Testnet contracts, USDC, Circle CCTP and swap flows are **secondary technical-proof and application layers**. They demonstrate how Geomacro intelligence can connect to programmable-finance workflows, but they are not the primary company identity.

---

## Current product status

| Surface | Status | Product truth |
|---|---|---|
| Risk Intelligence | **LIVE** | Public scored event intelligence with evidence context and timestamps |
| Geopolitical Risk Index | **LIVE** | Separate verified geopolitical risk reading with audited GRI v1.2 lineage |
| Macroeconomic Risk Index | **LIVE** | Separate verified macroeconomic risk reading with audited GRI v1.2 lineage |
| Critical Minerals Risk Index | **LIVE** | Separate verified critical-minerals risk reading with audited GRI v1.2 lineage |
| Ask Geomacro | **LIVE** | Grounded query interface over stored Geomacro intelligence and verified risk context |
| Research / methodology | **LIVE** | Public methodology, provenance and technical documentation |
| Risk API | **PRIVATE PILOT** | Controlled machine-readable country/corridor risk delivery |
| Risk Gate | **PRIVATE PILOT** | Signed risk context plus fail-closed bounded advisory evaluation |
| Professional intelligence packaging | **PLANNED COMMERCIAL DIRECTION** | Deeper history, alerts, exports and professional workflows as validated and shipped |
| Prediction markets / Arc / CCTP / Bridge & Swap | **TECHNICAL PROOF** | Testnet application and programmable-finance implementation |

`LIVE`, `PRIVATE PILOT`, `TECHNICAL PROOF`, `PLANNED` and `LEGACY` are intentionally distinct status labels. Code existence alone does not imply general availability, a production SLA, independent methodology validation, external security certification or customer adoption.

---

## Product architecture

```mermaid
graph TD;
    SOURCES["Real-world evidence and data"] --> STRUCTURE["Normalize, classify and preserve provenance"];
    STRUCTURE --> EVENTS["Structured intelligence state"];
    EVENTS --> INDICES["Separate Risk Indices - Live"];
    EVENTS --> ASK["Ask Geomacro - Live"];
    EVENTS --> COUNTRY["Country Risk Object - Private Pilot"];
    EVENTS --> CORRIDOR["Corridor Risk Object - Private Pilot"];
    COUNTRY --> GATE["Risk Gate - Private Pilot"];
    CORRIDOR --> GATE;
    GATE --> POLICY["Customer identity + permissions + policy"];
    POLICY --> ACTION["Customer-controlled action"];
    EVENTS --> TECH["Arc / Circle / prediction-market technical proof"];
```

The architecture separates **risk intelligence** from **transaction execution**:

- public Risk Intelligence, Risk Indices, Ask Geomacro and research do not require a wallet;
- Geomacro Risk Gate provides external risk context and a bounded advisory response rather than custody or autonomous transaction authorization;
- customer identity, permissions, compliance policy, funds and downstream execution remain customer-controlled;
- `execution_authorized=false` remains the current external Risk Gate boundary;
- stale, incomplete, expired or unverifiable risk context must fail closed rather than become implicit approval;
- Arc contract state remains authoritative only for the financial state of the secondary onchain technical-proof layer.

Data & API is an access and delivery surface over the same governed intelligence foundation. Payment rails do not create a second risk engine or widen the underlying entitlement.

---

## Public Risk Indices and audited GRI v1.2 lineage

The public product now exposes the three risk domains independently. The historical combined GRI remains the audited parent methodology and proof lineage used to preserve reproducibility and historical verification.

The persisted parent contract is **`gri-v1.2.0`** with proof lineage **`gri-proof-v1.2.0`**. Historical v1.0/v1.1 code is retained only where explicitly labelled for compatibility, replay or audit reproducibility.

GRI v1.2 is deterministic **after event classification and current-contract story assignment**. Severity and confidence are upstream model-produced inputs with versioned provenance; the numeric aggregate contains no discretionary manual adjustment and no LLM call.

### Parent scoring domains

The audited parent methodology uses exactly three base domains:

```text
geopolitics = 1/3
macro       = 1/3
rare_earth  = 1/3
```

The public naming for the third standalone index is **Critical Minerals Risk Index** while the historical storage category remains `rare_earth` to preserve proof compatibility.

If an eligible domain has no verified evidence, missing evidence is not converted into zero risk. Public risk-index presentation is fail-soft: a previously verified reading may remain visible during a refresh problem, while a cold read uses a neutral loading/refreshing state rather than fabricating a replacement score.

```mermaid
graph TD;
    EV["Eligible observation i"] --> CW["confidenceWeight = confidence_i / 100"];
    EV --> DW["decayWeight = 2^(-ageHours_i / 24)"];
    CW --> RW["rawWeight_i = confidenceWeight * decayWeight"];
    DW --> RW;
    RW --> SCAP["Per-source evidence concentration cap"];
    SCAP --> STCAP["Story-level evidence concentration cap"];
    STCAP --> DOMAIN["Domain aggregation: geopolitics / macro / rare_earth, 1/3 each"];
    DOMAIN --> COMPUTE["gri-v1.2.0 deterministic compute"];
    COMPUTE --> PROOF["gri-proof-v1.2.0 lineage: methodology, input, calculation and proof hashes"];
    PROOF --> LIVE["Published: Geopolitical / Macroeconomic / Critical Minerals Risk Index"];
    PROOF --> AUDIT["Historical combined-GRI snapshot: audit record only"];
```

### Evidence weighting

For eligible observation `i`:

```text
confidenceWeight = confidence_i / 100
decayWeight      = 2 ^ (-ageHours_i / 24)
rawWeight_i      = confidenceWeight * decayWeight
```

Canonical parent controls include:

- trailing **72-hour** lookback;
- **24-hour** exponential half-life;
- per-source evidence concentration cap;
- immutable story grouping;
- story-level evidence concentration cap;
- versioned classification and story-correlation provenance;
- fail-closed current-contract eligibility checks.

The source cap prevents one publisher from dominating a domain through article volume. The story cap prevents many publishers repeating one underlying development from creating multiple independent evidence budgets.

### Proof and change attribution

Published proof lineage retains, where available and verified:

- methodology version and methodology hash;
- input, evidence, calculation and proof hashes;
- current and previous raw scores;
- contribution-level change attribution and reconciliation residuals;
- event, independent-story and source counts;
- evidence coverage and weighted confidence;
- immutable snapshot verification URLs.

The current standalone Risk Indices report domain-level changes independently. Historical combined-GRI contribution values remain audit records and are not presented as the current standalone index delta.

These indices are **risk-intelligence signals**, not prediction-market probabilities, investment recommendations or guarantees of future outcomes.

Canonical parent-methodology commands:

```bash
bun run gri:compute
bun run gri:verify
bun run gri:validate
bun run gri:replay
```

See [docs/RISK_INDICES_ARCHITECTURE.md](docs/RISK_INDICES_ARCHITECTURE.md), [docs/GRI_METHODOLOGY.md](docs/GRI_METHODOLOGY.md), [docs/GRI_ARCHITECTURE.md](docs/GRI_ARCHITECTURE.md) and [docs/GRI_TRANSPARENCY_REQUIREMENTS.md](docs/GRI_TRANSPARENCY_REQUIREMENTS.md).

---

## Ask Geomacro

Ask Geomacro is a public grounded-research interface over Geomacro's stored intelligence.

```mermaid
graph LR;
    Q["User or agent query"] --> RET["Retrieve from stored event intelligence set"];
    RET --> RANK["Bounded deterministic relevance ranking"];
    RANK --> THRESH{"Evidence clears<br/>relevance threshold?"};
    THRESH -->|No| WITHHOLD["Withhold interpretation"];
    THRESH -->|Yes| CONTEXT["Use verified current risk context;<br/>historical GRI lineage kept explicit"];
    CONTEXT --> ANSWER["Grounded answer"];
```

The current answer engine:

- retrieves from the stored event intelligence set;
- applies bounded deterministic relevance ranking;
- requires evidence to clear relevance thresholds;
- withholds interpretation when evidence is weak;
- can use verified current risk context while keeping the historical GRI lineage explicit;
- does **not** silently manufacture a fallback risk score;
- does **not** silently add open-web evidence;
- applies input validation, same-origin protection and application-level burst limiting.

The current request limiter is an abuse-control mechanism, not a durable distributed commercial quota system.

---

## Geomacro Risk Object and Risk Gate

Risk API and Risk Gate are **Private Pilot** capabilities for current country and directional-corridor workflows.

The repository implements a commercial backend foundation including:

- versioned Geomacro Risk Objects (GROs);
- Ed25519 issuer signing and signature verification;
- persisted objects and read-back verification;
- fail-closed pre-flight evaluation;
- authenticated external requests;
- database-backed per-client rate limiting;
- immutable decision audit records;
- customer-controlled downstream action after the Geomacro response.

A simplified decision flow is:

```mermaid
graph LR;
    GRO["Signed Geomacro Risk Object"] --> GATE["Risk Gate verification + bounded evaluation"];
    GATE --> ADVISORY["Risk Gate advisory response: CONTINUE / REDUCE_LIMIT / REQUIRE_APPROVAL / PAUSE"];
    ADVISORY --> POLICY["Customer identity + permissions + policy enforcement"];
    POLICY --> EXEC["Customer-controlled execution"];
```

The current v1 machine decision contract has four advisory states: `CONTINUE`, `REDUCE_LIMIT`, `REQUIRE_APPROVAL` and `PAUSE`.

A caller-supplied policy profile may be evaluated inside the bounded Risk Gate request, but **that input is not customer-side policy enforcement**. Customer policy ownership and enforcement remain downstream of the Geomacro response. `REROUTE` is reserved as a future/advisory alternative when a lower-risk corridor or route is separately validated; it is not a fifth current v1 decision.

Geomacro does not represent Risk Gate as a wallet custodian, autonomous transaction signer, sanctions-screening replacement or generally available production service. The customer retains identity, permissions, policy, funds and final execution control.

### Current corridor scope

The current corridor methodology is a **directional endpoint-composed pilot**. It composes signed origin and destination country risk context and adds direct bilateral evidence only when eligible evidence explicitly links the pair.

It does **not** claim full modelling of maritime routes, ports, intermediary jurisdictions, vessels, counterparties, correspondent banks, transaction-specific sanctions exposure or complete logistics paths.

Commercial source eligibility is a launch gate. Research-only, restricted or license-review-pending evidence must fail closed and remain outside paid machine delivery until permitted use is confirmed.

See [docs/RISK_GATE.md](docs/RISK_GATE.md).

---

## Data, API and commercial delivery

Free Explorer is the public website/dashboard experience, not a free structured API.

Commercial machine delivery is entitlement-controlled. The entitlement defines the permitted capability, subject scope, history depth and response limits. A payment provider cannot widen the payload.

Current commercial structured endpoint:

```text
POST https://geomacro.live/api/commercial/structural
```

Machine discovery is published at:

- `/.well-known/geomacro-agent.json`
- `/.well-known/geomacro-commerce.json`
- `/.well-known/x402`

Paid agent/x402 production activation remains **PRE-LAUNCH**. Production real-money provider activation and mainnet activation remain disabled until the coordinated launch gates and explicit owner authorization are satisfied.

---

## Evidence, data and provenance

Geomacro separates raw evidence, structured intelligence, scoring eligibility and commercial eligibility.

```mermaid
graph LR;
    OBS["Observation"] --> EVIDENCE{"Evidence admitted?"};
    EVIDENCE -->|No| REJECT["Reject / quarantine"];
    EVIDENCE -->|Yes| PRODUCT{"Product allowed?"};
    PRODUCT -->|No| EXCLUDE["Exclude"];
    PRODUCT -->|Yes| SCORE{"Scoring eligible?"};
    SCORE -->|Yes| RISK["Can affect risk output"];
    SCORE -->|No| CONTEXT["Context only"];
```

Supabase provides the structured application read model and persistence layer. Governed historical ingestion/backfill is kept distinct from evidence that Geomacro actually emitted a score in real time.

Core product principles:

1. preserve source and calculation provenance;
2. expose confidence, freshness and missing coverage;
3. distinguish repeated reporting from independent underlying developments;
4. fail closed on incompatible methodology/provenance states;
5. never manufacture missing data for presentation;
6. keep commercial source rights separate from technical ingestability.

---

## Dated controlled coverage evidence

A controlled four-module Risk Gate census completed on **2026-09-16** evaluated **194** enabled sovereign countries under that workflow. **114** passed every required current module and **80** remained fail-closed. Every accepted result preserved `execution_authorized=false`.

This is a dated workflow-coverage result, not an all-country product guarantee, institutional deployment claim, production SLA or promise that every product/request shape is deliverable for all accepted countries.

---

## Secondary Arc / Circle technical proof

Geomacro retains a substantial testnet application layer showing how intelligence can connect to programmable financial workflows.

Current technical-proof capabilities include:

- Arc Testnet smart contracts;
- V1 historical compatibility and V2 proxy routing;
- test-USDC prediction-market participation and claims;
- tentative resolution, disputes and five-role jury automation;
- Circle CCTP V2 bridge flows;
- Circle App Kit swap flows;
- wallet, transaction and reconciliation tooling;
- scheduled lifecycle/security operations.

These surfaces are explicitly secondary to the intelligence product and must not be interpreted as production mainnet, real-money institutional settlement or independent security certification.

### Current Arc Testnet deployment

| Component | Value |
|---|---|
| Network | Arc Testnet |
| Chain ID | `5042002` |
| V2 proxy | `0x2F874FB07084a22D2bB314D0762Af57Cb1856868` |
| V2 implementation | `0x96DDb29e27bdc3edf0c27bf885840Ebf8151DA7c` |
| V2 deployment block | `56797869` |
| V1 legacy contract | `0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe` |

New market creation uses the V2 proxy. V1 remains a legacy compatibility path for historical markets and claims. Do not introduce a V3 naming scheme unless a deliberate protocol generation is actually created.

---

## Security and resilience boundaries

Geomacro's launch standard is evidence-based. Repository tests and engineering controls are useful proof, but they are not substitutes for an independent review or production operating history.

The codebase includes controls such as:

- fail-closed Risk Object verification;
- API authentication and database-backed rate limiting;
- immutable Risk Gate audit persistence;
- server-side credential boundaries;
- migration-safety checks;
- explicit methodology/proof verification;
- onchain upgrade/dispute security controls in the technical-proof layer;
- scheduled monitoring and reconciliation workflows.

Before external Early Access is represented as production-ready, the relevant system must pass the planned security and resilience gates. Do not claim "unhackable", independent certification, third-party audit, production SLA or institutional validation unless it has actually been obtained and documented.

Security reports: `security@geomacro.live` or the process documented in [SECURITY.md](SECURITY.md). Never submit seed phrases, private keys or production secrets through public product surfaces.

---

## Repository structure

```text
geomacro/
├── src/
│   ├── routes/                 # Public product + technical-proof routes
│   ├── components/             # UI and product components
│   └── lib/                    # Risk indices, Ask, Risk Gate, data and application logic
├── scripts/                    # ingestion, GRI lineage, validation and operational tooling
├── supabase/                   # migrations and edge functions
├── contracts/                  # Arc Testnet Solidity implementation
├── script/                     # Foundry deployment/upgrade scripts
├── test/                       # Solidity tests
├── docs/                       # Canonical technical/product documentation
├── .github/workflows/          # CI and automation
├── SECURITY.md
└── package.json
```

---

## Local development

Prerequisites:

- Bun `1.4.2` (repository package-manager contract)
- Node-compatible runtime for operational scripts
- Foundry for Solidity work

```bash
git clone https://github.com/blocknine0/geomacro.git
cd geomacro
bun install
cp .env.example .env.local
bun run dev
```

Production build and application tests:

```bash
bun run test:app
bun run build
```

Database checks:

```bash
bun run db:safety
bun run db:target
bun run db:verify-core
```

Contract work:

```bash
forge build
forge test
```

Use `.env.example` only as a variable-name template. Never commit service-role credentials, private keys, signing material, wallet secrets or privileged RPC credentials.

---

## Technology stack

| Layer | Technology |
|---|---|
| Web application | TanStack Start, React 19, Vite 7, Tailwind CSS v4 |
| Data | Supabase / PostgreSQL |
| Risk calculation | Versioned deterministic Node/TypeScript/JavaScript tooling |
| Validation | Zod, Vitest, repository static contracts |
| Machine risk | Signed GRO + Risk Gate server/API foundation |
| Cryptographic signing | Ed25519 + SHA-256 payload integrity |
| Smart contracts | Solidity 0.8.20, OpenZeppelin upgradeable contracts, Foundry |
| Chain client | ethers v6 |
| Testnet execution | Arc Testnet, native USDC |
| Crosschain technical proof | Circle CCTP V2 |
| Swap technical proof | Circle App Kit |
| Automation | GitHub Actions |
| Production build target | Nitro / Cloudflare-compatible output |

---

## Documentation

Start with https://geomacro.live/docs and the repository contracts below:

- [Risk Indices architecture](docs/RISK_INDICES_ARCHITECTURE.md)
- [Commercial intelligence](docs/COMMERCIAL_INTELLIGENCE.md)
- [GRI methodology v1.2 lineage](docs/GRI_METHODOLOGY.md)
- [GRI transparency requirements](docs/GRI_TRANSPARENCY_REQUIREMENTS.md)
- [Risk Gate](docs/RISK_GATE.md)
- [Canonical delivery architecture](docs/CANONICAL_DELIVERY_ARCHITECTURE.md)
- [Structural data commercial package](docs/STRUCTURAL_DATA_COMMERCIAL_PACKAGE.md)
- [Database schema ownership](docs/DATABASE_SCHEMA_OWNERSHIP.md)
- [Website information architecture](docs/WEBSITE_INFORMATION_ARCHITECTURE.md)
- [Security policy](SECURITY.md)

---

## Commercialization and launch gates

Geomacro is early-stage and pre-revenue. The objective is a production-grade global risk-intelligence product, not a one-off hackathon artifact.

Current priorities are:

1. keep website, docs and implementation on one source of truth;
2. harden Risk Indices/data reliability and commercial source eligibility;
3. harden Risk Object/Risk Gate security, privacy and operations;
4. complete scoped security and resilience testing before external Early Access launch;
5. validate narrow country/corridor workflows with real design partners;
6. finalize Early Access pricing, support boundaries and customer terms;
7. activate production payment/mainnet rails only after coordinated launch gates and explicit owner approval.

Service levels, quotas, customer logos, revenue, independent validation and security certification must be represented only when supported by real evidence.

---

## Disclaimer

Geomacro provides information and risk-intelligence decision-support tooling. It does not provide financial, investment, legal, trading or sanctions-screening advice.

Risk scores, interpretations and machine-readable advisory decisions are not guarantees of future outcomes. The user or customer remains responsible for identity, permissions, compliance obligations, policy and final action.

Testnet technical-proof functionality must not be interpreted as production real-money availability.

---

Built by [@blocknine0](https://github.com/blocknine0) · [Live product](https://geomacro.live) · [Issues](https://github.com/blocknine0/geomacro/issues)
