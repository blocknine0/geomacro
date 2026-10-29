# 195×3 Store contract mock testing and fail-closed source proof

## Why this change
The public `/api/v1/intelligence/products-availability` must never interpret a bare `deliverable:true` or a source-index discovery as commercially eligible **country evidence**. Before this change, after an upstream checker reported AVAILABLE, the Store preflight validated query-plan hash, missing modules and price catalog, but did not separately bind the **actual country**, source-contract grant, original evidence clock and requested module coverage. That was a dangerous secondary-validation gap.

## Fixed
For explicitly requested **structural Store** products only, the additional `verifiedStructuralStorePreflightReceipt` validation requires:
1. A recent actual availability check (<=3h; no future clock) bound to the exact canonical query hash and one returned subject for one requested subject.
2. Every required Store module present and the returned subject **exactly matches** the requested country ISO3 or the origin/destination of the directional corridor.
3. One or more unique nonblank source-contract identities with exact `DERIVED_ONLY` or `COMMERCIAL_OK`, and `attribution_required=false`, plus one or more required source identities for the actual subject **all included** in approved source contracts.
4. A valid nonfuture original observation/reference clock whose age satisfies the most permissive module age constraint; canonical per-module independent quality/freshness still requires `missing_modules=[]`, `stale_modules=[]` and the existing true checker.
5. No commercial quote or paid delivery is created. An invalid receipt is 422 `STORE_PREFLIGHT_SOURCE_EVIDENCE_UNVERIFIED` without query, source identity, customer bytes or credentials.

The implementation does not change baseline prices, x402 merchant, signed Risk Objects, GRI, PREDGE or existing production source qualification.

## Mock matrix: **NOT** real 585-country publisher proof
New `src/lib/store-195x3-revenue-preflight.mock.test.ts` executes:
- All **195 × 3 = 585** hypothetical fully qualified country/category Store contract inputs. It verifies correct module scope, exact $0.02 structural digest **catalog price only**, and always `chargeable:false`, `payment_authorized:false`, `execution_authorized:false`. Synthetic original/rights are explicit in test fixtures only.
- All **585** distinct **missing-original** country/category cases; every result rejects with 422 and no payment.
- Thirteen adversarial mutations for each category: no rights, attribution requirement, fake source identity, wrong country, missing native clock, forged future timestamp, stale proof, empty module/source, etc.
- One negative test for cross-module one-dimension scope inflation.

Mock successes do NOT qualify any real country/source, commercial right, original page, B2/D1 readback, verified signing or paid customer transaction.

## Independent real evidence
Separate live original MCS2026/CC0 no-funds proof run `40920213252` (PR #3126 merged) measured 76/195 countries with 316 annual source comparisons and actual canonical Store structured-data preparation for AUS, IND and USA. Those are separate measured real sources **not simulated by this test**. Existing first-party BLS USA CPI and exact reviewed US Treasury India FX quarterly adapters cover narrower Macro/FX structural context; source/rights and actual category availability must be checked individually. No first-party same-event independently verified, commercially licensed geopolitical country source has been proven by these mocks.

## Run and verify
```bash
bun x vitest run src/lib/store-195x3-revenue-preflight.mock.test.ts src/lib/store-product-availability.server.test.ts src/__tests__/earn-first-structural-pilot.test.ts
```
The existing Product CI runs the repository's full tests/build. Exact-head CodeQL, locked partner, merchant safety and canonical real-source tests must pass before merge. Postmerge, recheck original-matched data availability in production. No new scheduler, source request, payment, D1/B2 write or Supabase credential is needed.
