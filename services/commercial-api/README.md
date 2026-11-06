# GeoMacro — Step 2: PayPal + Base USDC x402

This package adds real payment engines to Step 1's PostgreSQL ledger. It contains
all Step 1 source plus an additive Step 2 SQL script, executable HTTP service,
PayPal plan provisioning utility, x402 agent example, and provider/RPC-isolated
integration tests. Nothing here has been installed into GeoMacro production.

## Implemented interfaces

| Method | Path | Authentication | Behavior |
|---|---|---|---|
| POST | `/payments/paypal/orders` | Supabase bearer token | Create server-priced $5/$15/$30 prepaid order |
| POST | `/payments/paypal/orders/{orderId}/capture` | Owning user's bearer token | Capture approved order and reconcile completed payment |
| POST | `/payments/paypal/subscriptions` | Supabase bearer token | Create $9/$29/$99 monthly subscription |
| POST | `/payments/paypal/webhook` | Verified PayPal signature | Re-fetch authoritative resources and update ledger atomically |
| POST | `/v1/risk-gate` | x402 payment; no user login | Negotiate, verify, settle and replay signed risk result |
| GET | `/health` | None | Process liveness only, not financial or upstream readiness |

PayPal Orders uses **v2**; PayPal's current Subscriptions API uses **v1**. There
is no invented `/v2/subscriptions` endpoint.

## Installation

Requirements: Node.js 22+, PostgreSQL 15+ / Supabase, npm, `psql`, a TLS reverse
proxy or Node deployment, and a staging environment. Read `STEP1.md` for the
restricted database role and credit metering setup.

```bash
unzip geomacro-step2.zip
cd geomacro-step2
npm ci
npm test
```

On a **fresh** database, use the database-owner connection:

```bash
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/schema.sql
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/functions.sql
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/payments.sql
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/verify.sql
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/verify_payments.sql
```

If Step 1 was already installed, run **only** `sql/payments.sql` and the verification
queries. The scripts are one-time transactional installations; do not re-create
Step 1 tables over a live database. Incorporate reviewed SQL into the existing
repository's migration process if that project manages migrations.

Use the dedicated `geomacro_runtime` login with `geomacro_billing` membership for
`DATABASE_URL`; never use the owner login for the HTTP service. Remote PostgreSQL
connections validate TLS certificates. `PG_LOCAL=true` is for a disposable local
server only. All payment tables live in the private `geomacro` schema with RLS,
no browser policies, and no direct runtime table writes. `SECURITY DEFINER`
functions are narrowly granted backend capabilities with fixed search paths.

Copy `.env.example` into your deployment's secret manager/environment. For local
Node development, an uncommitted `.env` can be loaded with Node's built-in loader:

```bash
node --env-file=.env src/server.mjs
```

Do not prefix any database credential, PayPal secret, signing key or facilitator
authentication with `NEXT_PUBLIC_`. The server listens on `127.0.0.1:3000` by
default. Put it behind your HTTPS reverse proxy; configure its body and header
limits, shared edge rate limits, and a request timeout that accommodates
settlement confirmation. The application caps request bodies at 64 KiB, uses
bounded upstream timeouts, and never logs payment authorizations or credentials.
This step has no load-tested latency or uptime SLA.

The Web-standard `createPaymentHandler(...)` can also be mounted in a Next.js
App Router route using the Node runtime. Deploy it at the paths above or forward
those paths from your current gateway. It is not a directly deployable Cloudflare
Worker bundle: filesystem PEM loading and the standalone HTTP server are Node
adapters. No existing Cloudflare deployment has been changed by this package.

## Configure PayPal

1. Reuse your existing PayPal Business account. Obtain **sandbox** REST app client
   ID and secret in the PayPal Developer dashboard. Sandbox and live app values,
   webhook IDs and plan IDs must remain separate.
2. Set `PAYPAL_MODE=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
   `PAYPAL_MERCHANT_ID` and `SITE_ORIGIN` (the exact HTTPS origin, no trailing slash).
3. Create a webhook for that same REST app at
   `https://YOUR_API_HOST/payments/paypal/webhook`. Subscribe to:
   `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.SALE.COMPLETED`,
   `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED`,
   `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.EXPIRED`.
   Set its real `PAYPAL_WEBHOOK_ID` in the server environment.
4. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. The server calls
   `/auth/v1/user` to verify bearer tokens rather than trusting a decoded JWT.
   It requires a confirmed, non-anonymous account, then idempotently provisions
   the matching ledger account with Step 1's 10 free credits.
5. Create or reuse active USD monthly plans. The engine validates the exact price,
   monthly frequency, no trial, no setup fee, no variable quantities and no tax
   surcharge before creating subscriptions. Plans can be provisioned with the
   executable utility below.
6. Fill `PAYPAL_CATALOG_JSON` with approved credit entitlements for all six SKUs
   and the real subscription plan IDs. Set `PAYPAL_ENABLED=true`.

| SKU | Fixed price | Credit allocation |
|---|---:|---|
| `pack5` | $5 prepaid | Required approved integer |
| `pack15` | $15 prepaid | Required approved integer |
| `pack30` | $30 prepaid | Required approved integer |
| `monthly9` | $9/month | Required approved integer + plan ID |
| `monthly29` | $29/month | Required approved integer + plan ID |
| `monthly99` | $99/month | Required approved integer + plan ID |

The roadmap does not specify pack/subscription credit quantities, so the runtime
requires configuration instead of silently selling invented entitlements. Test
fixtures contain sample allocations solely for validation; they are not defaults.
Step 1's credit-per-call rate card remains configurable and unchanged.

To provision the three plans with code, set `PAYPAL_PROVISIONING_ID` to one UUID
and retain it across immediate retries:

```bash
node --env-file=.env src/provision-paypal-plans.mjs
```

This creates a product and active $9/$29/$99 monthly plans in the selected PayPal
environment. It does not subscribe a customer or charge anyone. IDs are printed
as each plan is created. Retain those IDs. PayPal's remote idempotency retention
is finite; do not rerun old provisioning IDs indefinitely. Plan changes and
merchant configuration remain explicit administrative operations.

### Checkout and capture

Use an authenticated user's Supabase access token, not a service-role key:

```bash
curl -X POST "$API_ORIGIN/payments/paypal/orders" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"request_id":"53d6a952-b87f-4a91-b17f-238574abdf68","sku":"pack5"}'
```

The response contains `provider_id`, `purchase_id`, `status`, and PayPal's
`approval_url`. After the buyer approves that order, capture it:

```bash
curl -X POST "$API_ORIGIN/payments/paypal/orders/$ORDER_ID/capture" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

For a subscription:

```bash
curl -X POST "$API_ORIGIN/payments/paypal/subscriptions" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"request_id":"c12c0526-ce61-47ef-8aa4-302ea57a5965","sku":"monthly29"}'
```

Each new purchase must use a new UUID. Retries must reuse the original UUID and
SKU. The same ID with changed ownership or product is rejected. Store the local
purchase before calling PayPal; snapshot the approved entitlement and price.
A creation retry after five hours without a known remote ID requires
reconciliation instead of risking a second order after remote deduplication expires.

The dashboard/PayPal buttons and frontend `/billing/paypal/return` and
`/billing/paypal/cancel` screens belong to Step 4. Configure those screens there
and call the capture endpoint on order approval. The API tests exercise checkout
creation and capture; this package does not claim a finished browser store.

### Webhook integrity and ledger rules

- Verify PayPal's signature using the configured webhook ID and five transmission
  headers through PayPal's verification API. Invalid signatures cannot top up.
- Re-fetch capture and parent order with the app's credentials. Verify COMPLETED,
  capture ID, exact USD amount, local purchase ID, and merchant ID.
- For recurring payment, verify the owned subscription and find the sale ID in
  PayPal's authoritative subscription transactions list with COMPLETED status and
  the exact configured gross USD amount.
- `BILLING.SUBSCRIPTION.ACTIVATED` updates status and grants **zero paid credits**.
  `PAYMENT.SALE.COMPLETED` grants that month's credits after confirmation. A later
  confirmed renewal gets its own top-up.
- Credit by payment resource ID, not webhook event ID. Duplicate deliveries,
  different event IDs for one resource, and synchronous capture reconciliation
  cannot credit the same payment twice.
- Top-up, purchase status, and processed-event receipt commit atomically. A
  database error leaves the webhook unacknowledged so PayPal can redeliver.
- Unknown/unsupported webhook types are acknowledged without a credit mutation.
  This step does not implement payment reversals, disputes, refund clawbacks, tax
  calculations or a complete refund-management product. Wire those workflows
  before unattended commercial operation; do not treat this as full launch signoff.

### Indian bank transfers

PayPal's India help states that available balances are automatically transferred
to the linked local bank account daily. That is PayPal's merchant-account
behavior, not a new API payout or a second payment engine here. Verify your
existing account's bank linkage and receiving status in PayPal. This package
cannot certify that an account transfer has occurred. Do not use the Payouts API
as a substitute for merchant bank settlement.

## Configure Base USDC x402

Set the following backend variables:

- `X402_PAYEE_ADDRESS`: your public Base USDC receiving address. Only the public
  address is needed; GeoMacro does not need that wallet's seed phrase/private key.
- `BASE_RPC_URL`: a trusted Base mainnet JSON-RPC endpoint with event-log access.
- `X402_FACILITATOR_URL`: a v2-compatible facilitator supporting Base mainnet
  `exact`/EIP-3009. Supply authentication through
  `X402_FACILITATOR_HEADERS_JSON` if required. A public demo facilitator must not
  be assumed to support mainnet. Fees, gas sponsorship and account limits are
  provider configuration; this code promises no free facilitator service.
- `SIGNING_PRIVATE_KEY_FILE`, `SIGNING_PUBLIC_KEY_ID` and
  `SIGNING_PUBLIC_KEYS_JSON`: the Ed25519 signing key and trusted public-key files.
  Keep historical public keys for verifying stored responses on retry.
- `RISK_RESOLVER_MODULE`: absolute path to the existing backend intelligence
  adapter exporting `resolveRisk({subject,tier,signal})`. Its returned object must
  contain `availableTiers` and `riskByTier`, using only actual qualified evidence.
- `X402_ENABLED=true` and `BASE_CONFIRMATIONS` of at least 2 (default 2).

No risk resolver means a clear 503 with no payment settlement. No sample-data
fallback or substitute certification is installed. The complete `/v1/risk-gate`
product and qualification policy are Step 3; this module is its payment adapter.
The resolver must enforce your subject coverage, evidence freshness and tier
conditions before declaring any tier available.

### Wire protocol and verification

This implements x402 **v2**, `exact`, **EIP-3009**, Base `eip155:8453`, native USDC:
`0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`. It uses `PAYMENT-REQUIRED`,
`PAYMENT-SIGNATURE`, and `PAYMENT-RESPONSE` base64 JSON headers. It supports
65-byte EOA EIP-712 signatures. Permit2, ERC-1271 smart-contract wallet signatures,
bridged USDbC, arbitrary tokens, other chains and x402 v1 are not accepted.

| Requested tier | Maximum cash authorization | Available result example | Actual authorization |
|---|---:|---|---:|
| basic | 100000 USDC atomic units ($0.10) | basic | 100000 |
| standard | 150000 ($0.15) | basic only | 100000 |
| complex | 250000 ($0.25) | standard only | 150000 |

A login-free agent begins with:

```bash
curl -i -X POST "$API_ORIGIN/v1/risk-gate" \
  -H 'Content-Type: application/json' \
  -d '{"request_id":"e4321467-a5e0-40d5-893b-77abc6d99401","subject":"USA","tier":"complex"}'
```

The 402 response supplies the exact currently available price. The agent signs a
USDC `TransferWithAuthorization` and retries with the same body and
`PAYMENT-SIGNATURE`. A runnable viem agent is included:

```bash
# AGENT_PRIVATE_KEY stays in the agent's own secret store, not GeoMacro's.
# Set GEOMACRO_API_URL and EXPECTED_MERCHANT_ADDRESS before deliberately running.
node --env-file=agent.env examples/x402-agent.mjs USA basic
```

The CLI makes one paid submission and is an integration example. Production
agents must durably retain the request body and full payment authorization before
submitting, then retry those exact values after a timeout. Never restart payment
with a new nonce or request ID while the first outcome is uncertain.

Processing sequence:

1. Resolve actual available evidence. If a complex result is unavailable, quote
   the highest available lower tier. Never settle a higher-priced authorization
   for a cheaper result; return an updated cheaper challenge instead.
2. Locally recover the EIP-712 signer and validate chain-domain, token, recipient,
   exact value, authorization time window, nonce and v2 terms.
3. Build and verify the signed advisory result with `execution_authorized:false`,
   `billed_tier`, `credits_deducted:0` and the exact cash amount/payer/payee/nonce.
   Persist that result and the authorization before contacting a facilitator.
4. Claim a database lease, reject a used nonce, simulate the token transfer and
   ask the facilitator to verify. Only then request settlement.
5. Independently confirm the chain receipt: correct Base RPC chain, successful
   transaction, native-USDC `AuthorizationUsed` for that payer/nonce, and exact
   USDC `Transfer` to the merchant. Default confirmation count is 2; that is not
   the same as Ethereum/L1 finalized economic finality.
6. Atomically persist accountless usage, audit receipt, web3 transaction and
   confirmed intent; return HTTP 200 with the stored signed risk result and
   `PAYMENT-RESPONSE` settlement header. No prepaid-credit deduction occurs.

This verifies and settles authorizations; it does not accept an arbitrary
user-supplied transaction hash as payment. The ledger permanently reserves each
payer/nonce and each transaction/log reference. Canonical risk payload signatures
bind the cash amount and nonce; the settlement transaction is in the protocol
header and independently verifiable against the chain.

### Recovery and operating boundaries

Run the reconciliation command every minute using your deployment scheduler:

```bash
node --env-file=.env src/reconcile-payments.mjs
```

It scans durable pending intents, finds `AuthorizationUsed` events, verifies the
transfer, and completes receipts after facilitator/network/database failures. It
**observes payments only**; it does not generate a new authorization or submit an
unpaid pending intent. An explicit client retry may resubmit the original
single-use authorization, never a second payment. A 90-second SQL lease prevents
ordinary duplicate concurrent work. If reconciliation returns pending items,
exit code 2 makes them visible to monitoring. RPC log queries are chunked to 2,000
blocks; prolonged outages require archive/log availability and may require
operator investigation. Expired, unspent or otherwise unprovable intents are
retained for review rather than silently deleted or charged.

The worker is executable code, not an already installed recurring task. Schedule
it in the hosting environment during deployment. Do not expose it as a public
unauthenticated HTTP endpoint. Because it does not broadcast transactions, routine
reconciliation does not itself start new charges.

**Fair charging boundary:** no settlement is attempted for inconclusive evidence,
invalid signatures, wrong prices/recipients or observed cancellation before
broadcast. Once a signed authorization has been broadcast, PostgreSQL and Base
cannot commit atomically. A timeout may occur after funds moved. In that case the
stored result is recoverable with the same request/payment; never tell the agent
to pay again. This step does not implement automatic USDC refunds or claim a
universal zero-charge guarantee for every post-broadcast 5xx or client-network
failure. An unconditional version of that guarantee requires the later delivery
and compensating-refund policy plus a funded refund signer. No wallet seed or
refund signer was requested or fabricated here.

## Verification and remaining live acceptance

The package tests execute PostgreSQL SQL/PLpgSQL via PGlite, use real Ed25519 and
EIP-712 signatures, and inject PayPal/facilitator/RPC responses. Fixtures are
explicitly labeled. They exercise duplicate events, price/merchant mismatch,
subscription activation vs paid renewals, wrong chain/token/recipient, replay,
downgrade, rollback, and post-settlement recovery. These are not live PayPal or
Base transactions.

`GEOMACRO_CONCURRENCY_DATABASE_URL` enables Step 1's optional multi-connection
PostgreSQL test in a disposable installed database. It requires an owner test
connection and is not enabled by default. PGlite's same-request parallel test
checks the lease state machine but does not substitute for real multi-connection
PostgreSQL load testing.

Before enabling real payments, verify in the selected environment:

- Approved credit allocations and correct USD PayPal plan amounts.
- One buyer approval/capture and one verified real webhook/readback in sandbox.
- Subscription activation grants zero; confirmed payment/renewal grants once.
- Mainnet-capable facilitator, correct recipient and a controlled low-value USDC
  authorization/transfer with receipt/readback; no tests are auto-broadcast here.
- Real multi-connection concurrency, gateway request limits, reconciliation
  scheduling/alerts, current qualified risk resolver, and refund/dispute handling.

The package contains the implementation and runnable checks; production deployment,
real-payment acceptance and the remaining delivery/refund guarantees are not claimed.

## Official specifications consulted

- [PayPal Orders v2](https://developer.paypal.com/api/orders/v2)
- [PayPal Subscriptions v1](https://developer.paypal.com/api/subscriptions/v1)
- [PayPal webhook signature verification](https://developer.paypal.com/api/webhooks/v1/verify-webhook-signature-post)
- [PayPal subscription webhook events](https://developer.paypal.com/subscriptions/webhooks)
- [PayPal India bank transfers](https://www.paypal.com/in/cshelp/article/how-do-i-transfer-funds-to-my-bank-account-help394)
- [x402 v2 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md)
- [x402 exact EVM scheme](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md)
- [Circle native USDC on Base](https://www.circle.com/blog/usdc-now-available-natively-on-base)
