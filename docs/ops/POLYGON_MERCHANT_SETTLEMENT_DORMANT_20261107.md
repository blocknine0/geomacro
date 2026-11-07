# GeoMacro Polygon merchant settlement — dormant implementation (no funds)

## Safety gate
The commercial deploy script retains **`commercialNoFundsOnly=true`** and
publishes `X402_ENABLED=false`, `POLYGON_X402_ENABLED=false`, and
`PAYPAL_ENABLED=false`, independently of any stale GitHub ACK. Nothing in
this release accepts a merchant payment, requests customer signatures,
broadcasts transactions, or calls the live Dexter `/settle` endpoint.

## Code / chain separation
- `src/payments/multichain.mjs` routes already-authenticated x402 v2
  EIP-3009 payments by the immutable CAIP-2 network. It offers Base native
  USDC/xpay and Polygon native USDC/Dexter only when enabled in a future
  owner-authorized deployment. It checks both durable intent stores before
  issuing a new challenge. A request ID is globally exclusive across
  credit, Base and Polygon rails.
- `src/payments/polygon.mjs` validates the Polygon Circle native USDC
  EIP-712 domain, exact transfer amount/recipient/nonce and signature.
  It calls Dexter `/verify` and, **only in an enabled future runtime**,
  `/settle`. No private wallet key is handed to Dexter. Two or more
  confirmed Polygon blocks and matching native-USDC `AuthorizationUsed`
  and `Transfer` logs are required before billing.
- If the facilitator broadcasts but the response is lost, a retry
  scans the **same nonce** and cannot sign or ask for a fresh authorization
  under the same request ID. Unknown statuses remain pending rather than
  falsely marked as success.

## Additive PostgreSQL migration (NOT a payment switch)
`sql/polygon-settlement-ready.sql` adds an independent Polygon intent store
under the private `geomacro` schema with immutable
network/asset/facilitator/payee/evidence/price/expiry attributes, 90-second
lease, durable nonce reservation, and atomic ledger/receipt writes after
independent on-chain verification. It extends the historical
`usage_logs.rail` and `web3_txs.chain_id` allowlists for native Polygon
USDC without editing historical rows; protects Base and credits with
transactional global request-ID locks; and adds private RPC dispatch for
Polygon functions. Public `anon` and `authenticated` roles never
receive table or RPC access.

## Acceptance, before the user initiates a live canary
1. Disposable PostgreSQL 17 and PGlite tests: authorization EIP-712,
   wrong chain/token/provider/payee, double spend, duplicate nonce,
   concurrent claims, timeout after submission, exact receipt/index,
   SQL privileges, and existing Base billing regressions.
2. Protected CodeQL, Product CI, Worker dry-run and migration/readback
   verification; no-funds POST must still respond HTTP 423.
3. Production source qualified GRO must be current, signed, independent,
   and rights-approved **for the requested tier**. Basic activity advisory
   is not a certified Risk Index. Standard and Complex currently cannot
   be sold unless their independent corroboration and signed evidence
   become genuine.
4. Only after owner approval, perform a deliberately authorized live test:
   pre-funded buyer separate from merchant, lowest-priced eligible
   tier, short timeout, 1 payment authorization, 1 receipt, 1 ledger row.
   Handle lost receipts by re-reading the original authorization nonce;
   never blindly re-authorize. Validate receiving wallet and reconciliation
   before promoting customer traffic.

**The present rollout is NO FUNDS.** No net-profit, merchant acceptance,
refund capability, or genuine mainnet settlement is claimed before the
owner's actual authorized funded canary. An origin like
`api.geomacro.live` must not be presented as verified until custom DNS
and protected route acceptance pass.
