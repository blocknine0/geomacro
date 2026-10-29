# Low-fee x402 canonical checkout — isolated, feature gated

**Code staged; no real USDC accepted by this change.**

## Canonical endpoint (unchanged)

`POST https://geomacro.live/api/v1/intelligence/query`

When `GEOMACRO_LOW_FEE_CHECKOUT_ENABLED=true` AND all independent real-funds safety approvals are explicitly configured, this same public endpoint can offer:
- **Base mainnet**: `?network=base` (or no network parameter), xpay `exact` native USDC, chain `eip155:8453`.
- **Polygon PoS mainnet**: `?network=polygon`, Dexter `exact` native USDC, chain `eip155:137`.
- **Arc**: intentionally **NOT** enabled on xpay/Dexter. Circle's commercial fee/merchant terms remain separate.

The caller does not choose arbitrary provider URLs. Existing Coinbase-signed payloads remain routed to their Coinbase path. Already-settled no-card signatures may replay exact frozen bytes from the same Durable Object without fresh charges, even if new sales are disabled.

## No-charge preflight and protected settlement

1. Parse the canonical supported product, country/corridor/query, then enforce real source eligibility and current product deliverability. No payment if unavailable.
2. Resolve the same immutable catalog amount/variant. Live facilitator `GET /supported` must advertise **x402 v2 exact** on the selected mainnet.
3. Freeze exact derived customer JSON bytes in the existing authenticated Durable Object before issuing the signed-quote-bound 402. Never provide raw publisher data.
4. Verify caller's `PAYMENT-SIGNATURE` carries exact previously quoted network, native token, price, merchant recipient, request fingerprint, prepared response hash, product and query-plan hash.
5. Claim once in the same protected DO ledger; verify payment; revalidate latest evidence and exact SKU; prepare same bytes in ledger.
6. Settle with the fixed allowlisted facilitator ONLY after explicit separate founder approvals. Independently verify transaction status, canonical chain/block, exact token Transfer log, amount, payTo and approved confirmation depth via owner-selected HTTPS RPC.
7. Complete the ledger atomically; only then send HTTP 200 immutable JSON, payment receipt and SHA. If the response/chain/ledger is uncertain, fail for manual reconciliation; NEVER automatically charge again.
8. An already-delivered signed replay reads only its own immutable paid receipt, not a new quote/settlement.

No anonymous /verify or /settle endpoint is exposed to clients. No payment private key enters code, browser, GitHub, or analytics.

## Manual launch prerequisites (NOT SET by PR)

- `GEOMACRO_LOW_FEE_CHECKOUT_ENABLED=true`
- `GEOMACRO_COMMERCIAL_LAUNCH_ACK=I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH`
- `GEOMACRO_NO_CARD_MAINNET_ACK=I_AUTHORIZE_NO_CARD_FACILITATOR_REAL_USDC`
- `GEOMACRO_NO_CARD_PROVIDER_FEE_APPROVED=I_HAVE_VERIFIED_CURRENT_PROVIDER_FEES`
- `GEOMACRO_REAL_FUNDS_SECURITY_ACK=I_ACCEPT_REAL_FUNDS_SECURITY_GATES`
- `GEOMACRO_NO_CARD_APPROVED_FEE_XPAY_USDC` / `GEOMACRO_NO_CARD_APPROVED_FEE_DEXTER_USDC`: independently confirmed current fee, 5% ceiling
- Owner-verified `GEOMACRO_USDC_RECEIVER`, `COINBASE_X402_PAY_TO`, `CIRCLE_X402_SELLER_ADDRESS` consistency (never private keys)
- Protected DO ledger, `GEOMACRO_COMMERCE_LEDGER_BACKEND=durable_object`, URL and secret (server-only)
- Trusted read-only `GEOMACRO_NO_CARD_RPC_BASE` / `GEOMACRO_NO_CARD_RPC_POLYGON` HTTPS RPC, plus explicitly approved positive `GEOMACRO_NO_CARD_CONFIRMATIONS_BASE` / `GEOMACRO_NO_CARD_CONFIRMATIONS_POLYGON`.

**Do not set these before real production source/rights health, no-funds negative acceptance, merchant eligibility, fee and wallet verification, and founder real-funds authorization are independently complete.** No silent provider fallback after a 402 or signed payment. Do not use testnet as commercial proof.

## Evidence still missing

Production SHA publication, independently confirmed provider SDK wire compatibility and live /supported for each chain, no-funds DO readback on actual deployed instance, full qualified rights/data eligibility, merchant identity, current zero-card facilitator fee undertakings, explicit real mainnet founder approval, and a funded buyer canary with matched on-chain receipt and exactly-once structured output.

**PREDGE LOCK:** no changes to PREDGE code, contracts, credentials, workflow, quota, auth, runtime, or operating behavior.
