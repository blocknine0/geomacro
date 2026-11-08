# GeoMacro — crypto-only launch boundary (owner direction 2026-11-08)

## What is implemented in this PR

- NEW sales: **native Circle USDC only** on Base (CAIP-2 `eip155:8453`) and
  Polygon PoS (`eip155:137`). Base USDC contract
  `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; Polygon native USDC
  `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`. **No bridged USDC.e**.
- A code-level commercial provider allowlist only permits Coinbase Base
  `coinbase_x402`, xpay Base `xpay_x402` and Dexter Base/Polygon
  `dexter_x402`. All other providers, including PayPal, card, Nevermined,
  GOAT and Circle Gateway/Arc, are denied regardless of launch ACK.
  The provider-specific chain/token validation is an additional requirement.
- Existing VERIFIED PayPal REFUND/REVERSAL webhook handling remains available
  for any historical paid receipt even under freeze or no-new-fiat-sales.
- Public Store now only describes the USDC rails. It does NOT present a wallet
  address, QR, payment authorization or fake paid quote. It does not falsely
  say that the 6-product prepaid credit checkout is ready.
- The 6 SKUs, prices, credits and expiry policies stay unchanged. No new
  subscriber, account, credit, payment or signing record is created by
  this PR. The global emergency freeze remains effective.

## What remains BLOCKED before any real funds

1. Owner supplies **one public EVM receiving address** for Base and Polygon
   or explicitly gives two. Do not send a private key, seed phrase, or
   signing credential. Verify receiver ownership using an
   expiring, domain-bound **off-chain signed challenge** verified
   independently against the public address; do not rely on copying the
   wallet address from a chat message alone.
2. Check receiving wallet can accept native Circle USDC on both chains;
   validate chain ID, exact contract address, exact merchant address,
   payer/recipient, uint256 6-decimal amount, receipt status, canonical
   block hash and owner-approved confirmations via **independent read-only RPC**.
   Do not assume an RPC 200 is chain settlement.
3. Validate live xpay/Dexter/Coinbase supported networks, fee disclosure,
   no-funds probe and production isolation. A 402 quote is ONLY permitted
   after qualified, current, rights-cleared, Ed25519-signed frozen
   evidence and the real durable ledger availability test.
4. The 6-product prepaid **Store** still lacks verified
   `base_usdc`/`polygon_usdc` provider receipt to
   `customer_payment_receipts` → `customer_entitlement_grants` →
   `credit_ledger` atomic funding and reversal/reconciliation.
   This must be separately implemented and tested using exact chain/
   tx/log index identifiers; reusing the same transfer, different
   SKU, chain, customer or quote must NEVER allocate credits twice.
   Until then, do not solicit wallet transfers for Store packs.
5. No payment may bypass the protected Step3 migrations and production
   D1 cost governor, signing/Evidence Qualification gates,
   immutable B2 byte parity, finality, idempotent delivery and source
   distribution rights. Owner authorization alone does not prove them.
6. Owner obtains jurisdiction-specific tax, accounting, AML/sanctions and
   digital service/export treatment advice in India. No registration
   certificate may be needed to own a self-custody wallet, but accepting
   crypto is NOT a legal or tax exemption for an unregistered seller.

## Operator release sequence (once every dependency exists)

- Merge this **no-funds** scope PR after Product CI, CodeQL,
  independent no-funds contract and branch parity checks.
- Deploy frontend/Worker **only under existing protected canary** with
  all existing production payment and B2/D1 hold flags preserved.
- Record independently signed wallet identity + provider network/fee
  and canonical D1/B2/crypto proof receipts in a private operator log.
- Accept exactly the owner-approved, bounded on-chain canary only after
  genuine buyer-value output and provider finality; handle unknown
  settlement through on-chain reconciliation, **never a blind retry**.
- Activate the separately verified crypto-only prepaid checkout and
  usage ledger. Leave PayPal/card new sales locked; historical refunds
  still accepted.

**Current state: CODE-LEVEL CRYPTO-ONLY PREPARATION, NO LIVE SALES.**
