# Geomacro — Simplified On-Demand Commercial Architecture

**Decision date:** 2026-10-11  
**Status:** Target product architecture; only explicitly evidenced components are implemented.  
**Parent tracker:** https://github.com/blocknine0/geomacro/issues/1827

## The entire customer product in four steps

1. **Ask:** A human or AI agent submits one country/topic/commodity-scoped question.
2. **Find:** One shared orchestrator checks relevant existing state and permitted live original publishers / official data APIs. Upstream receives only bounded public search terms, never the customer's freeform question or identity.
3. **Create:** Normalize and deduplicate the evidence; check source-native dates, relevance, factual support, independent corroboration where needed, commercial-use rights, conflicting evidence; calculate an explicit evidence-backed risk assessment; produce **derived-only structured JSON** and cryptographically sign the exact output.
4. **Pay and deliver:** Prepare and freeze the deliverable before quoting x402. Bind payment to that exact query and output, settle only after valid authorization, then deliver the same signed response. Failed preparation, stale/insufficient evidence or ambiguous rights **never become chargeable**. Replay must not charge twice.

**One canonical backend:** `POST /api/v1/intelligence/query`. Its three category aliases (`/api/v1/intelligence/geopolitics`, `/api/v1/intelligence/macro-fx`, `/api/v1/intelligence/critical-minerals`) reuse the same query, verification, signing and settlement logic. Do **not** add separate category intelligence engines.

## Scope

- **Three categories:** Geopolitics; Macro/FX; Critical Minerals.
- **Commercial value:** Cause → quantified risk/impact → direction/trend → confidence → original event time/freshness → canonical hash/signature.
- **Sources:** Existing official APIs, relevant original news and explicitly permitted live feeds. Source access alone is not a licence for commercial derivative use.
- **Outputs:** No raw provider payloads, source articles, publisher URLs, upstream source identities, private evidence blobs or personal data.
- **Infrastructure:** First reuse the present code, Cloudflare Worker/DO/D1 and private B2 **only when required for correctness, cache, durable payment claims or necessary audit**. New frozen-Supabase bulk writes are not permitted. Avoid new compulsory data stores, hosted models, paid connectors or pre-ingestion systems.
- **Quota discipline:** Bounded provider fanout, timeouts, request coalescing, retry budgets and a small derived-only cache. Free-tier ceilings are real; a service cannot promise unlimited no-cost calls.
- **No-charge discovery must survive payment configuration outages:** the `live_on_demand` query branch runs its bounded read-only source discovery without requiring Coinbase CDP/wallet configuration; it always returns no-charge/verification-pending until a verified, signed, commercial-rights-qualified deliverable exists. The existing `published_only` x402 configuration, authorization, settlement and replay gates remain mandatory. Never accept a payment-signature header as evidence that raw discovery is chargeable.
- **Not launch preconditions:** 195 countries must each publish new events daily; three fully replicated data warehouses; a new scored story every 30 minutes; monthly subscriptions; speculative product surfaces. These are **not** requirements for charging for an individually verified eligible question.

## Minimal implementation milestones

| Milestone | Acceptance proof | State at decision |
| --- | --- | --- |
| A. Relevant on-demand evidence | The real query controls its country/topic/commodity discovery with fixed bounded provider terms | Country/category exists; commodity filter proposed in this PR |
| B. Verified derived assessment | Genuine relevant originals/official facts, appropriate independent verification, permitted commercial use, explicit confidence/uncertainty, source-native freshness and provenance retained privately | Not yet accepted for live on-demand |
| C. Exact signed deliverable | Deterministic JSON, reproducible assessment inputs, verified active signer, tamper rejection; no raw source fields | Existing GRO/signing components exist; live-on-demand bridge pending |
| D. Safe x402 | Prepared product → 402 quote → bound authorization → one settlement → exact response/replay with no double charge | Existing stored-state payment path; live-on-demand gated |
| E. Production | Same deployment SHA, three real category queries, failure/retry tests, quota and payment reconciliation | Not yet accepted |

**First live example:** `What is the current lithium supply risk in China?` should search for *lithium* and *China*, not loosely all critical minerals. Multiple distinct minerals must be explicitly scoped rather than falsely merged into one assessment. A failed or unavailable result can be useful but is **not** a paid successful intelligence result.

## Governance: fewer dependencies, never weaker truth

- Distinguish **finding information** from **verifying evidence**, **signing an actual derived assessment**, and **payment eligibility**. Do not set those flags based on a healthy source HTTP response or an index hit.
- An authentic primary statistical release can support the specific published metric on its own; genuinely disputed or consequential news claims should obtain independent corroboration or explicitly state that corroboration is absent. Do not artificially duplicate one originating publisher as two sources.
- A precise source-native observation period differs from "searched at". Never refresh intelligence timestamps using API fetch, cache or storage time.
- Keep evidence and review records private; retain only the bounded material that real reproducibility, rights and audit obligations require.
- Unverifiable requests return truthful no-charge statuses. Unreviewed external Telegram channels remain discovery leads only.
- Real-money activation requires separate explicit owner approval and an accepted first 0.05 USDC live purchase. This document **does not grant authorization**.
- The existing #1827 tracker continues to hold independent factual/security/partner obligations. It must not inflate the minimal **first eligible paid answer** into a requirement that every historical feature is complete.

## Permanent Supabase-free partner interoperability decision (2026-10-11)

- **No per-category Supabase account/database is necessary** to respond to a customer question. One canonical on-demand intelligence engine searches, verifies, scores and signs using bounded ephemeral processing. Existing D1/Durable Objects retain only necessary payment, deduplication and audit metadata; B2 may hold the minimum immutable signed artifact/proof needed for reproducible authorized partner review. Do not restart frozen Supabase bulk writers to provide live coverage.
- **Never discard the exact signed Risk Object required by a receiver.** `gro-1.1`, `geomacro-canonical-json-v1`, active-key Ed25519 signing, hash reproducibility, source-native freshness, evidence independence, commercial-use rights and tamper rejection remain invariant regardless of source storage.
- A private query-time helper, `src/lib/on-demand-partner-artifact.server.ts`, validates an already prepared signed GRO against an explicitly trusted key set and the existing commercial policy, emits its exact canonical record bytes plus SHA-256, and can construct Federico's established `{ risk_object, as_of }` envelope. No network call, database mutation, B2 write, external review, payment or partner allowance is performed by this helper.
- **Federico:** preserve `FEDERICO_STRICT` source/semantic admission and existing exact-record external `/review` verifier; a locally signed object or synthetic positive-control vector **is not** a signed Federico approval. An actual signed `approve` plus independent proof verification is still required for external admission.
- **PREDGE (separate isolated pilot):** retain the already-built `geomacro-predge-pilot` Worker/D1 integration, not a new adapter inside the canonical Geomacro engine. It verifies PREDGE's signed `GET /v1/settlement-risk/{market}` response using the separately pinned Ed25519 public key and exact canonical UTF-8 bytes, never unsigned market labels or unverified response key IDs. Preserve `risk-gate-1.0`, `execution_authorized=false`, fail-closed freshness/market binding, default 100 checks/day and hard ceiling 500/day, D1 **daily counters only**, no PREDGE/Geomacro payload persistence and no main Supabase/B2/x402 secrets. The PREDGE live pilot remains blocked until remote partner-specific quota/credential, independent live sandbox capture and signed/countersigned LOI/kickoff are verified; do not claim it is active.
- Durable retention is *selective*, not zero: minimal exact signed GRO and relevant proof when partner replay/audit requires it, plus D1 payment idempotency and reconciliation records. Do not archive bulk raw provider feeds merely to make the canonical engine work.
- The current query-time discovery path is **not yet a signed payable result**. Implement evidence-to-score-to-signer integration and prove three category requests, trust and replay before an authorized real-money launch. This decision introduces no additional launch gate beyond the existing safety/rights/signing/payment acceptance.

## Reusing the scorer for qualifying query-time events (2026-10-11)

The next private stage is `src/lib/on-demand-qualified-country-risk.server.ts`. It composes the existing **pure** `buildCountryRiskObject` scorer, commercial eligibility, observed-at binding, active-key Ed25519 signer, and exact canonical partner handoff. It neither copies the legacy Supabase event loader nor introduces a category-specific engine.

**Critical trust boundary:** `discoverOnDemandForPrivateQualification` and article page-date checks still return unverified discoveries, not scoring inputs. The new scorer explicitly requires a trusted backend `qualifyEvidence` implementation (no default), which must check independent same-event factual corroboration, actual commercial derived-use rights and exact evidence fingerprint. Until the real governed verifier produces that receipt, **do not call this scorer from the public API** and **do not quote x402**. Tests only inject synthetic qualification; these are code-contract tests, not evidence that live rights or 195-country coverage have been achieved.

The current vertical slice handles only recent (maximum six-hour original evidence clocks) country-scoped material events of the three Geomacro categories. Bounded annual official macro snapshots are **not** misdated as fresh news, and no fake severity is inferred from a headline. For an eligible future use, exact input events must have scored severity/relevance from an independently reviewed, governed methodology, two independent corroborating source families, positive evidence, per-event source rights, source-native original time and matching country/category. The existing scorer calculates risk, signs the exact GRO, and keeps commercial/partner verification fail-closed. Periodic global website publication and full live x402 delivery remain separate acceptance tasks.

## Simplification rule for new engineering

Before proposing a new database, workflow, model, risk engine or launch gate, document (a) which verified customer-facing outcome the existing single engine cannot supply, (b) the smallest reuse-first implementation, (c) measured impact on free-tier costs, and (d) an acceptance test. Reject purely architectural complexity without measurable commercial benefit.
