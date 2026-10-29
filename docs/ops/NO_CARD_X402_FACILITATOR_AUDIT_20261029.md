# GeoMacro zero-card facilitator candidate audit — October 29, 2026

STATUS: READ-ONLY CAPABILITY AUDIT. NO PROD PAYMENTS, NO AUTOMATIC SWITCHING.

Commercial target: retain existing immutable USDC Store SKU pricing ($0.02–$0.25).
Base preference: xpay, Dexter backup, PayAI only if still credit-eligible.
Polygon preference: Dexter, PayAI backup.
Arc: no independent no-card free hosted facilitator confirmed; Circle candidate remains subject to pricing and merchant verification.

Docs: https://docs.xpay.sh/en/x402-protocol/facilitator
Docs: https://docs.dexter.cash/docs/facilitator-and-chains/
Docs: https://facilitator.payai.network/
Docs: https://developers.circle.com/facilitator-service/keyless-trial

These are publicly advertised prices/capabilities, not independently proven 24/7 production fee guarantees or merchant settlement reliability. PayAI 1,000 credits are a lifetime allowance, not 1,000 mainnet transfers.

READ-ONLY CHECK (no card, no credentials, no funds):
- node --test scripts/tests/no-card-x402-facilitator-policy.test.mjs
- node scripts/ops/audit-no-card-x402-facilitators.mjs
- Or invoke GitHub Actions workflow 'No-card x402 facilitator read-only audit' manually.

A successful /supported probe is not a settled payment and never authorizes charging.
Before a production adapter is wired into POST /api/v1/intelligence/query:
1. Confirm exact native USDC, chain, signed requirement format, wallet custody and screening rules.
2. Confirm sustained fees/gas funding, usage ceilings, throttling and merchant eligibility.
3. Use existing protected DO idempotent settlement ledger; do not assume Coinbase-branded ledger keys can be reused for a different provider without reviewed migration.
4. Never switch providers after issuing a quote, receiving a signed authorization or entering uncertain settlement. Reconcile first.
5. Preserve canonical SKU prices and signed data/rights/freshness checks. Unavailable intelligence must never be chargeable.
6. Require fresh production /supported and independent no-funds negative tests, then explicit founder real-funds approval and one authorized mainnet canary, settlement receipt, immutable delivered response and idempotent replay.
7. Profit = paid USDC less facilitator, inference, acquisition, hosting, compliance, refunds and taxes. A fee-only estimate is NOT net profit.

EXPLICIT LOCKS: All Coinbase/Circle payment production ACKs, emergency freezes, source rights, PREDGE code/workflows/credentials/quotas/contracts and deploy paths remain untouched. No card, paid plan, customer funds or auto-activation.
