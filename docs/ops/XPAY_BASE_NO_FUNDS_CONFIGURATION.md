# GeoMacro Base xpay — protected no-funds configuration acceptance

**Scope:** xpay on Base mainnet, x402 v2 exact, native USDC. This does not activate
payments, send money, change prices, create billing records, deploy a Worker, or
enable Polygon settlement. Existing Cloudflare $5/quotas, PayPal and Risk Gate
evidence policy are unchanged.

## Configuration (GitHub Actions)

The protected `Commercial API PostgreSQL Payment Rails` workflow reads:

| GitHub type | Key | Required |
| --- | --- | --- |
| Repository secret | `COINBASE_X402_PAY_TO` | Pinned owner-verified wallet address from `config/mainnet-usdc-recipient.json` |
| Repository secret | `BASE_RPC_URL` | HTTPS Base mainnet JSON-RPC endpoint |
| Repository variable | `GEOMACRO_COMMERCIAL_X402_FACILITATOR_URL` | `https://facilitator.xpay.sh` |
| Repository variable | `GEOMACRO_COMMERCE_DISABLED_PROVIDERS` | Must contain **both** `x402` and `coinbase_x402` |

Do **not** set `GEOMACRO_REAL_FUNDS_SECURITY_ACK`. Never paste an RPC API token,
private key, signed authorization, or other secret in issues or logs.

## What the protected manual check proves

After this PR is reviewed, tests pass, and code is merged to `main`, navigate to
**GitHub Actions → Commercial API PostgreSQL Payment Rails → Run workflow → main**.
Only the `xpay-no-funds-check` job runs on this manual trigger; **the deploy
job is explicitly restricted to `push` and cannot run on `workflow_dispatch`**.

The check:

1. Asserts both x402 quarantine entries and no real-funds ACK.
2. Compares the configured receiving address to the repository's pinned owner proof.
3. GETs xpay's `/supported` and checks Base `eip155:8453` / exact / v2.
4. POSTs one **read-only `eth_chainId`** request to the protected Base RPC,
   requiring `0x2105`. It never sends a transaction.
5. GETs commercial Worker health and readiness, verifies PostgreSQL ledger,
   Ed25519 issuer and **x402 remains disabled**.
6. Prints only a redacted capability summary, or a fixed diagnostic code. It
   never prints an RPC URL, credential or wallet signature.

This establishes configured input presence and the external no-funds readbacks,
**not** provider settlement, mainnet transfer receipt, merchant KYB,
fresh billable Risk Gate evidence, immutable customer delivery or fee guarantees.

## xpay adapter behavior

The existing `services/commercial-api` Base payment engine now selects a
strict xpay adapter only when its exact configured hostname matches
`facilitator.xpay.sh` and its origin is exactly
`https://facilitator.xpay.sh` (no auth headers).

The adapter sends the standard x402 v2
`{x402Version,paymentPayload,paymentRequirements}` body. It explicitly checks
and normalizes xpay's documented `valid` or standard `isValid` verification,
and `settled/txHash` or `success/transaction` settlement response. False,
conflicting, missing, wrong-network, malformed or wrong-payer fields fail closed.

**A returned transaction hash is never final proof.** The unchanged Base
verifier requires at least two chain confirmations and on-chain USDC
`AuthorizationUsed` plus exact `Transfer` to the pinned payee. The existing
durable SQL nonce/intent and replay protection remain in force.

An existing quote or uncertain settlement must **never** silently switch
facilitators; provider switching is outside this PR and requires a separately
reviewed, persistently pinned provider identity in the ledger before launch.

## Validation

```sh
node --test scripts/tests/check-commercial-xpay-no-funds.test.mjs
cd services/commercial-api
npm ci --ignore-scripts
npm test
```

The former is fixture-only; the latter includes an injected HTTP xpay response
suite and existing risk/payment concurrency contracts. No real funds are used.

## Live-money boundary

Real x402 stays **disabled**. Do not remove provider quarantine or set real
funds ACK merely because this preflight passes. Polygon/Dexter requires its own
ledger/network architecture. Before any payable mainnet acceptance, separately
verify source-qualified deliverable evidence, provider identity persistence,
real gateway behavior, transaction reconciliation, refund/compensation rules,
current fee/gas terms and an explicit owner-authorized canary.
