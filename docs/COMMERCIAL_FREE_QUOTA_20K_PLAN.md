# Geomacro Commercial Free-Quota Plan: First 20,000 Paid x402 Deliveries

Status: launch architecture and operating policy. This document is not a production-readiness certificate and does not authorize real-money settlement.

Date locked: 2026-09-30

## 1. Commercial objective

Geomacro will launch as pay-per-call risk intelligence for humans and machines while keeping Geomacro-owned production infrastructure at zero or near-zero fixed cost for the first cumulative 20,000 successful paid x402 deliveries.

The first cohort is designed to create real revenue before recurring paid infrastructure is added. Paid services are introduced only from settled Geomacro revenue and only when measured usage shows that a free-tier component is becoming the actual bottleneck.

The cohort target is 20,000 successful paid deliveries, not 20,000 payment attempts, HTTP requests, users, wallets or settlement transactions.

Initial reference offer remains 0.05 USDC per successful paid delivery unless an explicit pricing review changes it. At 20,000 successful deliveries that reference price is 1,000 USDC gross receipts before provider, network, tax, refund or other costs.

## 2. Product boundary

### Launch-facing products

1. Risk Intelligence
2. Geopolitical Risk Index
3. Macroeconomic Risk Index
4. Critical Minerals Risk Index
5. Ask Geomacro
6. Machine-readable adaptive risk intelligence through x402
7. Governed country and directional-corridor context where deliverability and commercial eligibility are proven

Risk Objects and Risk Gate remain governed capabilities and must keep their current scope and `execution_authorized=false` boundary until separately promoted.

Prediction markets, bridge/swap and other programmable-finance demos are not part of the commercial launch identity. They remain separate technical proof surfaces.

### Permanent external data boundary

Customer and machine responses expose approved structured intelligence only.

Never expose:

- raw source URLs;
- raw article, document, feed or source text;
- provider names or provider implementation details in product answers;
- internal search queries or retrieval payloads;
- private provenance objects;
- service credentials;
- source-rights records;
- internal scoring/debug metadata not approved by the public response contract.

Internal evidence may be retained for audit and verification. The external path is always:

`Private evidence -> verify/normalize -> governed intelligence -> structured answer`

## 3. Canonical structured answer

Every paid response should be useful without returning raw data. Human and machine surfaces may present the same canonical fields differently.

Recommended v1 response contract:

```json
{
  "request_id": "...",
  "product": "geomacro_adaptive_risk_intelligence_v1",
  "subject": {},
  "as_of": "...",
  "assessment": "...",
  "what_changed": ["..."],
  "why_it_matters": ["..."],
  "impact_channels": ["..."],
  "risk_dimensions": {
    "geopolitics": {},
    "macro": {},
    "critical_minerals": {}
  },
  "confidence": "...",
  "freshness": "...",
  "coverage": "...",
  "watch_next": ["..."],
  "limitations": ["..."],
  "integrity": {
    "methodology_version": "...",
    "object_hash": "..."
  },
  "payment": {
    "charged": true,
    "idempotent_replay": false
  },
  "execution_authorized": false
}
```

The answer should lead with the conclusion, then cause, impact and watch-next signals. Do not make the user reconstruct meaning from rows of raw observations.

## 4. Return-use design

The product should give customers a reason to call Geomacro again without manufacturing urgency.

Every repeatable subject should support as many of these fields as verified data allows:

- what changed since the previous verified state;
- direction of change by risk domain;
- confidence and freshness;
- major impact channels;
- new versus persistent drivers;
- explicit missing coverage;
- what to watch next;
- stable machine schema;
- idempotent paid replay;
- integrity hash/methodology version.

This makes the product useful for monitoring, agents, research workflows and decision review without exposing source identities.

## 5. Free-quota architecture

### B2: evidence and archive plane

Backblaze B2 is the primary store for raw/history/archive payloads.

Rules:

- new raw payloads should go to B2 first whenever the ingest path supports it;
- Supabase must not become the long-term raw archive;
- archived payloads require checksum, object identity and readback verification before the hot copy is removed;
- never delete unverified data;
- never delete `storage.objects` through SQL;
- use supported Storage API deletion only after B2 verification;
- keep object layout append-friendly and sharded so cleanup does not require large list scans.

First-cohort internal B2 budget:

- keep existing plus new Geomacro data below 8 GB unless current free-tier capacity is re-verified;
- reserve at least 2 GB safety margin under a 10 GB free storage allowance;
- target paid-cohort incremental archive at or below 1.28 GB, equivalent to an average 64 KiB retained archive object per successful delivery;
- do not perform a B2 read for every paid request when current structured state already exists in the hot read model;
- use B2 for cold fallback, evidence recovery, audit and historical lookup, not as a chatty per-field transactional database.

### Supabase: hot read model and control plane

Supabase is not the archive. It should retain only data that must be queried transactionally or with low latency.

Keep:

- current compact structured state;
- current index/snapshot state;
- minimal subject and coverage indexes;
- commercial entitlement/payment state while the D1 cutover is not proven;
- short-lived operational queues/cursors;
- integrity pointers and B2 object references where required.

Move or compact:

- raw payload bodies;
- old external observations;
- old structured event bodies/evidence bodies;
- old raw source snapshots;
- historical fragments that have verified archive copies;
- storage objects already verified in B2.

Observed production database on 2026-09-30: 451,005,587 bytes, about 430 MB. This is too close to a 500 MB free database ceiling for a 20,000-delivery cohort.

Launch gate:

- database size must be reduced to at most 350 MiB before real-money cohort activation;
- preferred steady-state baseline is at most 300 MiB;
- cohort growth budget is at most 40 MiB;
- maintenance/headroom reserve is at least 10 MiB;
- no launch if the database cannot remain below the internal 350 MiB ceiling under a representative canary workload.

Current largest reclaim targets are the external-observation, structured-event, storage-object, evidence, raw-snapshot and fragment families. Reclaim must preserve fail-closed B2 verification rules.

### D1 and Cloudflare Worker: atomic x402 ledger

The repository already contains an independent `workers/x402-ledger` design using Cloudflare Worker + D1. That is the preferred long-term first-cohort payment/replay ledger because it stores only hashes and delivery state and keeps raw evidence out of the payment plane.

Cutover rule:

- do not switch from the current Supabase ledger merely because the D1 code exists;
- create/configure D1 once;
- apply schema;
- configure a server-only shared secret;
- pass claim -> prepare -> complete -> replay, conflict, lease-expiry and manual-review acceptance tests;
- rerun x402 safety tests;
- then set `X402_LEDGER_BACKEND=edge_d1`;
- keep the Supabase ledger as fallback until production evidence proves D1 is stable.

Free-plan capacity should be treated conservatively. A 20,000-delivery cohort is far below the current Cloudflare Workers free daily request ceiling if the ledger is not called excessively, but admission control must still fail closed if daily free capacity is near its reserve floor.

### GitHub Actions: background work

Use public-repository standard runners for controlled scheduled jobs, audits and batch maintenance where appropriate.

Rules:

- no high-frequency polling when demand-triggered refresh can do the same job;
- nonessential recurring validation remains quota-held;
- CI is not a real-time customer request path;
- a paid request must never wait for a GitHub Actions job to finish;
- heavy historical backfills stay in the historical-data repository and do not share the live request budget.

### Website/static assets

Keep landing, product explanation, docs, status text and machine discovery as static/cacheable as possible. Do not spend database or Edge quota to render marketing copy.

## 6. Per-delivery quota budget

The system must reserve budget before asking for payment.

For the first 20,000 successful paid deliveries, target:

| Resource | Cohort target | Average ceiling per successful delivery |
| --- | ---: | ---: |
| Supabase Edge invocations | <= 80,000 | <= 4 |
| Supabase egress attributable to paid cohort | <= 1.0 GB | <= 50 KB |
| Supabase DB growth | <= 40 MiB | <= ~2 KiB durable average plus indexes/overhead |
| B2 incremental archive | <= 1.28 GB | <= 64 KiB |
| D1/Worker ledger requests | <= 100,000 | <= 5 |
| Mandatory paid LLM/API calls | 0 | 0 |

These are internal operating budgets, not provider promises. Current provider limits must be re-verified at launch and monitored throughout the cohort.

## 7. AI and inference policy

No paid delivery may depend on a third-party paid LLM call during the zero/near-zero-cost cohort.

Priority order:

1. deterministic assembly from current verified structured state;
2. cached/precomputed explanation;
3. bounded free-provider enrichment only when quota has already been reserved;
4. deterministic degraded answer that remains within the public schema.

If a free AI/provider quota is unavailable, Geomacro should still return a useful deterministic structured answer when the underlying verified intelligence is deliverable. Do not accept payment for an answer that can only be produced by an unavailable dependency.

## 8. Availability-first paid lifecycle

Canonical sequence:

1. Validate request and subject.
2. Check commercial source eligibility.
3. Check current structured state/freshness.
4. Reserve all required free-tier capacity.
5. Prepare the exact response or prove it can be prepared.
6. If not deliverable, return no-charge unavailable/degraded state.
7. If deliverable and unpaid, return HTTP 402 payment requirements.
8. Bind payment fingerprint to request/configuration fingerprint.
9. Claim idempotency state.
10. Verify payment.
11. Cross the irreversible settlement boundary only after the response is prepared.
12. Settle through the active provider.
13. Complete ledger atomically.
14. Return the exact prepared structured response.
15. Same payment + same request = replay cached delivery, never charge twice.
16. Same payment + changed request = conflict, no second settlement.
17. Ambiguous post-settlement state = manual review, never automatic re-charge.

## 9. Payment rail policy for the 20k cohort

The codebase currently contains both Coinbase x402 production work and Circle Gateway x402 batching work.

### Primary candidate: Circle Gateway batching

The Circle adapter uses `@circle-fin/x402-batching` and checks for `GatewayWalletBatched` support on Base mainnet. This is the preferred first-cohort candidate because the SDK is designed for off-chain signed payments with batched settlement.

Do not assume a fixed batch size such as 500 deliveries or assume a specific provider operation count from documentation alone. The current Geomacro route still invokes the SDK settlement method for a paid request. Actual seller/provider/onchain economics must be measured with a real canary and reconciled before 20k capacity is certified.

Required canary evidence:

- one controlled real paid call;
- exact USDC amount/receiver/network verified;
- same-proof replay causes no second economic charge;
- changed-query proof reuse fails;
- provider transaction/accounting semantics recorded;
- 10, then 100 controlled calls demonstrate expected batching behavior and no unexpected seller-funded recurring cost;
- only then calculate the real 20k payment-operation budget.

Keep the currently pinned SDK version during launch certification. Dependency upgrades are separate changes and require their own tests.

### Coinbase x402

Coinbase exact settlement remains a production-capable fallback path, but it must not be the default first-cohort route if exact-per-call settlement creates a paid operation or network-cost profile that violates the zero/near-zero fixed-cost objective.

Fallback use requires its own measured capacity and cost reservation. Do not silently fail over from a zero-cost batch rail to a paid exact rail.

## 10. Admission controller

Use one centralized logical quota controller for all paid traffic.

Before returning a payable 402 challenge, reserve worst-case budget for:

- hot DB reads/writes;
- Supabase egress/Edge calls if used;
- Worker/D1 ledger operations;
- B2 cold reads/writes if needed;
- external free-provider capacity;
- payment-provider capacity;
- response bytes;
- log budget.

Watermarks:

- green: < 60% of any free quota, normal operation;
- yellow: 60-80%, reduce refresh frequency and expensive optional enrichment;
- orange: 80-90%, paid endpoint only for fully hot/cached deterministic paths;
- red: >= 90%, stop issuing new payable challenges for paths that could exceed the free allowance.

Never auto-upgrade a provider plan and never generate an unbudgeted paid overage.

## 11. Logging policy

No raw source content, payment proof, credentials or full answer payload belongs in logs.

Log only compact operational fields:

- request id;
- product id;
- latency bucket;
- result code;
- provider rail label where operationally required;
- byte counts;
- quota reservation/result;
- payment state without raw signatures;
- replay/conflict/manual-review state.

Current production observations show storage and edge logs are the dominant log producers. Removing chatty Supabase Storage activity from the live path is therefore both a DB/storage and log-ingestion optimization.

## 12. Historical-data contract

The private historical repository remains a provenance-first warehouse, not a browser/API backend.

Rules:

- only curated commercial serving views may feed paid output;
- review-gated/restricted rows remain excluded;
- raw warehouse tables and historical service-role credentials never reach browser code;
- missing values stay missing, never converted to zero;
- historical evidence does not silently change GRI/GRO methodology;
- source-rights policy is a commercial launch gate independent of technical ingestability.

## 13. Website commercial redesign

### 40-second homepage goal

A new visitor should understand these points without scrolling deeply:

1. Geomacro is global geopolitical, macroeconomic and critical-mineral risk intelligence.
2. It converts world events into decision-ready structured answers.
3. Humans can explore/ask; machines can call an API and pay per successful call.
4. Outputs explain what changed, why it matters, impact and what to watch next.
5. Raw sources/evidence stay private; customers receive governed intelligence, not a raw-data dump.
6. Risk execution remains customer-controlled.

### Desktop/mobile information architecture

Primary navigation should prioritize:

- Intelligence
- Risk Indices
- Ask Geomacro
- Data & API
- one secondary menu for institutions, research, docs, trust and roadmap

Technical-proof surfaces should remain behind a separate secondary menu and should not compete with the commercial product identity.

### Homepage sections

Keep only six short sections:

1. Hero with human + machine value proposition and two primary CTAs.
2. Compact structured-answer preview.
3. Three core domains: Geopolitics, Macro, Critical Minerals.
4. Human / Machine / Private-evidence value strip.
5. Three-step flow: verify privately -> structure intelligence -> deliver answer.
6. Commercial CTA: explore now / machine access / contact.

Avoid long paragraphs, repeated disclaimers, giant product inventories and roadmap walls on the homepage.

### Copy direction

Preferred hero:

**Decision-ready global risk intelligence for humans and machines.**

Supporting line:

**Geomacro turns geopolitical, macroeconomic and critical-mineral developments into structured answers: what changed, why it matters, likely impact and what to watch next.**

Product promise:

**No raw-data dump. No source hunting. Just governed, structured intelligence with confidence, freshness and clear limits.**

Commercial machine CTA must remain runtime-truthful. Before real-money activation it should say `Machine access` or `x402 pre-launch`; after the endpoint itself reports production readiness it may say `Pay per call`.

## 14. Revenue-funded scaling

Create an infrastructure reserve from settled receipts rather than adding recurring costs in advance.

Default policy:

- reserve 20% of net settled commercial receipts for infrastructure/security capacity;
- do not commit recurring spend that the reserve cannot cover for at least three months;
- buy the component that is measurably constraining paid deliveries, not the component with the most attractive upgrade page.

Priority when revenue justifies upgrades:

1. remove any reliability bottleneck on paid request/ledger path;
2. expand hot database headroom only if B2-first compaction is already working;
3. expand edge/compute only if request volume requires it;
4. add paid observability only after producer-side log reduction is complete;
5. add paid AI only when its incremental revenue/quality benefit is measured.

## 15. Launch gates

The first real-money cohort is allowed only when all are true:

- production DB <= 350 MiB;
- B2 canary upload + readback + hash verification passes;
- no eligible archive cleanup uses unverified deletion;
- no `storage.objects` deletion is performed through SQL;
- current commercial source-rights gate passes;
- no mandatory per-call paid AI/provider dependency;
- x402 request/payment/delivery idempotency tests pass;
- real-money provider canary proves network, asset, amount, receiver and replay behavior;
- payment economics are measured rather than assumed;
- quota controller can refuse new payable work before an overage;
- paid response contains no raw source URL/content/provider detail;
- public website and discovery metadata describe the actual runtime state;
- CI, security/CodeQL, schema safety and canonical readiness checks pass;
- user-facing mobile and desktop homepage pass the 40-second comprehension review.

## 16. Cohort checkpoints

### 0 -> 100 paid deliveries

Treat as production canary. No paid infrastructure upgrade. Measure actual bytes, DB growth, logs, provider operations and failures.

### 100 -> 2,000

Tune caching, structured response size and archive cadence. Keep cohort under green/yellow quota thresholds.

### 2,000 -> 5,000

Recalculate the 20k forecast from observed p95 resource cost per delivery. If any resource projects above 80% of free capacity, reduce workload before accepting more payable traffic.

### 5,000 -> 10,000

Validate repeat-customer behavior, most-used query shapes and unit economics. Do not expand product scope merely to increase usage.

### 10,000 -> 20,000

Use settled revenue reserve for the first paid component only if measured reliability/capacity requires it. Preserve the same raw-data boundary and fail-closed payment lifecycle.

## 17. Definition of success

The first cohort is successful when:

- 20,000 paid deliveries complete without an unintended provider overage;
- Geomacro has real settled revenue;
- DB/storage/log growth remains inside reserved capacity;
- payment replay never causes a duplicate charge;
- customer responses remain source-protected and structured;
- raw/history storage remains recoverable from verified archive;
- the website clearly separates current commercial product from technical proof;
- revenue data identifies the first paid infrastructure component that is actually worth buying.
