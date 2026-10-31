# GeoMacro — Paid Credits + Ask Domain Routing (31 October 2026)

## Scope / invariants
- Main repo only. **Do not modify PREDGE**, historical-data repo, or historical Supabase.
- Three-domain source/Ask routing uses free/official evidence with bounded budgets.
- Public web answers are NOT signed paid GROs; GDELT timestamps are index-only; never convert missing data to a fabricated figure.
- Credit calls and paid entitlements are separate from Base/Polygon x402 pay-per-call. Do NOT flip a global capability COMING_SOON flag to LIVE.
- PayPal India is an **international fiat** merchant checkout settling to bank, not direct USDC; Stripe is excluded.

## Paid credits
Fixed costs in `src/lib/commercial-access-contract.ts`:
`intelligence_query:1, gri_read:1, structural_country_digest:3,
structural_corridor_digest:5, structural_country_profile:8,
structural_corridor_profile:12, signed_risk_object:10, risk_gate_bundle:15`.
Existing tier registry: Starter $9/1,000; Pro $29/5,000; Business $99/25,000 per 30-day
purchase; one-time packs $5/100, $15/500 and $30/1,500. Subscriptions
currently work as separately purchased 30-day allocations; **automatic recurring
billing is NOT implemented**. Existing separate eligibility constraints still apply.

The new SQL migrations are service-role-only:
1. `20261031180000_verified_paid_credit_settlement.sql` prepares immutable
   provider orders with server-side SKUs, records unique capture receipts,
   atomically credits an eligible principal after provider verification, and
   conservatively suspends on a verified full refund.
2. `20261031180500_guard_paid_credit_auto_provision.sql` denies paid-tier
   provisioning through the historical legacy RPC (and restores advisory lock).
   `99999_low_barrier_commercial_tiers.sql` mirrors this invariant for fresh
   database migration replay.
3. New-tier commercial API calls inspect the paid ledger WITHOUT resetting or
   extending a period. No verified receipt => 402, expired period => 402;
   `consume_commercial_credits` still ensures atomic, request-idempotent debit.
4. The PayPal webhook verifies its signature with PayPal, then GETs capture +
   order from PayPal LIVE, verifies merchant recipient / exact USD amount /
   original intent binding, and only then invokes the funding RPC.
   Replayed capture ids cannot create credits twice. Verified full refunds
   suspend the affected principal's paid credits.

**Do not promote this feature to LIVE without all acceptance steps below.**

## Deployment / remaining manual founder prerequisites
1. Review, merge, apply **new SQL migration** to the authoritative commercial
   database and independently query the new schema + service-role RPC grants.
   Ensure `99999_low_barrier_commercial_tiers.sql` is never replayed in a way
   that overwrites the paid-tier protection after the guard migration.
2. Confirm PayPal India business/individual merchant eligibility, KYC, currency
   acceptance and international buyer checkout scope directly with PayPal.
3. Save the following **server-side secrets only**, never in chat, browser,
   build-time VITE variables, or public GitHub:
   `GEOMACRO_PAYPAL_CLIENT_ID`, `GEOMACRO_PAYPAL_CLIENT_SECRET`,
   `GEOMACRO_PAYPAL_WEBHOOK_ID`.
   Configure `GEOMACRO_PAYPAL_MERCHANT_ID` from the approved LIVE merchant
   account, and `GEOMACRO_PAYPAL_ENVIRONMENT=live`.
4. In PayPal LIVE account, register exactly
   `https://geomacro.live/api/v1/payments/webhook` with signed
   `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.REFUNDED` events.
   Capture-time reconciliation must tolerate duplicate or out-of-order events.
5. Verify webhook, order/capture readbacks, amount/merchant mismatch refusal,
   retry idempotency, expiry and refund states end-to-end **in sandbox plus a
   separately authorized live low-value test**. Review disputes, partial
   refunds, and manual reconciliation workflow before permitting new sales.
6. After and ONLY after these checks, set
   `GEOMACRO_PAYPAL_LIVE_SETTLEMENT_APPROVED=true` on the server. It defaults
   false. Changing a source flag does not itself verify PayPal KYC.
7. Integrate approved-hosted checkout and post-approval capture into the paid
   dashboard. API callers can use Bearer-authenticated
   `POST /api/v1/payments/paypal` with
   `{"action":"create","sku":"starter_dev"}` then follow the returned
   PayPal approval URL; after approval send
   `{"action":"capture","order_id":"<provider order id>"}`.
   Customer onboarding/API-key issuance needs a verified identity binding.
   Never treat an arbitrary unbound API key as a PayPal identity.
8. Implement reconciliation/alerting for PayPal disputes and partial refunds,
   chargebacks, renewal failures and webhook retries before unrestricted live
   selling. The signed full-refund path is prepared; this is NOT a claim that
   every reversal case is fully automated. Paid revenue must not be marked
   externally reconciled until the accounting pipeline confirms it.
9. Validate the existing Base/Polygon x402 settlement/readback independently.
   Pricing catalog visibility is not proof a paid x402 capability is LIVE.

## Ask GeoMacro: permanent application routing
- First use editorial guides only for timeless explanation; signed risk index
  reader remains separate and must never substitute fresh news for a signed GRI.
- Numeric questions use the existing official WDI/ECB reader with period and
  reference timestamp checks; WDI annual inflation != current monthly CPI.
- Broad news questions now use shared `askDomains()` classification and the
  verified, source-neutral three-domain D1 journal. Multi-domain summaries are
  allowed, and no 195-country coverage is falsely implied.
- Country/asset/event/scored questions do NOT receive unrelated broad news:
  they continue through original-source discovery, governed B2/hybrid intelligence,
  and bounded GDELT/Groq research. Groq needs server-side `GROQ_API_KEY` for
  optional synthesis; no key must leak to the browser.
- If underlying news is unavailable or merely indexed without publisher
  verification, show insufficient/provisional evidence and suggested context
  instead of fabricating a paid, signed five-part certainty.

## Acceptance test matrix
- New paid tiers: no funded account -> 402; valid settled pool consumes exact
  credit cost once; changed request-id capability -> idempotency conflict;
  expired, suspended, and mismatched tier are rejected.
- Subscription renewal and credit pack top-up never mint credits from
  unverified POST parameters; capture id uniqueness and refunds survive retries.
- PayPal signature invalid, wrong capture, wrong merchant, wrong order, wrong
  amount, sandbox capture against live intent, replay with modified amount =>
  no credit funding. Partial refunds require reconciliation.
- Ask: three broad news categories, multi-domain news, exact official numeric,
  country+mineral original, B2, category-specific risk-index, GDELT outage,
  Groq outage, and safe private-question boundaries.
- Require CI build/unit tests, D1/Supabase migration acceptance, provider
  readback receipts, independent production GET/POST smoke, and error monitoring.
  Until then this branch is **implementation staged**, not production accepted.
