# GeoMacro Base/Polygon low-fee x402 candidate adapter — no-funds staged integration

Status: **CODE IN PR, NOT DEPLOYED OR PUBLICLY ROUTED. NO REAL FUNDS.**

## Deliverables

- `src/lib/no-card-x402-payment-adapter.server.ts`: allowlisted public facilitator candidates, strict prepared quote/native USDC network binding, frozen canonical prequote readback, atomic claim/prepare/complete using GeoMacro's existing authenticated Durable Object ledger, verify and settle interface, manual reconciliation of ambiguous settlement. Base supports xpay/Dexter; Polygon supports Dexter; **Arc remains unenabled for these providers**.
- `src/lib/no-card-usdc-receipt.server.ts`: independent JSON-RPC receipt and canonical block readback. Requires a successful EVM transaction, exact native USDC Transfer from the payer (when supplied) to GeoMacro's payTo address for the quoted amount, and a separately configured confirmation threshold.
- Existing frozen quote validator and Durable Object prequote vault expanded to recognize *only* the selected provider/network pairs. No legacy Coinbase/Circle settlement, pricing, PREDGE or delivery-state migration.
- Vitest no-funds simulated lifecycle + negative controls for wrong amounts, wrong chain, invalid signature, stale evidence, provider timeouts, duplicate delivered receipt, mismatched transfer, receipt reorg and post-settlement ledger ambiguity.

## Production launch gates still held

`POST /api/v1/intelligence/query` is **NOT** switched to xpay or Dexter by this PR. No new HTTP payable route is opened. Production operator must not set the mainnet ACKs merely because this PR exists.

The staged adapter requires ALL:
- Canonical published-only eligible structured product, real permitted source evidence, actual frozen immutable output and authenticated Durable Object readback, plus fresh revalidation immediately before settlement.
- Verified owner-controlled common USDC payTo address, on-chain native USDC identity (Base eip155:8453 / Polygon eip155:137), and live provider `GET /supported` exact v2 scheme admission.
- `GEOMACRO_COMMERCIAL_LAUNCH_ACK=I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH`
- `GEOMACRO_REAL_FUNDS_SECURITY_ACK=I_ACCEPT_REAL_FUNDS_SECURITY_GATES`
- `GEOMACRO_NO_CARD_MAINNET_ACK=I_AUTHORIZE_NO_CARD_FACILITATOR_REAL_USDC`
- `GEOMACRO_NO_CARD_PROVIDER_FEE_APPROVED=I_HAVE_VERIFIED_CURRENT_PROVIDER_FEES`
- `GEOMACRO_COMMERCE_LEDGER_BACKEND=durable_object`
- `GEOMACRO_NO_CARD_APPROVED_FEE_XPAY_USDC` / `GEOMACRO_NO_CARD_APPROVED_FEE_DEXTER_USDC`: current owner-verified per-settlement facilitator fee (six-decimal USDC), required and capped at 5% of the exact Store SKU; no default 0 is assumed.
- `GEOMACRO_NO_CARD_RPC_BASE` or `GEOMACRO_NO_CARD_RPC_POLYGON` (trusted HTTPS mainnet RPC) and `GEOMACRO_NO_CARD_CONFIRMATIONS_BASE` or `GEOMACRO_NO_CARD_CONFIRMATIONS_POLYGON` (approved positive required depth).
- Positive independent merchant eligibility/terms review and no-funds chain-specific security acceptance, then separate explicit founder approval and first real-USDC canary.

The actual production wrapper does not accept an arbitrary chain-confirmation callback; it uses `confirmNoCardNativeUsdcChainSettlement` and RPC settings configured by the owner. The internal dependency-injected lifecycle exists solely to make no-funds negative scenarios reproducible.

## Protocol and accounting boundaries

No third-party payment client can define prices, data scope, evidence eligibility or entitlement. Never mutate an already-issued quote to switch a facilitator. Never use a "retry" to re-settle when an unknown settlement may have occurred. Never report a paid structured response until the recorded on-chain transfer and durable delivery completion agree.

Gas sponsorship and zero facilitator fees are provider-advertised conditions, not a contractual uptime or net-profit guarantee. Do not claim unlimited free settlements. Use Coinbase/CDP as a separately reviewed fallback, not as a silent signed-payment reroute. PayAI free credits are limited; it is not connected to this settlement adapter.

## Run tests

`bunx vitest run src/lib/no-card-x402-payment-adapter.server.test.ts src/lib/no-card-usdc-receipt.server.test.ts`

These tests never access any blockchain, create a payer signature, request settlement or use real USDC. Live no-funds public `GET /supported` audit is available in `scripts/ops/audit-no-card-x402-facilitators.mjs`.

## Explicit non-goals

- No production publish or real transfer; no user-funded canary without explicit separate approval.
- No proprietary source leak; paid output remains governed derived intelligence.
- No PREDGE code, workflow, auth, quota, credential, token, contract, or operating behavior changes.
