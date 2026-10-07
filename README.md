# Geomacro

**Explainable geopolitical, macroeconomic and critical-mineral risk intelligence for human and machine decisions.**

**Live product:** https://geomacro.live  
**Documentation:** https://geomacro.live/docs  
**Security policy:** [SECURITY.md](SECURITY.md)

Geomacro turns real-world geopolitical, macroeconomic and strategic-resource developments into structured, explainable intelligence. The commercial product is the intelligence layer: public risk intelligence, three separate Risk Indices, Ask Geomacro, machine-readable Risk Objects, bounded Risk Gate decision context and governed API/agent delivery.

## What Geomacro gives customers

Geomacro delivers **Geomacro-derived structured intelligence**, not an upstream data-feed resale product.

A human or machine can receive, where the requested capability is currently available:

- what changed and why it matters;
- geopolitical, macroeconomic and critical-mineral risk context;
- current risk state, direction, confidence and material drivers;
- bounded country and directional-corridor structural context;
- signed Geomacro Risk Object attestations;
- bounded Risk Gate advisory context;
- stable schema/state/delivery identifiers suitable for machine workflows.

Geomacro does **not** sell or return raw article/feed payloads, private source identities, source-contract metadata, internal retrieval payloads or internal provenance objects through customer-facing product responses.

## Canonical product architecture

```text
Real-world evidence and data
        -> Normalize, classify and preserve provenance
        -> Structured intelligence state
             +-- Separate Risk Indices - Live
             +-- Ask Geomacro - Live
             +-- Country Risk Object - Private Pilot --+
             +-- Corridor Risk Object - Private Pilot -+-> Risk Gate - Private Pilot
             +-- Commercial API / agent delivery - Production gated

Risk Gate advisory response: CONTINUE / REDUCE_LIMIT / REQUIRE_APPROVAL / PAUSE
        -> Customer identity + permissions + policy enforcement
        -> Customer-controlled action
```

The architecture has **one governed intelligence foundation**. Website, API, agent protocols and x402 payment rails are access/delivery layers around that same intelligence state; they do not create a second risk engine.

The Risk Gate boundary is non-authorizing: `execution_authorized=false`. Identity, permissions, compliance policy, funds and downstream execution remain customer-controlled.

## Current product status

| Surface | Status | Product truth |
|---|---|---|
| Risk Intelligence | **LIVE** | Structured public geopolitical, macroeconomic and critical-mineral intelligence |
| Geopolitical Risk Index | **LIVE** | Separate verified geopolitical risk reading with versioned GRI v1.2 lineage |
| Macroeconomic Risk Index | **LIVE** | Separate verified macroeconomic risk reading with versioned GRI v1.2 lineage |
| Critical Minerals Risk Index | **LIVE** | Separate verified critical-minerals risk reading with versioned GRI v1.2 lineage |
| Ask Geomacro | **LIVE** | Governed query path over canonical intelligence with bounded freshness recovery |
| Research / methodology | **LIVE** | Public methodology, product boundaries and verification documentation |
| Risk API | **PRIVATE PILOT** | Controlled machine-readable country/corridor risk delivery |
| Risk Gate | **PRIVATE PILOT** | Signed context plus fail-closed bounded advisory evaluation |
| x402 commercial agent delivery | **PRODUCTION GATED** | Real-money production settlement remains owner-controlled and fail-closed until explicitly activated |

Code existence does not imply general availability, an SLA, external certification, customer adoption or real-money activation.

## Three risk domains

The public product exposes three independent risk domains:

```text
Geopolitical Risk Index
Macroeconomic Risk Index
Critical Minerals Risk Index
```

The parent methodology remains `gri-v1.2.0` with proof lineage `gri-proof-v1.2.0`. Historical combined-GRI snapshots remain audit records rather than a second current headline product.

Missing eligible evidence is never converted into zero risk. Stale, incomplete or unverifiable product state must fail closed or present an explicit bounded fallback state rather than inventing a replacement score.

## Ask Geomacro

Ask Geomacro uses the same governed intelligence architecture rather than a separate chatbot dataset.

```text
Question
  -> permanent governed intelligence reader
       -> verified private B2 continuity first
       -> optional Supabase standby read
  -> if the question explicitly needs current evidence and permanent state is insufficient:
       -> bounded ephemeral live retrieval
       -> internal verification/corroboration
       -> structured Geomacro answer
```

Fresh retrieval does not become a raw feed in the response. Weak evidence produces a withheld or insufficient answer rather than a fabricated conclusion.

## Commercial source governance

A source may influence paid structured output only when all applicable rights, ingestion, certification, freshness and commercial-signal gates pass. Review-pending, permission-pending, uncertified, stale or technically invalid sources remain fail-closed and outside paid output.

## Machine delivery and x402

Free Explorer is the public website/dashboard experience, not a free structured commercial API.

Current controlled structural endpoint:

```text
POST https://geomacro.live/api/commercial/structural
```

Machine discovery:

```text
/.well-known/geomacro-agent.json
/.well-known/geomacro-commerce.json
/.well-known/x402
```

Paid machine delivery follows:

```text
request
  -> deterministic query plan
  -> no-charge capability / freshness / commercial-eligibility check
  -> payment challenge only if deliverable
  -> payment proof binding
  -> final deliverability recheck
  -> source-free product projection
  -> product hash + durable preparation
  -> settlement
  -> idempotent delivery / reconciliation
```

If Geomacro cannot prove that the requested product is currently deliverable, payment must not be accepted for that request.

Real-money activation remains a separate owner-controlled production gate. Repository readiness does not itself authorize production funds.

## Risk Objects and Risk Gate

The current Private Pilot scope is **country and directional corridor risk**.

Risk Objects are versioned, signed and independently verifiable product artifacts. Commercial delivery requires both artifact verification and verified commercial eligibility.

Risk Gate consumes compatible risk context and returns a bounded advisory response. It is not custody, transaction signing, sanctions-screening replacement or autonomous execution authority.

## Storage and continuity

Geomacro separates hot operational state from historical/continuity storage.

```text
Supabase HOT/control plane
  -> verified private B2 historical/continuity snapshots
  -> bounded ephemeral retrieval when current information is genuinely required
```

B2 continuity snapshots are private, bounded, schema-validated and fail closed when stale or invalid.

## Security and integrity

Core invariants include versioned schemas, signed Risk Objects where applicable, hash-bound product artifacts, fail-closed commercial eligibility, payment/query/product binding, duplicate/replay protection and no raw/source-identity leakage through customer-facing structured delivery.

## Local development

```bash
bun install --frozen-lockfile
bun run dev
```

Useful verification commands:

```bash
bun run test:app
bun run build
bun run db:safety
bun run source:certification:census
bun run coverage:global:audit
```

Never commit production secrets. Keep server credentials server-side and do not expose them through `VITE_` environment variables.

## Canonical documentation

Start with:

- [What is Geomacro?](src/content/docs/01-what-is-geomacro.md)
- [Product architecture](src/content/docs/02-product-architecture.md)
- [Canonical delivery architecture](docs/CANONICAL_DELIVERY_ARCHITECTURE.md)
- [Commercial intelligence](docs/COMMERCIAL_INTELLIGENCE.md)
- [Risk Gate](docs/RISK_GATE.md)
- [User-facing data boundary](docs/USER_FACING_DATA_BOUNDARY.md)
- [Adaptive structured intelligence contract](docs/AGENT_QUERY_ADAPTIVE_STRUCTURED_DATA_CONTRACT.md)
- [Security policy](SECURITY.md)

## License

Geomacro application code and product implementation are proprietary unless a file or dependency states otherwise. Third-party/source rights are governed separately from the repository licence.
