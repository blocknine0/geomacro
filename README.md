# Geomacro

**Explainable geopolitical, macroeconomic and critical-mineral risk intelligence for human and machine decisions.**

**Live product:** https://geomacro.live  
**Documentation:** https://geomacro.live/docs  
**Security policy:** [SECURITY.md](SECURITY.md)

Geomacro turns real-world geopolitical, macroeconomic and strategic-resource developments into structured, explainable intelligence. The product is the intelligence layer: public risk intelligence, three separate Risk Indices, Ask Geomacro, machine-readable Risk Objects, bounded Risk Gate decision context, and controlled API/agent delivery.

Prediction markets, Arc, Circle/CCTP and swap flows are **secondary technical proof**. They are not Geomacro's primary product identity.

---

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

Geomacro does **not** sell or return raw article/feed payloads, source URLs, provider identity, source IDs, licence/source-contract metadata, internal retrieval payloads or internal provenance objects through customer-facing product responses.

The permanent external boundary is:

```text
Raw/Internal Evidence
  -> Retrieval / normalization / verification
  -> Geomacro structured intelligence state
  -> Approved product projection
  -> Human or machine
```

See [docs/USER_FACING_DATA_BOUNDARY.md](docs/USER_FACING_DATA_BOUNDARY.md).

---

## Canonical product architecture

```text
Real-world evidence and data
        -> Normalize, classify and preserve provenance
        -> Structured intelligence state
             +-- Separate Risk Indices - Live
             +-- Ask Geomacro - Live
             +-- Country Risk Object - Private Pilot --+
             +-- Corridor Risk Object - Private Pilot -+-> Risk Gate - Private Pilot
             +-- Arc / Circle / prediction-market technical proof

Risk Gate advisory response: CONTINUE / REDUCE_LIMIT / REQUIRE_APPROVAL / PAUSE
        -> Customer identity + permissions + policy enforcement
        -> Customer-controlled action
```

The architecture has **one governed intelligence foundation**. Website, API, agent protocols, x402 and other payment rails are access/delivery layers around that same intelligence state; they do not create a second risk engine.

The Risk Gate boundary is non-authorizing: `execution_authorized=false`. Identity, permissions, compliance policy, funds and downstream execution remain customer-controlled.

A caller-supplied policy profile may be evaluated as bounded Risk Gate input, but **that input is not customer-side policy enforcement**.

The current v1 advisory states are:

- `CONTINUE`
- `REDUCE_LIMIT`
- `REQUIRE_APPROVAL`
- `PAUSE`

`REROUTE` is reserved as a future/advisory alternative when a separately validated lower-risk corridor or route exists; it is not a current v1 machine decision.

---

## Current product status

| Surface | Status | Product truth |
|---|---|---|
| Risk Intelligence | **LIVE** | Structured public geopolitical, macroeconomic and critical-mineral intelligence |
| Geopolitical Risk Index | **LIVE** | Separate verified geopolitical risk reading with audited GRI v1.2 lineage |
| Macroeconomic Risk Index | **LIVE** | Separate verified macroeconomic risk reading with audited GRI v1.2 lineage |
| Critical Minerals Risk Index | **LIVE** | Separate verified critical-minerals risk reading with audited GRI v1.2 lineage |
| Ask Geomacro | **LIVE** | Hybrid governed query path: permanent/B2 intelligence first where suitable, with bounded ephemeral live retrieval for freshness-sensitive questions |
| Research / methodology | **LIVE** | Public methodology, product boundaries and verification documentation |
| Risk API | **PRIVATE PILOT** | Controlled machine-readable country/corridor risk delivery |
| Risk Gate | **PRIVATE PILOT** | Signed context plus fail-closed bounded advisory evaluation |
| x402 commercial agent delivery | **PRE-LAUNCH** | Real-money production settlement remains owner-controlled and fail-closed until explicitly activated |
| Prediction markets / Arc / CCTP / Bridge & Swap | **TECHNICAL PROOF** | Secondary testnet/programmatic-finance implementation |

Status labels are intentionally distinct. Code existence does not imply general availability, an SLA, external certification, customer adoption or real-money activation.

---

## Three risk domains

The public product exposes three independent risk domains:

```text
Geopolitical Risk Index
Macroeconomic Risk Index
Critical Minerals Risk Index
```

The audited parent methodology remains `gri-v1.2.0` with proof lineage `gri-proof-v1.2.0`. Historical combined-GRI snapshots remain audit records rather than a second current headline product.

The parent domain weights are:

```text
geopolitics = 1/3
macro       = 1/3
rare_earth  = 1/3
```

`rare_earth` remains the historical storage category for proof compatibility; the current public product name is **Critical Minerals Risk Index**.

Missing eligible evidence is never converted into zero risk. Stale, incomplete or unverifiable product state must fail closed or present an explicit bounded fallback state rather than inventing a replacement score.

Canonical methodology commands:

```bash
bun run gri:compute
bun run gri:verify
bun run gri:validate
bun run gri:replay
```

See [docs/GRI_METHODOLOGY.md](docs/GRI_METHODOLOGY.md) and [docs/RISK_INDICES_ARCHITECTURE.md](docs/RISK_INDICES_ARCHITECTURE.md).

---

## Ask Geomacro

Ask Geomacro uses the same governed intelligence architecture rather than a separate chatbot dataset.

The production routing model is:

```text
Question
  -> permanent governed intelligence reader
       -> verified private B2 continuity first
       -> optional Supabase standby read
  -> if the question explicitly needs current/fresh evidence and permanent state is insufficient:
       -> bounded ephemeral live retrieval
       -> internal verification/corroboration
       -> structured Geomacro answer
```

Important boundaries:

- fresh/live retrieval does not become a raw feed in the response;
- source identity remains private;
- ephemeral live retrieval does not create an uncontrolled durable raw-data write path;
- weak evidence produces a withheld/insufficient answer rather than a fabricated conclusion;
- no private fallback risk score is manufactured.

---

## Commercial source governance

Geomacro maintains a broad governed source universe for research, ingestion, coverage and future certification. That broad registry is **not the same thing as the paid-output source set**.

A source may influence paid structured output only when all applicable gates pass:

1. commercial derived use is approved (`COMMERCIAL_OK` or `DERIVED_ONLY`);
2. governed ingestion is enabled;
3. `enabled_for_commercial_signals=true`;
4. production certification is `CERTIFIED`;
5. required evidence/runtime/freshness checks pass.

`raw_redistribution_allowed` is retained as internal rights metadata, but it is not a prerequisite for a derived-only product that does not redistribute raw upstream material.

Review-pending, permission-pending, uncertified, stale or technically invalid sources remain fail-closed and outside paid output.

The full-source certification census remains a separate governance/audit metric and is not falsely promoted merely to make commercial readiness appear green.

---

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

The customer-facing paid payload is sanitized before durable preparation/settlement, and legacy stored replay payloads must pass the same sanitation/re-hash boundary before they can be returned.

Real-money/mainnet activation remains a separate owner-controlled gate. Repository readiness does not itself authorize production funds.

See [docs/AGENT_QUERY_ADAPTIVE_STRUCTURED_DATA_CONTRACT.md](docs/AGENT_QUERY_ADAPTIVE_STRUCTURED_DATA_CONTRACT.md) and [docs/COMMERCIAL_INTELLIGENCE.md](docs/COMMERCIAL_INTELLIGENCE.md).

---

## Risk Objects and Risk Gate

The current Private Pilot scope is **country and directional corridor risk**.

Event-specific Risk Objects remain a broader product direction until separately implemented, validated and promoted.

Risk Objects are versioned, signed and independently verifiable product artifacts. Commercial delivery requires both artifact verification and verified commercial eligibility.

Risk Gate consumes compatible risk context and returns a bounded advisory response. It is not custody, transaction signing, sanctions-screening replacement or autonomous execution authority.

Current corridor semantics remain endpoint-composed. Full maritime-route, port-by-port, intermediary-jurisdiction, vessel, counterparty, correspondent-bank and complete supply-chain route modelling are not claimed unless separately validated.

See [docs/RISK_GATE.md](docs/RISK_GATE.md).

---

## Storage and continuity

Geomacro separates hot operational state from historical/continuity storage.

The intended production pattern is:

```text
Supabase HOT/control plane
  -> verified private B2 historical/continuity snapshots
  -> bounded ephemeral retrieval when current information is genuinely required
```

B2 continuity snapshots are private, bounded, schema-validated and fail closed when stale or invalid. Destructive archival cleanup must require upload verification/readback before source deletion; `storage.objects` is not deleted through SQL as a shortcut.

---

## Security and integrity

Core invariants include:

- versioned schemas and methodology;
- Ed25519 Risk Object signing where applicable;
- hash-bound product/audit artifacts;
- fail-closed commercial source eligibility;
- bounded request/rate/spend controls;
- payment/query/product binding;
- duplicate/replay protection;
- manual-review locking for ambiguous settlement;
- no customer execution authorization at the Geomacro boundary;
- no raw/source-identity leakage through customer-facing structured delivery.

See [SECURITY.md](SECURITY.md).

---

## Secondary technical proof

Arc Testnet, Circle/CCTP, prediction-market and bridge/swap code demonstrates how Geomacro intelligence can connect to programmable-finance workflows. These surfaces remain secondary technical proof and do not redefine the intelligence product.

Current public Arc technical-proof reference:

```text
Arc Testnet
0x2F874FB07084a22D2bB314D0762Af57Cb1856868
```

Technical-proof code must not be described as production mainnet institutional settlement unless separately activated and verified.

---

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

---

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

---

## License

Geomacro application code and product implementation are proprietary unless a file or dependency states otherwise. Third-party/source rights are governed separately from the repository licence.
