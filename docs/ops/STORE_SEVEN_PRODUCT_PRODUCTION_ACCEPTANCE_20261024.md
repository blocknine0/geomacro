# Seven-product Geomacro Store: genuine creation-to-delivery acceptance

**Date:** 2026-10-24. **Status:** Source-level creation paths are implemented by merged PR #2795, but per-variant **genuine production acceptance is NOT thereby certified**. This document is an operator release gate, not a new engine, a new subscription, an approval override or a claim of revenue.

## Single canonical creation chain

1. Choose one explicit `product: {capability, variant}` at `POST /api/v1/intelligence/query`, with the matching country/corridor, allowed topics, fulfillment and delivery tier.
2. Build one query plan and deterministic request hash; reject unsupported subject/topic/variant, price-tier inflation and ambiguous date requests.
3. Read only authentic native-timestamped original-derived source observations from the existing D1/B2- and governed fallback engines, applying country/corridor/dimension mapping and live freshness.
4. Confirm source-specific commercial derived-use rights and required attribution. Rights cannot be created by hiding raw data. Reject missing evidence, contradictions, stale data and unknown permissions.
5. For score/risk products, verify an actual properly scoped and unexpired commercial GRO signature, independent authority policies and canonical subject. Never synthesize scores from an unscored digest or a derived-news receipt.
6. Assemble and sanitize the buyer's *exact* variant output; run buyer-value, structured field, no-raw-data, no-execution and independently bound source checks.
7. Recheck right-to-sell; freeze immutable response bytes in the existing Durable Object; verify two separate readbacks and exact SHA256 and query/price/asset/chain/pay-to/expiry binding **before** an HTTP 402.
8. After explicitly authorized client payment only, run provider verification, durable idempotent claim/usage guard, exact prepared-byte recheck, settlement and customer delivery. Duplicate or ambiguous payment enters reconciliation, never blind settlement retry.

The earlier `gri_read` public Store product has been retired. Existing signed GRI/Risk Indices dependencies remain independent data-production obligations and do not become Store capabilities.

## Acceptance matrix (every one is a separate real case)

| Product | Variants / exact USDC | Required authentic product proof before 402 |
| --- | --- | --- |
| Country digest | standard 0.02 | One country, one complete current-to-own-source-SLA structural dimension, rights-cleared observation/hash; no signed score claim |
| Corridor digest | standard 0.05 | Directional pair with each endpoint covered by real evidence for the selected dimension; explicit composed-not-route-modelled semantics |
| Country profile | standard 0.03 | Same ISO3, at least two qualified structural dimensions, governed history only where real |
| Corridor profile | standard 0.08 | Both endpoints, at least two qualified dimensions on **each** endpoint, no fictitious bilateral signal |
| Intelligence query | focused 0.05; standard 0.10; complex_multi_source 0.15 | Valid current signed GRO + actually healthy qualified topic/hot-topic modules; variant-specific topic and complexity classification |
| Signed Risk Object | existing_valid_signed 0.05; newly_qualified_signed 0.10 | Current independently verified cryptographic GRO; newly-issued case requires real signed publication newer than the request cutoff, not an expiry refresh |
| Risk Gate bundle | existing_proof_preflight 0.10; standard 0.15; complex_multi_source 0.25 | Same verified GRO + meaningful policy result and applicable other qualified modules; signed-object fee included; execution_authorized false |

**No global readiness inference:** one USGS country digest cannot certify a corridor, three domains, all countries, GRO, Risk Gate, buyer settlement or all 12 variants. All 195 ISO3 subjects are eligible for discovery/routing; each paid answer is still data-driven and may return non-chargeable 422.

## Existing evidence and no-funds checks

- Source creation implementation: [merged PR #2795](https://github.com/blocknine0/geomacro/pull/2795), including 12 request examples, direct assembler tests, Coinbase/Circle fixtures and signature/corridor regressions. These are synthetic/code acceptance only.
- [Production Website Health](https://github.com/blocknine0/geomacro/actions/workflows/production-website-health.yml): live SHA, deep health and current signed products. Must be current rather than reused from an old successful run.
- [Permanent Runtime Health](https://github.com/blocknine0/geomacro/actions/workflows/permanent-runtime-health.yml): B2/D1/current hot readback, Durable Object and no-Supabase runtime; not just control-plane 200.
- [Machine commercial GRO no funds](https://github.com/blocknine0/geomacro/actions/workflows/machine-commercial-gro-no-funds.yml): distinct configured authority keys, actual qualified source rights and separate signed publication. Key-presence-only green is not a signed product.
- [Live Commercial No Funds](https://github.com/blocknine0/geomacro/actions/workflows/commercial-live-production-no-funds.yml): true hosted deployment and public no-charge gates.
- [x402 Pilot Product Lane No Funds](https://github.com/blocknine0/geomacro/actions/workflows/x402-pilot-product-lane-zero-fund.yml): **only** its existing four baseline pilot requests, not proof of all 12 Store products.
- [Pre-Mainnet x402 Zero-Fund Acceptance](https://github.com/blocknine0/geomacro/actions/workflows/pre-mainnet-x402-zero-fund-acceptance.yml): release safety/ledger checks. Older Supabase dependency probes are compatibility history, not permission to reactivate frozen production Supabase.

All published live acceptance must identify the exact canonical `main` SHA, actual deployed website SHA, original source and rights generation, authentic signed GRO and source clocks, D1/B2 readback SHA, exact capability/variant/price, and immutable customer byte proof. **Do not mark a variant READY until its actual paid path passes zero-fund eligibility and replay verification; no-real-payment rehearsal is not a sale.**

## Genuine production dependencies / durable blocker response

| Blocker | Durable recovery | Proof required |
| --- | --- | --- |
| Lovable runtime mismatch | Publish the exact approved and mirrored main commit from Lovable; verify deployed executable SHA, not a static mirror marker | Same current 40-byte release SHA on main and actual website |
| Current B2/D1 hot 503 | Restore authorized read-only B2 secrets, verified current originals, B2 signed producer write/readback, D1 promotion with original clocks and expiry | Deep health HTTP 200 and real unexpired signed hot objects; no Supabase |
| No current signed GRO | Use already-approved separate Facts, Rights and GRO signer authorities to qualify **real** same-event originals and publish genuine signed objects | Pinned distinct valid signatures + exact bytes/readback; no synthetic/expired substitute |
| Source blocked/429/rights uncertain | Route to an actually independent available official public source with equivalent subject/period/claim and separately checked rights, retain all rejection evidence | Fresh native observation, source permissions and same-event reconciliation; no paid source |
| Corridor or profile missing module | Require per-endpoint/per-dimension genuine evidence; otherwise scoped `422` without automatic tier or scope downgrade | Every requested endpoint/module present with source-native clocks |
| Buyer rail locked/misconfigured | Verify dedicated Base mainnet USDC receiver, Coinbase facilitator credentials, Cloudflare DO authorization and website secrets; leave launch ACKs unset until final authorization | Exact variant-qualified 402 in no-funds run, immutable prequote, replay and negative tests |
| Ambiguous real settlement | Freeze new settlement for that claim; reconcile provider-chain-ledger against immutable delivery; do not automatically repeat | One payment, one delivered SHA, one ledger receipt, no double charge |

## Separation of duties and explicit authorization

- Pallab's scoped machine Facts and Rights policies and the separate commercial GRO signer can operate unattended only within **previously authorized** genuinely source-qualified conditions. Suman's independent scored GRI signature is a separate evidence product when Risk Indices requires it. Generic delegated derived-news signatures are NOT substitute legal permission, GROs or payment authority.
- Keys, articles, private rights receipts and B2 writer credentials stay inside protected workers/secrets; never commit or paste them. With no always-on laptop, cloud scheduled/queue workers carry production processing within published free quotas, not an unlimited uptime guarantee.
- Canonical locked prices live only in `src/lib/capability-pricing-catalog.ts`. `COINBASE_X402_PRICE_USDC` is a legacy provider boot parameter still required by the current Coinbase implementation in production, **not** a universal Store price. Only server-qualified capability pricing is allowed in a Store 402.
- Production mainnet ACKs are independent and intentionally **not** set by code merges, tests or this runbook. Real-money canary requires a fresh separate founder approval and reconciliation.

## Exit criteria

A seven-product / twelve-variant matrix can be labelled **fully production ready** only when **all 12 live example cases** separately show genuine permitted native evidence, correct subject + signed state where required, prepared structured delivery, exact readback and matching dynamic Base USDC 402 offer, with adversarial fail-closed tests and accurate deployed SHA. After individual variants pass, production can progressively sell only those passing variants; a fully green matrix is not required for the first lawful digest sale. Actual money/revenue is proven only by owner-approved mainnet settlement and ledger reconciliation.

**Current limitation:** this runbook and merged source tests do not prove that those external data, keys, Lovable production, current signed objects and Coinbase settlement outcomes already exist.
