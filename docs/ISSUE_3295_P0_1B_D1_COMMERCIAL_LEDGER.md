# P0-1B — canonical D1 paid commercial access (Issue #3295)

## Current release decision: CODE ONLY / NO-FUNDS
P0-1A customer D1 OTP/session schema landed in PR #3310. This P0-1B
PR adds a separate D1 grant-scoped usage ledger, backend HMAC key
verification, one-time key generation primitive, and strictly **disabled**
private Worker+SSR preflight/debit APIs. It does **not** connect a public
commercial endpoint to D1, activate new keys, import any entitlement, capture
payment or issue funding. PREDGE, pricing, global risk, testnet A2A, and
historical data are unchanged.

## Architecture
- Reuse exactly the existing `geomacro-control-plane` D1 DB binding `DB`.
- Apply only additive `workers/control-plane/migrations/0095_customer_grant_scoped_usage.sql`
  after 0090–0094 through existing protected main workflow. No new database.
- Immutable `customer_usage_receipts` (user + request id unique) validates
  active owned key, per-capability scope, paid/non-reversed/contract-matching
  grant, server locked cost, and grant-specific remaining funded credits.
  Its AFTER INSERT trigger writes the one and only immutable credit ledger
  debit; any failure rolls the statement back. Direct standalone debit
  INSERTs are denied.
- A consumed request ID replay must exactly match the original key,
  capability, credit price and contract and must use a still-active key and
  grant. A mismatched replay rejects; no second debit.
- Funds come ONLY from existing payment-verified receipt + active grant
  triggers, NOT from registration, developer flags, a webhook redirect, or
  source candidate/LLM output. The in-memory test uses synthetic records
  solely to exercise database constraints.
- Server-owned capability-cost registry is mirrored from
  `GEOMACRO_CREDIT_COSTS`, and product/tier map follows
  `STRUCTURED_TIER_REGISTRY`. New-sale GRI and Risk Gate are excluded even
  where legacy catalog rows still exist.
- Key HMAC uses the **existing** credential domain
  `geomacro-api-credential-v1\0commercial-bearer\0` keyed by the dedicated
  `GEOMACRO_API_CREDENTIAL_PEPPER`, not the customer OTP pepper or retired
  Supabase service-role fallback. Plaintext key only returned once from
  the off-by-default mint function; never stored.
- Key creation in `customer-runtime.mjs` stays disabled until the full
  commercial route compatibility and production credit readback pass.

## Explicit no-go controls
- Worker paid action is 503 unless
  `GEOMACRO_CUSTOMER_PAID_RUNTIME_ACCEPTANCE=ACCEPTED_CANONICAL_D1_PAID_RUNTIME`.
- SSR facade is independently 503 unless
  `GEOMACRO_CUSTOMER_PAID_SSR_ACCEPTANCE=ACCEPTED_D1_PAID_API_SSR`.
- **Do not set either flag now.** They are not payment flags and are not
  evidence of data/service readiness by themselves. Public paid structural
  route, A2A and testnet are untouched. No automatic Supabase-to-D1
  migration/fallback or old-key upgrade is performed.
- The off-by-default mint primitive is code-only. No sender/API credential,
  refund/real settlement, key or credit is created by this PR.
- Future production acceptance requires a reviewed new-funding ledger writer
  that independently verifies PayPal capture or on-chain finality, and
  separately authorized first sale. No fake funding through direct D1 SQL.
- Required paid response evidence must be prepared and verified BEFORE any
  debit; ambiguous delivery failure must be safely recoverable without a
  new debit. A D1 debit alone does not constitute a delivered paid response.

## Operator & verification gates remaining
1. Review exact GitHub SHA, Product CI, CodeQL and
   `Canonical Customer D1 Schema Acceptance (No Funds)` Node tests.
2. Independently verify the existing Cloudflare account / `DB` binding and
   0095 remote migration/readback (main-only guarded run), with no customer
   data mutations or funding.
3. **Owner-protected secret only**: store a strong dedicated
   `GEOMACRO_API_CREDENTIAL_PEPPER` in the Worker secure environment. Do not
   reuse the OTP pepper. Do not paste values in chat/GitHub. Preserve any
   historical existing pepper until key parity is resolved.
4. Test funded-but-NO-REAL-MONEY canonical customer fixtures only in an
   **isolated test D1**; no synthetic entitlements in production.
   Check both owner accounts, key mint/expiry/revoke/cooldown, grant overlap,
   per-grant budget, concurrent debit, replay alteration, account isolation,
   reversal, old key rejection and correct zero-credit response.
5. Build a reviewed commercial route adapter that checks actual source/
   rights readiness and freezes response before deduction, binds immutable
   response hash to request id and safe replay, only then use this D1 service.
   Existing production commerce must not be silently switched.
6. Independently verify provider capture/refund and protected live
   readback, first genuine money canary only after separate owner approval.
   Unblock key-create and enable the two acceptance flags LAST.

## Offline checks
```sh
node --test scripts/tests/customer-runtime.test.mjs scripts/tests/customer-paid-ledger.test.mjs scripts/tests/customer-canonical-d1-schema.test.mjs scripts/tests/customer-email-provider-failover.test.mjs
```
These tests do not prove production egress, customer login, source quality,
merchant eligibility, D1 migration or any settled payment. Do not close #3295
on code/CI PASS alone.
