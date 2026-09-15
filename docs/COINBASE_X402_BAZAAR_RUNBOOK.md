# Coinbase CDP x402 + Bazaar production runbook

Status: implementation/acceptance-test track. This rail is isolated from the existing Circle Gateway x402 proof on Arc Testnet.

## Product boundary

`POST /api/x402/risk` sells a Geomacro geopolitical/macro risk pre-flight. The response includes Risk Gate context but never authorizes or executes the caller's financial action. The initial public paid scope remains the same acceptance-tested demo scope: `USA`, `CHN`, `USA>CHN`, and `CHN>USA`.

The Coinbase rail uses the x402 `exact` scheme. Base Sepolia is the mandatory staging network. Base mainnet is locked in code until an explicit production acknowledgement and explicit price are configured.

## Server-only configuration

Never use a `VITE_` prefix and never commit real values.

```text
COINBASE_X402_ENVIRONMENT=testnet
COINBASE_X402_PAY_TO=0x...
COINBASE_X402_PRICE_USDC=0.05
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
```

`COINBASE_X402_PAY_TO` is a public receiver address, not a private key. Use a dedicated Geomacro revenue/settlement address rather than a market, swap, bridge, or unrelated treasury address.

The CDP secret may be either a PKCS#8 ES256 PEM private key or a 64-byte base64 Ed25519 key. It must remain server-only.

Production additionally requires:

```text
COINBASE_X402_ENVIRONMENT=production
COINBASE_X402_PRICE_USDC=<explicit production price>
COINBASE_X402_MAINNET_ACK=I_ACCEPT_REAL_USDC
```

Do not set the mainnet acknowledgement until every acceptance gate below is green.

## Database migration

Apply `supabase/migrations/927_coinbase_x402_delivery_ledger.sql` before enabling the endpoint in a hosted runtime. The ledger stores only payment/request fingerprints, hashed payer/pay-to references, prepared response state, and settlement references. It intentionally does not store raw payment signatures, authorizations, private keys, or CDP credentials.

The delivery claim is the application-level replay/idempotency boundary. It binds one x402 payment payload fingerprint to one normalized Geomacro request. Ambiguous external settlement outcomes are moved to manual review instead of automatically retrying a potentially settled authorization.

## Base Sepolia acceptance sequence

1. Deploy the migration and application with `COINBASE_X402_ENVIRONMENT=testnet`.
2. `GET /api/x402/risk` must report Base Sepolia (`eip155:84532`), USDC, Coinbase CDP, and `execution_authorized=false`.
3. A valid JSON `POST /api/x402/risk` without `PAYMENT-SIGNATURE` must return HTTP 402 and a base64 `PAYMENT-REQUIRED` header.
4. Decode `PAYMENT-REQUIRED` and confirm:
   - x402 version 2
   - `exact` scheme
   - Base Sepolia network
   - Base Sepolia USDC contract
   - exact configured atomic amount and pay-to address
   - absolute resource URL
   - `extensions.bazaar.info.input.type=http`
   - method `POST`, body type `json`, realistic supported request example
   - output example/schema
5. Run Coinbase endpoint validation against the public HTTPS URL:

```bash
curl -X POST https://api.cdp.coinbase.com/platform/v2/x402/validate \
  -H "Content-Type: application/json" \
  -d '{"resource":"https://geomacro.live/api/x402/risk","method":"POST"}'
```

Acceptance requires `valid: true` and `simulation.outcome: "accepted"`.
6. Complete an x402 payment using an x402-compatible client that echoes the advertised `resource` and `extensions.bazaar` into its PaymentPayload.
7. Confirm the paid retry returns HTTP 200, a `PAYMENT-RESPONSE` header, `execution_authorized=false`, and the expected Risk Object/Risk Gate payload.
8. Confirm the CDP settlement transaction, receiver, amount, network, and Geomacro database evidence agree.
9. Confirm the same payment proof + same request replays the cached delivery without a new settlement attempt.
10. Confirm the same payment proof + a different request fails with a conflict.

## Guarded paid E2E workflow

Use `.github/workflows/coinbase-x402-base-sepolia-paid-e2e.yml` only with a dedicated Base Sepolia buyer wallet. The workflow is manual-only, hard-pinned to `https://geomacro.live/api/x402/risk`, hard-pinned to Base Sepolia USDC, and refuses any advertised amount above `0.05` USDC.

Create a protected GitHub environment named `coinbase-x402-base-sepolia-paid-proof` and add:

```text
GEOMACRO_COINBASE_X402_BUYER_PRIVATE_KEY=<dedicated Base Sepolia test-wallet private key>
GEOMACRO_COINBASE_X402_BUYER_ADDRESS=<matching public address, recommended>
GEOMACRO_COINBASE_X402_BASE_SEPOLIA_RPC=<optional Base Sepolia RPC; defaults to https://sepolia.base.org>
```

Never paste the buyer private key into chat, issues, PRs, logs, workflow inputs, Lovable, source code, or artifacts. The wallet must hold at least the configured x402 amount in Base Sepolia USDC before the run.

Run the workflow with the exact confirmation:

```text
COINBASE_X402_BASE_SEPOLIA_USDC
```

One successful run must prove all of the following in a sanitized 90-day artifact:

- initial HTTP 402 challenge
- one signed paid request returns HTTP 200
- settlement transaction confirms on Base Sepolia
- buyer USDC debit equals the advertised x402 amount exactly
- paid and replayed responses both preserve `execution_authorized=false`
- replaying the exact same signed proof + same request returns cached delivery without a second USDC debit
- reusing the same signed proof with changed business terms returns HTTP 409 without a debit
- duplicate charge count is zero
- no buyer private key or raw `PAYMENT-SIGNATURE` is persisted in evidence

The workflow deliberately performs no automatic retry after a signed payment exists.

## Mandatory negative/security acceptance

The endpoint is not launch-ready until all of these fail safely: no payment, malformed payment header, wrong x402 version, wrong scheme, wrong network, wrong USDC contract, wrong amount, wrong pay-to, wrong timeout requirements, invalid/expired signature, underfunded authorization, reused nonce, altered request with reused payment proof, concurrent duplicate request, oversized body, malformed JSON, rate-limit abuse, CDP verify timeout, CDP settle timeout, database claim failure, and Risk Engine/Risk Gate failure.

Required safety outcomes:

- unpaid premium intelligence is never returned
- wrong-chain/token/recipient/amount proofs never reach settlement
- duplicate charge count remains zero
- concurrent duplicate calls do not independently settle
- an ambiguous settle response is locked for reconciliation instead of automatically retried
- every delivered Risk Gate result keeps `execution_authorized=false`
- no CDP secret, raw signature, raw authorization, or private key is logged or persisted

## Bazaar indexing

Coinbase does not require a registration form. A public HTTPS endpoint with valid Bazaar metadata becomes eligible for indexing after a successful settled payment through the CDP Facilitator. The paying client must echo the Bazaar extension and resource metadata in the PaymentPayload; a server-only declaration is not enough.

After the first settlement, verify discovery using CDP's Bazaar discovery/search surfaces and inspect extension status. A rejected Bazaar status is a launch blocker even if the USDC settlement itself succeeded.

## Mainnet release gate

Do not switch to Base mainnet until all testnet acceptance evidence is preserved. Before real funds are enabled, confirm:

- Product CI, database schema safety, security/resilience and CodeQL are green at the exact deployment commit
- the Base Sepolia Coinbase validator passes
- repeated paid E2E tests show zero duplicate charges
- replay/conflict/ambiguous-settlement tests pass
- receiver wallet ownership and operational backup are confirmed
- production per-call price is explicitly approved
- commercial source/data licensing permits the paid response
- monitoring and settlement reconciliation ownership are assigned

Only then configure production environment, the explicit mainnet acknowledgement, the production CDP credentials, dedicated Base receiver, and production price.

## Mainnet accounting boundary

A successful Base settlement is initially recorded as `commercial_pending_accounting` with reconciliation pending. Do not publish it as reconciled commercial revenue until the onchain transaction amount, asset, network, and recipient match the Geomacro payment ledger. Testnet payments are always non-revenue.
