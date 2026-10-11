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

## Continuous evidence discovery without headline admission gates (2026-10-11)

**User decision:** no editorial, fixed keyword, 6-hour reviewer or commercial-payment gate **before** live first-party article discovery. Source observation now follows **capture first → SHA-only dedup → classify relevance → evidence confidence and freshness → optional verified signed product**. This preserves a single on-demand engine across Geopolitics, Macro/FX and Critical Minerals; there is no new Supabase project, raw news database, paid provider or mandatory partner service.

In the existing 30-minute source pulse, `probeExpandedSource(...,{openDiscovery:true,collectPrivateCandidates:true})` now captures original first-party publisher RSS/Atom items with an actual source-native `pubDate`/`published` even if their headlines contain none of our anticipated words. A bounded first-party article page `datePublished` verification may rescue an undated feed item; a feed `updated`, scrape/retrieval timestamp, upload or B2-restore clock never establishes an original event. Strict HTTPS, publisher host/path, MIME/body cap, forbidden 401/403/429 retry and 24-hour private SHA history remain unchanged. The original headline, complete URL, publisher page body and user text are not returned in the D1 observation record. Broader candidates have `article_category_relevance_verified:false`, `eligible_for_scoring:false` and `eligible_for_publication:false` until a separate downstream classifier verifies actual relevance and evidence.

The pulse now reports **three distinct numbers** rather than conflating no keyword hits with no data: (1) source-native first-party **all-topic original articles within 24 hours**, (2) original publisher items observed within **7 days, marked older/not current**, and (3) the historical *keyword-matched* 30/90-minute/6-hour counters for diagnostics only. D1 compact checkpoints store only those numerators and SHA-only duplicate history. A quiet weekend's zero 24h originals is an honest observation, not a country risk score of zero, nor a claim that nothing happened globally. Publisher article capture and category attribution are different claims.

**The following are not editorial discovery gates** and may not be removed from paid delivery: independently documented commercial-use rights, exact proof where reporting is contested, evidence-backed severity, Ed25519 signed artifact integrity, signature freshness/expiry, settlement replay safety and explicit mainnet owner ACK. Public website may offer correctly labeled *Observed/Unverified* derived-only metadata if an authorized product is explicitly designed, but may not advertise or charge for an unreviewed feed article as `VERIFIED` intelligence. Existing paid x402 and Federico/PREDGE lanes remain fail-closed until actual qualifying evidence is present.

## First genuinely signed private GRO acceptance — manual operational lane (2026-10-11)

`scripts/ops/accept-private-live-on-demand-gro.ts` connects previously merged #2037/#2038 **without inventing an active publisher, reviewer signature or customer payment**. This is a one-shot **Bun/Node filesystem** operator lane, not a Cloudflare Worker endpoint or automatic scheduled feed. It never loads frozen Supabase, writes B2/D1, logs raw reviewed originals or settles x402. It either produces a private exact canonical Ed25519 signed GRO with `record_sha256`, or fails closed.

The operator supplies an **actual** reviewer-signed private `geomacro.private-on-demand-gro-review-bundle.v1` package containing one country, one category, 1–12 reviewed genuine structured events and matching `{rows,eventPackages}`, where each event is bound into the independent reviewer's signature by `reviewed_scoring_event_sha256` and each original source is pinned to `source_registry_id`. Those records must be recent on the **actual original article publication clock** and independently corroborate the same event. The trusted reviewer public key, current GRO signing key and matching verification public key are supplied through secure server-side environment variables, **never** through ChatGPT, GitHub commits, CI logs, public payloads or ordinary chat. The existing B2 source-rights reader must independently confirm unexpired certified publisher-specific derived commercial rights.

Manual invocation, only on an owned server with Bun and private credentials securely configured:

```sh
# Make a PRIVATE directory outside this repository (owner-only 0700).
# Never put real reviewed original URLs, article hashes or secret keys in a PR.
mkdir -p /secure/geomacro-review
chmod 700 /secure/geomacro-review
# Separately provision reviewed.json there with file mode 0600.
export GEOMACRO_PRIVATE_REVIEW_DIR=/secure/geomacro-review
bun scripts/ops/accept-private-live-on-demand-gro.ts \\
  --input=/secure/geomacro-review/reviewed.json \\
  --out=/secure/geomacro-review/signed-gro.json
```

The exact file is created using exclusive/no-follow permissions (0600), never overwritten and never emitted in stdout. The console prints only category, ISO3 and record hash. An offline signed object is **not** automatically a Federico `approve`, PREDGE authorization, current D1 hot checkpoint, public API paid deliverable or user-authorized 0.05 USDC payment. The legal attribution-required source blocker remains open until fixed signed derived-product credit exists. A missing actual signed review bundle, trusted independent reviewer key, healthy B2 licence receipt or active GRO key is a failed acceptance—not a candidate to spoof with fixture data.

## Private signed-review + live B2 commercial-rights adapter (2026-10-11)

The new optional `src/lib/on-demand-reviewed-rights-qualifier.server.ts` reuses the **existing** independent same-event qualification module (`scripts/lib/independent-same-event-qualification.mjs`) and the **existing** fresh, max-24h B2 rights registry. Only private reviewer-signed packages can satisfy `scoreAndSignQualifiedOnDemandCountry`'s proof callback. The adapter is intentionally **not** called by public `live_on_demand` discovery and does not deploy a new source, database, queue, service or x402 processor.

A private reviewer must sign a package that includes `reviewed_scoring_event_sha256`, binding **the complete, exact** country scoring input (event type, geographic subject, score severity/confidence, source records, original clocks and relevance) into its existing Ed25519 signature. The package must also bind each first-party original to an explicit `source_registry_id` pinned to the originating organization's registered source ID. The canonical independent reviewer verifies exact structured event claims, two different originating organizations and hosts, distinct original article bytes/review receipts, native publication clocks, counterevidence and article-specific commercial-use rights attestations. Then the adapter requires a **fresh B2 commercial-rights registry row for each exact source**, certified and enabled for derived commercial use, with no duplicate row, no category mismatch and no raw redistribution. Attribution-required inputs are held until fixed, lawful source credit is included in the signed customer contract; no public raw URL is exposed to satisfy that obligation.

**Production remains blocked without a real independent signed editorial review package and currently eligible B2 rights rows.** The fixture tests intentionally generate their own Ed25519 keys and fake article bytes, which prove code interoperability only, never real-source authorization or live income. `GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM` is resolved privately from trusted server configuration; no customer-supplied key, unsigned flag or discovered RSS headline can substitute for it.

## Reusing the scorer for qualifying query-time events (2026-10-11)

The next private stage is `src/lib/on-demand-qualified-country-risk.server.ts`. It composes the existing **pure** `buildCountryRiskObject` scorer, commercial eligibility, observed-at binding, active-key Ed25519 signer, and exact canonical partner handoff. It neither copies the legacy Supabase event loader nor introduces a category-specific engine.

**Critical trust boundary:** `discoverOnDemandForPrivateQualification` and article page-date checks still return unverified discoveries, not scoring inputs. The new scorer explicitly requires a trusted backend `qualifyEvidence` implementation (no default), which must check independent same-event factual corroboration, actual commercial derived-use rights and exact evidence fingerprint. Until the real governed verifier produces that receipt, **do not call this scorer from the public API** and **do not quote x402**. Tests only inject synthetic qualification; these are code-contract tests, not evidence that live rights or 195-country coverage have been achieved.

The current vertical slice handles only recent (maximum six-hour original evidence clocks) country-scoped material events of the three Geomacro categories. Bounded annual official macro snapshots are **not** misdated as fresh news, and no fake severity is inferred from a headline. For an eligible future use, exact input events must have scored severity/relevance from an independently reviewed, governed methodology, two independent corroborating source families, positive evidence, per-event source rights, source-native original time and matching country/category. The existing scorer calculates risk, signs the exact GRO, and keeps commercial/partner verification fail-closed. Periodic global website publication and full live x402 delivery remain separate acceptance tasks.

## Simplification rule for new engineering

Before proposing a new database, workflow, model, risk engine or launch gate, document (a) which verified customer-facing outcome the existing single engine cannot supply, (b) the smallest reuse-first implementation, (c) measured impact on free-tier costs, and (d) an acceptance test. Reject purely architectural complexity without measurable commercial benefit.
