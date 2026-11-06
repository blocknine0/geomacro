# GeoMacro commercial ledger — Step 1

Complete PostgreSQL/Supabase SQL and runnable Node.js metering code. This package
implements Step 1 only; it has not been applied to GeoMacro production. It does
not enable payment acceptance, manufacture intelligence, or substitute internal
triage for certified Risk Indices. Existing D1/B2 intelligence storage is untouched.

## Contents

- `sql/schema.sql`: seven requested tables plus a configurable tier rate card.
- `sql/functions.sql`: provisioning, hashed keys, quotes, atomic verified-success
  settlement, idempotent top-ups, failure logs, compensating refunds.
- `sql/verify.sql`: balance reconciliation and permission checks.
- `src/metering.mjs`: real Ed25519 verification before any debit, transactional
  settlement, exact-byte replay, cancellation handling, error propagation.
- `src/accounts.mjs`: trusted-auth account provisioning and one-time key issuance.
- `src/db.mjs`: backend-only pg pool with verified TLS.
- `src/settle-cli.mjs`: executable integration entry point for trusted results.
- `test/`: behavioral, rollback, access-control, and optional real concurrency tests.

## Pricing and precision

Money and credits are separate integer quantities. No floating-point arithmetic
is used to mutate a balance. One credit is 1,000,000 integer units.

| Tier | Cash price (USD) | USD micro-units | Initial credit tariff | Credit units |
|---|---:|---:|---:|---:|
| basic | $0.10 | 100000 | 10 | 10000000 |
| standard | $0.15 | 150000 | 15 | 15000000 |
| complex | $0.25 | 250000 | 25 | 25000000 |

The roadmap specifies cash prices but does not define credits per call or credits
per purchase. The 10/15/25 credit rate card is an **explicit configurable initial
implementation choice**, not an inferred change to existing pack entitlements.
10 signup credits cover one basic call at this initial rate. Before payment
activation, set credit tariffs to your approved product economics and map each
$5/$15/$30 pack and $9/$29/$99 subscription to its server-owned entitlement in
Step 2. Never calculate pack credits from a client-supplied amount. No pack mapping
is invented in this package.

Cash tariffs match the requested $0.10/$0.15/$0.25 exactly. `usd_micros` on credit
usage is the tier's reference cash tariff, not an additional cash charge. Base
USDC has six decimals, so its atomic amounts use the same integer scale as USD
micro-units. No exchange-rate or on-chain-verification assumptions are made here.

## Setup

Requirements: PostgreSQL 15+ (including Supabase), Node.js 22+, npm, and `psql`.
Use a staging database first. These are one-time installation scripts, not an
idempotent upgrade over existing GeoMacro tables. The dedicated `geomacro` schema
avoids collisions with existing `public.users` or production intelligence tables.
For an existing migration-managed repository, put the reviewed SQL into a migration
created with that repository's current migration tooling. Do not run both copies.

```bash
unzip geomacro-step1.zip
cd geomacro-step1
npm ci
npm test
```

Set `ADMIN_DATABASE_URL` to a database-owner connection using your secret manager.
Use certificate validation (for example libpq `sslmode=verify-full` and a trusted
`sslrootcert`) on remote connections. Run in order:

```bash
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/schema.sql
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/functions.sql
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/verify.sql
```

Alternatively paste the two installation files, in that order, into Supabase SQL
Editor as the database owner. Each script is transactional: errors roll back that
script. If the functions script fails, correct it and rerun that script without
rerunning schema creation. Do not expose `geomacro` in Supabase Data API settings.

Create a dedicated backend LOGIN role using your database's user management, a
random secret, and no `SUPERUSER`, `CREATEDB`, `CREATEROLE`, or `BYPASSRLS` privilege.
After creating that login (named `geomacro_runtime` here), run as owner:

```sql
GRANT geomacro_billing TO geomacro_runtime;
```

Use the runtime login in `DATABASE_URL`. Never use the database owner or grant
`geomacro_billing` to Supabase `anon`, `authenticated`, or `service_role`.
Set `PG_CA_FILE` to the provider CA if not in Node's trust store. `PG_LOCAL=true`
is for a local test server only. Importing `src/db.mjs` creates the pool.
No credentials are bundled. Check provider login/pooler username requirements
when configuring a Supabase direct or Supavisor connection.

The private runtime functions intentionally use `SECURITY DEFINER`, a fixed
`pg_catalog` search path, fully qualified table names, and restricted EXECUTE
permissions. The backend is the authorization boundary. RLS is enabled on every
table; no browser policies or direct runtime table grants are installed. PostgreSQL
owners/superusers remain trusted and can alter the ledger; this is not immutable
storage against a compromised database administrator.

## Account and key setup

After verifying a non-anonymous Supabase Auth user on the server, pass that
verified user object to `provisionAccount(pool, user)` from `src/accounts.mjs`.
It creates the local UUID account and grants exactly 10 signup credits once.
Call `createApiKey(pool, verifiedUserId, label)` to return a 256-bit random key
once; the database stores only its SHA-256 digest and display prefix.

The SQL user UUID matches `auth.users.id`; no destructive cascade is installed.
Financial history remains available if an Auth identity is removed. The backend
must suspend/close the local account and revoke its keys during account closure.
No automatic signup trigger is installed before the Step 4 onboarding flow exists.

Never accept a user UUID or a claim that a payment/signature is verified from the
browser. API key validation and ownership are rechecked in the settlement function.
The rate-limit field is stored now; edge rate enforcement belongs to the API step.

## Settlement call

`settleVerifiedSuccess(pool, options)` is the production code path, not a SQL
boolean saying `verified=true`. Inputs:

- `apiKey`, stable UUID `requestId`, ISO country/corridor `subject`, `requestedTier`.
- `availableTiers` from the trusted evidence resolver and `riskByTier` containing
  each tier's actual `{decision, risk_score, factors}`. Decisions: `allow`,
  `review`, `deny`; scores: 0–100. Empty or inconclusive evidence is not billable.
- Ed25519 `privateKey`, `publicKeyId`, and a `publicKeys` map retaining historical
  keys for receipt verification on retry. Use Node KeyObjects or PEM key material.
- Optional `AbortSignal` linked to the server request deadline/disconnect.

Resolve and qualify evidence **before** entering this short database transaction.
Do not fetch OSINT or call AI models while holding the account lock. Only list a
tier as available when the actual result for that tier satisfies its evidence
requirements. This component does not assert reviewer certification.

Transaction sequence:

1. Authenticate hashed key; lock the user row; enforce account/key state.
2. If the request exists, validate ownership and request fingerprint, then return
   its stored signed payload without another deduction.
3. Choose the highest available tier at or below the requested tier; check balance.
4. Build the final payload with actual `billed_tier`, `credits_deducted`, and
   `execution_authorized: false`; sign its exact canonical UTF-8 bytes and verify.
5. Insert usage and receipt, debit balance, append ledger; all commit together.
6. Return a pre-serialized HTTP 200 body. The later API route must use this body.

For a complex request with standard evidence only, the standard risk result is
served and signed with `billed_tier="standard"`, 15 credits deducted at the initial
rate card, and a $0.15 reference cash tariff. It never bills an unavailable tier
or upgrades a basic request to a higher tier.

A caller can execute `src/settle-cli.mjs` using a trusted evidence JSON file with
`subject`, `requestedTier`, `availableTiers`, and `riskByTier`. Set these backend
variables, then run:

```bash
# Supply through your shell/secret manager; do not commit secrets.
# DATABASE_URL, PG_CA_FILE, GEOMACRO_API_KEY, REQUEST_ID,
# SIGNING_PRIVATE_KEY_FILE, SIGNING_PUBLIC_KEY_FILE, SIGNING_PUBLIC_KEY_ID
node src/settle-cli.mjs /absolute/path/to/trusted-risk-result.json
```

`REQUEST_ID` must be a UUID kept stable across retries. The example deliberately
does not ship fake production risk evidence. Test fixtures are confined to tests.

## Error handling and no-charge contract

Pre-commit errors, 5xx generation failures, inconclusive evidence, invalid
signatures, insufficient funds, and observed cancellation roll back everything.
`record_failure(...)` records failures with zero debit. It cannot overwrite a
successful request; use `refund_usage(...)` for post-settlement compensation.

| Error | API behavior when wired in Step 3 |
|---|---|
| `KEY_UNAVAILABLE` / unknown key | 401/403; no charge |
| `INSUFFICIENT_CREDITS` | 402; no charge |
| `INCONCLUSIVE_NO_CHARGE` | 503; no charge |
| `IDEMPOTENCY_CONFLICT` | 409; no charge |
| `REQUEST_NOT_REPLAYABLE` | 409; use a new ID only for a genuinely new call |
| signature/database/lock timeout before COMMIT | 503; no charge |
| `SETTLEMENT_OUTCOME_UNKNOWN_RETRY_SAME_ID` | reconcile/retry the same ID |

Do not return raw database messages, credentials, or signatures in diagnostic logs.
All exceptions propagate; the subsequent HTTP route must map safe public errors.

**Delivery boundary:** a PostgreSQL commit and a remote client's receipt of HTTP
bytes cannot be one atomic transaction. If COMMIT succeeds and the network then
fails, replay the stored response with the same request ID, or compensate with
`SELECT geomacro.refund_usage($1)`. Refund is idempotent, preserves the original
signed receipt and debit, appends a credit, and marks usage refunded. Do not call
`record_failure` to hide a committed debit. A lost COMMIT acknowledgement is also
ambiguous; the module raises an explicit reconciliation error rather than claiming
rollback. This Step 1 does **not** claim a universal zero-charge guarantee for
unobservable client-network timeouts. The HTTP lifecycle and reconciliation
worker must implement that refund policy in the later API phase.

## Payments and x402 handoff

`top_up(user, provider, external_id, integer_units)` is a privileged internal
capability, not an internet webhook. Step 2 must verify PayPal signatures and
resource state, payee, amount, currency, and SKU entitlement first. Deduplicate by
capture or subscription payment resource ID, not webhook event ID. Subscription
activation alone must not mint paid credits without confirmed payment.

`web3_txs` supports Base chain 8453, USDC atomic amounts, globally unique transfer
log references and unique EIP-712 authorization nonces. It is schema-only in this
step: no unsigned authorization, unconfirmed transfer, or arbitrary token is
accepted as proof of payment by this package. A separate Step 2 settlement path
will validate Base USDC and record accountless usage with nullable `user_id`.
Webhook URLs require HTTPS at the schema layer; SSRF protection, signing,
retry/delivery state, and enterprise policies belong to the later dispatcher.

## Verification

`npm test` runs real PostgreSQL SQL/PLpgSQL through embedded PGlite with real Node
Ed25519 signatures. PGlite is single-connection; it cannot prove concurrent locks.
The optional real PostgreSQL concurrency suite is isolated behind
`GEOMACRO_CONCURRENCY_DATABASE_URL` and creates temporary test accounts in an
already installed **disposable test database**. Never point tests at production.

```bash
GEOMACRO_CONCURRENCY_DATABASE_URL="$TEST_DATABASE_URL" npm test
```

All SQL inputs use positional parameters. Reconcile balances and check missing
receipts with `sql/verify.sql`. Keep receipts and public keys for your approved
retention period; a signature demonstrates integrity/authenticity, not truth or
automatic legal immunity. Signatures here are Ed25519; HMAC is not used for public
non-repudiation. Performance SLAs and production readiness require subsequent
load testing and deployment evidence.

References consulted: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Supabase changelog](https://supabase.com/changelog?types=breaking-change),
[PostgreSQL row locking](https://www.postgresql.org/docs/current/explicit-locking.html).
