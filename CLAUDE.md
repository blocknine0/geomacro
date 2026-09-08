# Geomacro Dev Rules

## Product source of truth

Geomacro is a **global geopolitical and macro risk intelligence product**. The intelligence layer is the core product. Prediction markets, onchain probabilities, USDC settlement, CCTP and swap flows are application, feedback and technical-proof layers; they are not the primary company identity.

Before changing product language or architecture, read:

- `README.md`
- `docs/COMMERCIAL_INTELLIGENCE.md`
- `docs/RISK_GATE.md`
- `docs/GRI_METHODOLOGY.md`
- `docs/GRI_TRANSPARENCY_REQUIREMENTS.md`

Do not describe a Private Pilot or planned capability as generally available or production-ready.

## Public copy and editorial standard

Public-facing Geomacro copy must read like it was written and reviewed by a serious founder, analyst or product team, not generated from a template.

- Use short, natural sentences and concrete nouns and verbs.
- Explain the idea before using Geomacro-specific or technical terminology.
- Prefer plain English such as "check country risk before a payment moves forward" over abstract phrases such as "decision-ready context" or "commercial wedge".
- Avoid stacked buzzwords, investor jargon, slogans that say little, repeated three-part constructions and overly symmetrical card copy.
- Do not use AI-style filler such as "unlock", "revolutionize", "seamless", "powerful", "cutting-edge", "next-generation" or similar hype unless a specific factual claim requires the word.
- Do not foreground "AI" merely because a model is used internally. Name model-derived interpretation only where it helps a user understand provenance or system behavior.
- Keep status labels factual: Live, Private Pilot, Planned/Commercial Direction and Technical Proof must reflect the implemented product state.
- Make limitations sound like normal product disclosures, not defensive legal boilerplate. Keep them specific and accurate.
- Buyer pages should start from the user's workflow or problem, not Geomacro's architecture.
- Technical documentation may remain precise and technical. Do not simplify code contracts, security boundaries, methodology or proof language so far that technical truth is lost.
- Never invent traction, customers, certifications, audits, partnerships, performance, coverage or production readiness to make copy sound stronger.

When revising public copy, read it once without the surrounding UI. If it sounds generic enough to belong to any AI startup, rewrite it until it is specific to Geomacro and the actual workflow being described.

## Build and validation

- Install dependencies: `bun install`
- Dev server: `bun run dev`
- Production build: `bun run build`
- Lint: `bun run lint`
- App tests: `bun run test:app`
- Database migration safety: `bun run db:safety`
- Database target check: `bun run db:target`
- Core schema verification: `bun run db:verify-core`
- Current GRI compute: `bun run gri:compute`
- Current GRI verification: `bun run gri:verify`
- Current GRI validation: `bun run gri:validate`

Do not treat a successful compile as sufficient validation for a change that affects risk calculations, authentication, database migrations, wallet execution, smart contracts or external APIs. Run the relevant focused tests and production build as well.

## Current risk-intelligence architecture

The current public GRI contract is `gri-v1.2.0`. The canonical publication path uses the v1.2 engine and proof stack. Historical v1.0/v1.1 implementations are retained only for reproducibility and compatibility where explicitly labelled.

Risk API and Risk Gate are **Private Pilot** capabilities. Current code includes country and corridor risk evaluation, signed Geomacro Risk Objects, signature verification, fail-closed pre-flight evaluation, authenticated external Risk Gate requests, rate limiting and immutable audit records. Preserve these boundaries:

- Geomacro supplies verifiable risk context.
- Customer identity, permissions and policy remain separate from the risk calculation.
- `execution_authorized` must remain false in Geomacro Risk Gate responses unless the product architecture is deliberately changed and separately security-reviewed.
- A stale, expired, malformed or unverifiable Risk Object must never be silently treated as fresh verified context.
- The current corridor model is a directional endpoint-composed pilot, not a full physical-route, maritime, counterparty or logistics-path model.
- Commercial source eligibility must fail closed. Research-only, restricted or license-review-pending evidence must not silently enter paid Risk API/Risk Gate delivery.

## Data boundaries

Supabase is the structured application read model and persistence layer. Arc contract state remains authoritative for onchain financial state.

The separate `blocknine0/geomacro-historical-data` repository is the historical research warehouse. Do not duplicate its Python ingestion architecture into this repository. Consume curated historical outputs only through an explicit, reviewed interface.

## Oracle and lifecycle scripts

Scheduled automation lives under `.github/workflows/` and `scripts/`. Important lifecycle scripts include:

- `node scripts/ingest-news.js`
- `node scripts/create-markets.js`
- `node scripts/resolve-markets.js`
- `node scripts/finalize-markets.js`

Use `.env.example` only as a variable-name template. Never commit real credentials, private keys, signing material, service-role keys or wallet secrets.

## Smart contracts

Geomacro currently uses the **AgentArena V2 proxy** for new markets on Arc Testnet (chain ID `5042002`). The repository contains Solidity source, deployment/upgrade tooling and contract tests. V1 remains a legacy compatibility path for historical markets and claims.

Current deployment details are documented in `README.md`; do not copy contract addresses into new docs unless there is a concrete need, because stale duplicated addresses create due-diligence risk.

Do not introduce a V3 naming scheme unless the product intentionally creates a new protocol version. Existing V2 terminology is deliberate.

## Code style

- **TypeScript**: strict types; avoid `any` unless justified; preserve server/client boundaries.
- **Solidity**: explicit visibility, custom errors where appropriate, NatSpec on public/external interfaces, and tests for security-sensitive changes.
- **Scripts**: keep operational scripts directly runnable when practical so GitHub Actions can invoke them deterministically.
- Prefer explicit, versioned schemas and deterministic calculations for risk outputs.

## Security and change discipline

- Never weaken fail-closed behavior merely to make a test or demo pass.
- Never bypass authentication, rate limits, provenance, signature verification or audit persistence for convenience.
- Never add secrets to source files, examples, fixtures, logs or committed workflow output.
- Database migrations must be additive or explicitly verified safe; run `bun run db:safety`.
- Changes to GRI weights, category set, half-life, lookback, source/story caps, eligibility, timestamp semantics, normalization or rounding require a new methodology version and matching documentation/tests.
- Changes to Risk Object schema/signing or Risk Gate decision contracts require compatibility and security review.

## Commercialization discipline

Do not optimize the repository for a one-off hackathon at the expense of the permanent product. Prioritize production reliability, explainability, auditability, security, source rights and institutional pilot readiness.

When implementation and documentation disagree, first determine the deployed/current truth, then align both. Do not invent capabilities to make documentation sound stronger.
