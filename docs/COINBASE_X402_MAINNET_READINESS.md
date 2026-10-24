# Coinbase x402 Base mainnet — capability-priced readiness

**Status: PREPARED, REAL-FUNDS GATE LOCKED.** Controlled prelaunch; real funds remain disabled pending independent production acceptance and owner authorization.
Canonical quote pricing is `src/lib/capability-pricing-catalog.ts`; this document is not a payment quote. The former universal `0.05 USDC / 20,000 calls` text is obsolete and **must not** be used for new orders. Prior settled ledger records retain their historical amounts.

## Seven active public Store products, 12 variants

| Product / capability | Variant | USDC |
| --- | --- | ---: |
| Country digest (`structural_country_digest`) | `standard` | 0.02 |
| Corridor digest (`structural_corridor_digest`) | `standard` | 0.05 |
| Country profile (`structural_country_profile`) | `standard` | 0.03 |
| Corridor profile (`structural_corridor_profile`) | `standard` | 0.08 |
| Intelligence query (`intelligence_query`) | `focused` / `standard` / `complex_multi_source` | 0.05 / 0.10 / 0.15 |
| Signed Risk Object (`signed_risk_object`) | `existing_valid_signed` / `newly_qualified_signed` | 0.05 / 0.10 |
| Risk Gate bundle (`risk_gate_bundle`) | `existing_proof_preflight` / `standard` / `complex_multi_source` | 0.10 / 0.15 / 0.25 |

The `gri_read` prices remain in the immutable historical catalog only; founder-retired GRI is **not** an active public Store item or a newly quotable capability. Do not revive it to fill a paid product gap. Risk Gate's signed object is included in its one price and must never be double-charged.

## Production network and signed quote

- Chain: **Base mainnet**, `eip155:8453`; asset: official Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
- Chargeable route: `POST /api/v1/intelligence/query`. Exact variant selection is `product: { capability, variant }`. The same immutable request, qualified output SHA, recipient, token, chain, and exact *server-resolved* atomic amount must remain bound from the 402 to delivery.
- `COINBASE_X402_PRICE_USDC` is still read by the **legacy Coinbase provider configuration** in `coinbase-x402.server.ts`. It is not the Store price, cannot replace `resolveEligiblePublishedCapabilityPrice`, and must never be used to calculate or override an active Store quote. Existing provider initialization may require this legacy setting until a separate reviewed compatibility refactor.
- A frozen catalog or configured facilitator is not proof that any individual variant can be delivered.

## Mandatory production gates

1. **Exact deployed SHA:** verify `main`, built release and served Lovable `geomacro.live` instance agree. GitHub mirror sync does not publish Lovable.
2. **Authentic source inputs:** real original native publication dates, subject relevance, actual independently checked same-event facts, applicable source-specific derived-commercial permissions, verified citations/attribution rules. Free sources are not automatically commercially licensed.
3. **Variant-specific eligibility:** for each structural corridor/module, both countries must have genuine qualified evidence; profiles need multiple dimensions. Intelligence requires the relevant verified current signed Risk Object and hot-topic pipeline. Newly qualified signed objects need a genuinely newer signing publication, not an updated timestamp. Risk Gate needs a verified signed object and policy result.
4. **Actual signing and hot state:** approved machine facts and rights authorities, separate real GRO signing authorization, verified B2 write/readback, Cloudflare D1 promotion, unexpired proof, production deep health. Historical/synthetic receipts do not satisfy a current product.
5. **No-funds payment acceptance:** recheck exact price and scope, construct valid 402 only after immutable product-byte freeze and independent Durable Object readbacks. Verify wrong amount, asset, chain, receiver, changed request, concurrent duplicate, expiry, failed source/rights, and ambiguous settlement all fail closed. No USDC sent.
6. **Separate explicit real-funds founder approvals** only after all relevant live checks pass:
   - `GEOMACRO_COMMERCIAL_LAUNCH_ACK=I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH`
   - `COINBASE_X402_MAINNET_ACK=I_ACCEPT_REAL_USDC`
7. **One explicitly authorized mainnet canary sale**, reconciled on provider and chain against exactly one immutable customer delivery. Only then claim verified commercial revenue for that proven variant. Gradually enable other variants after their own proof.

Keep both acknowledgements **blank** during all code, source, deployment, B2/D1 and no-funds acceptance. Never paste private credentials or wallet keys into GitHub docs, chat, PRs or website code.

Production prerequisites include `COINBASE_X402_ENVIRONMENT`, `COINBASE_X402_PAY_TO` (verified owner-controlled receiver), `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, protected Durable Object ledger configuration and genuine publisher B2/D1 signing authority. Cloudflare production and Lovable secret scopes require separate verification. **Credentials/configuration presence does not authorize settlement.**

The complete product-by-product acceptance criteria and existing no-funds workflows are in [Store seven-product acceptance](ops/STORE_SEVEN_PRODUCT_PRODUCTION_ACCEPTANCE_20261024.md), [Production Launch Acceptance](PRODUCTION_LAUNCH_ACCEPTANCE.md), and [Structured Deliverables](PAID_CAPABILITY_STRUCTURED_DELIVERABLES.md).
