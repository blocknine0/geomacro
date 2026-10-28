# GeoMacro launch: nine acceptance gates and founder handoff

**Audit checkpoint:** 2026-10-28 UTC. **Status:** PRE-LAUNCH / NO REAL FUNDS.
**Canonical issue:** [#1827](https://github.com/blocknine0/geomacro/issues/1827). Website [#2053](https://github.com/blocknine0/geomacro/issues/2053); historical numerical GRI [#2103](https://github.com/blocknine0/geomacro/issues/2103); Actions cleanup [#2945](https://github.com/blocknine0/geomacro/issues/2945).

This is an execution/acceptance matrix, **not a claim that a scheduled run, green workflow, or GitHub merge constitutes a successful production launch**. Re-evaluate every gate against the exact deployed SHA and actual provider/customer readbacks. Do not fill unknowns with simulated data, historic rows, synthetic scores, or skipped steps.

## Two independent release decisions

- **Limited public free-source launch:** only the existing unscored, properly labelled and qualified published Finds. No promises of universal geography, timeliness, signed products, paid APIs or a 72-hour uptime guarantee. Requires real deployed website parity, truthful category availability and mobile/browser acceptance.
- **Paid/machine launch:** separate **NO-GO** until all P0 gates 1–6 pass, real signed products are available, and the founder separately authorizes production funds/checkout. Readiness probes are not payment authorization. All 12 product variants remain subject to their capability-specific data ceiling and exact-request qualification.

## Current known evidence (not sufficient for closure)

| Evidence | What it proves | What it does not prove |
| --- | --- | --- |
| [PR #3050](https://github.com/blocknine0/geomacro/pull/3050), merged | 72-hour checker no longer accepts an incomplete window | 72 actual continuous accepted hours |
| [D1 workflow run 40707481714](https://github.com/blocknine0/geomacro/actions/runs/40707481714) | Deployment workflow completed successfully | Exact deployed Worker SHA, D1 migration/readback and all service endpoints |
| [D1 observatory run 40707781616](https://github.com/blocknine0/geomacro/actions/runs/40707781616) | A provider observation run completed | Daily assessment job ran (it was skipped), or 72-hour sustained acceptance passed |
| [Free-site health run 40707481690](https://github.com/blocknine0/geomacro/actions/runs/40707481690) | Live public parity checker executed | Website release: reported LIVE_BUILD_PARITY_UNVERIFIED |
| [Five-minute fastlane run 40707846378](https://github.com/blocknine0/geomacro/actions/runs/40707846378) | Quota/cadence admission logic executed | New publication: source slot was held / cadence not due |
| [Signed GRI run 40707855274](https://github.com/blocknine0/geomacro/actions/runs/40707855274) | Standing-owner policy and no-funds signing admission checked | Current GRI published: signed input pointer/certificates/approval missing |
| [Private country audit run 40707781813](https://github.com/blocknine0/geomacro/actions/runs/40707781813) | Auditor executed and failed closed | 195-country qualified coverage (audit unavailable) |

## Launch acceptance

| Gate | Priority | Required independent PASS evidence | Latest decision | Owner action |
| --- | --- | --- | --- | --- |
| 1. D1 quotas/continuity | P0 | > =72 real consecutive hours with boundary receipt, no missing/gap or silently lost backlog; provider read/write counters, bounded recovery and independent D1 write/readback | PENDING | Cloudflare quota telemetry and 72-hour run evidence; no paid upgrade assumed |
| 2. Genuine three-category current intake | P0 | Real publisher-native dated source/evidence for Geopolitics, Macro/FX and Critical Minerals, accurate country attribution and canonical readback; explicit degraded gaps | PENDING | Source collection/operator audit, never auto-approve merely on arrival |
| 3. Reviewed signed GRO/GRI/Risk Indices | P0 | Genuine fresh reviewed original inputs; independent reviewer + country/category certificate signatures; verified Ed25519 object/hash/key and same canonical payload | BLOCKED | Authorized independent reviewer supplies real signed packet/certificates |
| 4. Production publication/pipeline | P0 | Exact deployed main SHA on website and Workers, migration state, no-funds signed hot readback B2→D1→edge, deep health truthful; no SSR or browser hidden failure | PENDING | Publish already-mirrored Lovable source, then independently check exact SHA and browser QA |
| 5. Exact buyer/machine delivery | P0 | Each selected price/product: exact request→admitted source proof→qualified immutable prepared response→customer-visible bounded JSON→independent replay; fail-closed insufficient data | PENDING | Run existing commercial no-funds strict acceptance; record exact offer/response hash |
| 6. USDC real-money checkout | P0 | Explicitly approved network/asset/amount/merchant; verified settlement, replay/idempotency, refund/underpayment failure, reconciliation order→entitlement→delivery | LOCKED | Founder merchant/network and real-money sign-off. No live transfers by default |
| 7. Public website UX | P1 | Main/mirror/site parity; honest freshness; mobile navigation, keyboard/screen-reader and multi-language controls; no misleading LIVE badge; supported routes all 200 | PENDING | Founder Website Lock-approved change + actual Lovable publication/QA |
| 8. Ops cleanup | P1 | Proven workflow retirement, no duplicate high-cost schedules, proper escalation/backlog and response to outage; PREDGE capacity not affected | PARTIAL | Incremental reversible workflow audit, no blanket removal |
| 9. Marketing and conversion | P1 | Accurate copy, SEO checks, verified public listing URLs, public demo and manual lead routing; record actual approvals, not just submissions | CONTENT PREPARED | Public launch is separate founder decision; manual directory account/submission steps |

## Minimum required acceptance receipts

For **every** gate record:
1. UTC observation timestamp, canonical commit SHA and deployed SHA(s).
2. Exact workflow run URL, job name and **whether the critical step executed, skipped or held**. A green job with skipped critical work is *pending*, not passed.
3. Public sanitized result with numerical counts and producer-native times only where actually observed; internal source list, raw bytes, private tokens and partner identity remain strictly server-side.
4. D1/B2/Actions account-wide measured consumption and remaining quota when applicable. Estimate is not provider measurement.
5. Negative-path result: stale, insufficient, missing, invalid key, slow/failed provider, no-funds payment attempt, duplicates.
6. Sign-off: operator, reviewer/owner (when required) and decision `PASS`, `FAIL`, `BLOCKED` or `NOT_RUN`.

Do not close #1827 solely on CI. PREDGE continuity and authenticated parity remain distinct protected evidence; **do not modify PREDGE code, workflows, tokens, storage or behavior**. Historical ingestion and its separate Supabase/repository remain locked. No customer should receive private original source material or misleading verified/signed/freshness assertions.

## Founder-only handoff / explicit decisions

**A. Independent review (required for GRI):** nominate an actually authorized reviewer; provide a current independently attested original-evidence/reviewed GRI input pointer, distinct signed country/category certificates and approval window in the existing governed envelope. Signing cannot be generated from approval assertions, cached old scores or automated marketing data.

**B. Website publication:** the original Website Lock and exact approved baseline must pass; publish the exact canonical mirrored commit from the existing Lovable project. A GitHub mirror success alone is not publication. Verify `/.well-known/geomacro-build.json`, free derived health and mobile browser; reject old SHA until fixed. The website may legitimately describe product areas in development but may not claim missing live proof.

**C. Funds (do not act without separate authorization):** specify merchant legal identity, production network, exact USDC token/contract, recipient/settlement processor, charge amount/pricing version, refund policy, reconciliation owner and capped smoke test. Do not collect or settle real USDC from this checklist alone.

**D. Global marketing:** approve final customer-facing copy and contact intake; use only observed product capabilities. No fabricated 195 × 3 coverage, uninterrupted news SLA, audited risk accuracy, globally compliant payments or paid availability.

## Incident / rollback decisions

- D1 rows-read low, collector hold, retry queue growing: throttle *discretionary* jobs; do not fake ingestion success or raid protected PREDGE headroom; assess quota after UTC reset with independent provider counter.
- Website main SHA mismatch: hold public launch claim and sign-off; do not weaken parity verifier.
- No current signed object: show unavailable/stale with timestamp; do not unlock paid price/checkout on a historic object.
- Payment auth, settlement or reconciliation failure: preserve lock and fail closed; never issue entitlement on a partial order.
- Source-qualified gap: state category-specific gap, not that all current items are verified.

This document is intentionally safe to merge without touching production secrets, frozen partners, raw sources, website presentation or payment code.
