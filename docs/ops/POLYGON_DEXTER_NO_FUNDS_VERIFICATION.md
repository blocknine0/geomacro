# GeoMacro Polygon USDC + Dexter: no-funds verification and activation boundary

Status: **NO FUNDS ONLY**. This is not merchant settlement, money acceptance, or
a complete production Polygon checkout. Base xpay stays under its independently
verified protected production no-funds preflight.

## Current selected rails

| Rail | Mainnet / CAIP-2 | Native USDC | Facilitator | Financial status |
| --- | --- | --- | --- | --- |
| Base | `eip155:8453` | `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` | xpay | Off |
| Polygon PoS | `eip155:137` | `0x3c499c542cef5e3811e1192ce70d8cc03d5c3359` | Dexter | Off |

The wallet address is the existing ownership-verified
`config/mainnet-usdc-recipient.json`. Same EVM address is configured, but
ownership does **not** demonstrate a funded transaction or on-chain merchant receipt.

Polygon public RPC for **read-only** proof is
`https://polygon-bor-rpc.publicnode.com` (PublicNode's documented endpoint).
This is a best-effort external service, not a dedicated log-archive SLA.
Do not use Polygon's deprecated `polygon-rpc.com` mainnet endpoint.

## Tests

```sh
node --test scripts/tests/check-commercial-polygon-no-funds.test.mjs
cd services/commercial-api
npm ci --ignore-scripts
npm test
```

`services/commercial-api/src/payments/polygon.mjs` includes:

- Independent Polygon EIP-712 EIP-3009 domain/nonce/amount/token/payee/expiry/signature recovery.
- Strict chain ID 137 and native-USDC on-chain nonce/transaction receipt
  observability, requiring a matching `AuthorizationUsed` and exact `Transfer`.
- Dexter verify-only client. **No settlement method**; no Worker route invokes it.
- Tests use offline accounts and injected fake chain logs. No customer credentials.

## Protected no-funds acceptance

The existing `Commercial API PostgreSQL Payment Rails` workflow now has a
separate `polygon-no-funds-check` job on main push or protected manual dispatch.
It never receives or discloses wallet private keys, payment authorizations or
merchant credentials. It requests exactly:

1. `GET https://x402.dexter.cash/supported` -> x402 v2, exact, `eip155:137`.
2. `eth_chainId` -> `0x89` from the independent Polygon RPC.
3. `eth_getCode` -> deployed native-USDC code at the exact contract.
4. `eth_call` `decimals()` -> exactly 6 decimals.
5. `GET /v1/commercial/health` and `/v1/commercial/readiness` -> ledger and
   issuer present, payment disabled.

It does not call `/verify` or `/settle` on a real authorization,
`eth_sendRawTransaction`, `approve`, or any state-changing RPC.

The commercial Worker reports `polygon_x402_configured:false`.
The no-funds deploy script has a reviewed hard-coded `commercialNoFundsOnly=true`
gate keeping **both PayPal and Base/Polygon USDC disabled regardless of any
misconfigured GitHub ACK**; global coordinated launch is not auto-acknowledged.

## Separately remaining before real-money launch (not approved)

1. **PostgreSQL multi-chain ledger**. Current `geomacro.web3_txs` has
   `chain_id bigint ... CHECK(chain_id=8453)`, and
   `x402_prepare/x402_confirm` assume `base_usdc` and Base native USDC.
   A reviewed additive migration must persist the immutable network/token/provider
   across quote, prepare, claim, settlement, reconciliation and receipt. Do not
   replace historical Base entries or collapse nonces across networks.
2. Bind prepared result hash, signed evidence, exact price and immutable Polygon
   payment requirements to a chain/provider-specific quote. Guarantee no implicit
   switching to another chain/provider after quote/authorization.
3. Verify independent Polygon Mainnet confirmation/readback and recover unknown
   transaction status using the same nonce without duplicate charge.
4. Prove availability of actual **eligible** three-tier Risk Gate output from
   the protected source pipeline. A no-funds evidence result
   `QUALIFIED_EVIDENCE_UNAVAILABLE` means **do not charge**.
5. Establish current fee/gas, refunds/chargebacks, wallet merchant policy and
   identity/compliance acceptance; then require a distinct founder real-money
   ACK before an explicitly authorized mainnet payment canary.

**No money can be collected by this release; no funded acceptance is claimed.**
