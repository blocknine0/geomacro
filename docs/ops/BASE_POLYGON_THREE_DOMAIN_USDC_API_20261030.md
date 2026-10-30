# GeoMacro three-category USDC API — Base + Polygon chain-selection contract

Status: **network routing implementation only**. This document is NOT evidence of live funded sales, a verified merchant wallet, qualified current events or customer delivery.

## Single intelligence product; two native-USDC mainnet choices

All routes delegate to GeoMacro's one canonical structured-intelligence price/evidence/payment contract. No raw article is delivered, and there is no separate source engine, subscription, price override or manual review required merely to generate a private five-part draft.

| Category | Customer POST | Canonical paid POST |
| --- | --- | --- |
| Geopolitics | `/api/v1/intelligence/geopolitics` | `/api/v1/intelligence/query` |
| Macro/FX | `/api/v1/intelligence/macro-fx` | `/api/v1/intelligence/query` |
| Critical Minerals | `/api/v1/intelligence/critical-minerals` | `/api/v1/intelligence/query` |
| Natural-language structured answer | `/api/v1/intelligence/structured-answer` | `/api/v1/intelligence/query` |

The caller may append exactly one `?network=base` or `?network=polygon` to **any** of the above POST routes. Alias forwarding preserves the selected network and unchanged PAYMENT-SIGNATURE; the payable resource is always the canonical URL with that same network selector. Never silently turn a Polygon selection into Base.

- Base: `eip155:8453`, Circle native USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; existing guarded low-fee candidate `xpay_x402`.
- Polygon PoS: `eip155:137`, Circle native USDC `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`; existing guarded candidate `dexter_x402`.
- The underlying locked `intelligence_query` focused/standard/complex catalog prices are respectively `0.05`, `0.10`, `0.15` USDC. A catalog amount is **not** a payable offer; exact variant and amount are server-determined after qualified evidence/readback.
- Do not substitute Polygon bridged USDC.e, mismatched chain IDs, Arc or a testnet asset.

### Exact example (no signature, no payment)

```sh
curl -sS -X POST 'https://geomacro.live/api/v1/intelligence/structured-answer?network=polygon' \
  -H 'content-type: application/json' \
  --data '{"question":"What is the latest verified critical-minerals policy update in Chile?","subjects":[{"type":"country","country_iso3":"CHL"}],"topics":["critical_minerals"]}'
```

A `402 PAYMENT-REQUIRED` is valid **only** after real evidence eligibility, exact frozen response/prequote, verified network-specific receiver/provider and merchant authorization. Until then, receive a truthful no-charge error or noncommercial research response, not a simulated paid delivery. Payment signatures must be created by the buyer from the canonical 402 resource; do not send wallet secrets.

### Live seller acceptance remains separate

Required independent per-chain/per-category proofs: publisher-rights-qualified derived intelligence, actual original timestamps and five-part query response, canonical D1/B2 storage/receipt as required by the SKU, exact main deployment, receiver ownership, current provider support and fees, authenticated DO prequote/ledger persistence, independent onchain native USDC transfer confirmation, no replay double-charge, frozen byte-identical customer 200 and issuer/finality receipts. Merchant activation flags and private RPC/provider keys are operator-managed; do not commit them or set any ACK without those proofs. Controlled sale remains disabled by existing fail-closed gates until production acceptance.

No changes to PREDGE, historical/Supabase, website presentation, prices, source quotas, provider set, or signing/settlement authority.
