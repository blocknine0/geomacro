# Issue #3295 — Canonical customer D1 cutover: gated production acceptance

This document records the actual production contract as of 2026-11-01. The source schema is **not** evidence of an active customer runtime cutover.

## Confirmed architecture and naming

- Existing production D1: `geomacro-control-plane`; Wrangler binding `DB`.
- Existing protected GitHub production environment uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. `D1_DATABASE_ID` was observed **missing** from the dedicated acceptance job, so acceptance now discovers the uniquely named existing `geomacro-control-plane` D1 using Wrangler; it does not create a database. There is **no** proof that `CLOUDFLARE_D1_TOKEN` or `DATABASE_ID` are configured aliases.
- The existing `GEOMACRO_SUPABASE_RUNTIME_MODE` governs legacy application Supabase access; it does **not** select the customer D1 datastore. There is no safe `CUSTOMER_DB_MODE=canonical` cutover in the current customer runtime.
- `src/lib/customer-auth.server.ts` still invokes the pinned Supabase Auth API; `src/lib/customer-commercial.server.ts` still invokes Supabase/PostgREST and PostgreSQL RPCs. Neither understands D1 SQLite.
- `legacy_customer_private_shadow` is preservation-only. It is not an independent customer principal, payment balance, or credential authority. Keep that shadow intact.
- Do not apply `supabase/migrations/9999999902_paid_customer_self_service.sql` with Wrangler. It is PostgreSQL/PLpgSQL, **not** D1 SQLite.

## Additive migration in this PR

`workers/control-plane/migrations/0090_customer_canonical_d1.sql` adds `users`, `sessions`, `credit_ledger`, `api_keys`, immutable payment receipts and grants, and a separated no-funds probe table. `0091_customer_canonical_integrity_triggers.sql` guards paid-only funding/debits, API-key creation, revocation, and append-only ledger integrity. The migration contains **no initial customers, funds, or fake entitlements**.

On main, `customer-canonical-d1-schema-acceptance.yml` runs pinned Wrangler migrations on the uniquely named existing production database under the configured Cloudflare account; it proves read access with `SELECT COUNT(*)` and write/read/delete through `customer_d1_integrity_probe`, without using customer data or sending payments. CI on PRs checks migration syntax and basic invariants with SQLite only.

### Owner-independent canonical D1 checks

The workflow uses the main D1 config in a temporary runner-only file. An operator with equivalent Cloudflare permissions can inspect the same target locally:

```sh
npx -y wrangler@4.136.3 d1 migrations apply DB --remote --config workers/control-plane/wrangler.runtime.jsonc
npx -y wrangler@4.136.3 d1 execute DB --remote --config workers/control-plane/wrangler.runtime.jsonc --command "SELECT COUNT(*) AS record_count FROM credit_ledger;"
```

The runtime config above must already exist locally and pin the **existing** Cloudflare D1 database UUID; the committed example has a placeholder. Do not run against a guessed database.

## Required before turning on production customer login/keys

1. Deploy an authenticated, private customer D1 Worker/SSR adapter using the `DB` binding. No client-supplied SQL, no REST Cloudflare management token exposed in browser or checkout. The existing website/Nitro runtime does **not** inherit the Worker binding automatically.
2. Move/implement verified email OTP without calling the retired Supabase customer identity endpoint; configure an approved sending provider, verified domain, abuse/rate limits, hash-only challenges and HMAC cookie sessions in D1; test cross-customer isolation and revocation.
3. Reconcile the authoritative legacy principal/account/grant/key/receipt rows against canonical D1 by stable identity, hashes, immutable IDs and reversal state. A shadow snapshot alone does not authorize credited accounts.
4. Port all paid-credit consumption and key validation lookups from Supabase/PostgreSQL RPC to atomic D1 state, including exact receipts, 30-day entitlements, idempotent debits, refund/dispute freeze and key revoke invalidation. Review live API enforcement, not just dashboard UI.
5. Independently verify two owner test accounts (A/B): OTP, secure cookie, account isolation, no credits after signup, no key without a verified paid grant, exact paid credits after authorized sandbox settlement, maximum three active keys, readback and immediate revocation.
6. Only after passing runtime + data parity + production exact SHA tests, switch the **newly implemented customer-specific mode** to `canonical`; never use global `GEOMACRO_SUPABASE_RUNTIME_MODE=primary` as a shortcut.
7. PR #3264 remains a **draft separate commercial/payment milestone**. Never enable live PayPal settlement or production real money merely because the customer D1 schema exists.

## Readiness labels

- Schema committed: requires reviewed PR merge.
- Production schema applied/readable/writable: requires a successful protected Actions run with D1 receipt.
- Customer runtime canonical: **NOT ACCEPTED** until the separate authentication/ledger adapter and end-to-end tests pass.
- Paid credits / #3264 merge: **NOT ACCEPTED**.
- PREDGE, frozen Global Risk, historic Supabase, raw evidence, and existing x402 safety locks: unchanged.
