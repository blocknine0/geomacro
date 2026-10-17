# Geomacro API + Agent: Base, Arc, Polygon native USDC implementation

**Canonical APIs and agents already exist:**
- \`POST https://geomacro.live/api/v1/intelligence/query\` (canonical paid on-demand engine)
- \`POST /api/v1/intelligence/geopolitics\`
- \`POST /api/v1/intelligence/macro-fx\`
- \`POST /api/v1/intelligence/critical-minerals\`
- \`GET/POST /api/v1/agent\` (same canonical engine; no second scoring authority)
- \`/api/mcp\`, \`/api/a2a\`, \`/.well-known/agent-card.json\`
- \`GET /api/v1/finds\` (derived free Finds; not signed GRO/paid data)

## Three Circle USDC rails (x402 v2 exact)

| Network | CAIP-2 ID | Circle native USDC |
|---|---|---|
| Base | \`eip155:8453\` | \`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913\` |
| Arc | \`eip155:5042\` | \`0x3600000000000000000000000000000000000000\` |
| Polygon PoS | \`eip155:137\` | \`0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359\` |

**All use 6-decimal Circle native USDC**, not Polygon bridged USDC.e.
All are supported by Circle's hosted Facilitator Service:
https://developers.circle.com/facilitator-service/supported-networks

Circle Facilitator Service is DISTINCT from the existing Circle Gateway seller
implementation. Existing Coinbase CDP x402 Base adapter is not automatically an
Arc facilitator, and a chain being supported by Circle is not evidence that
Geomacro's product-specific payment integration or merchant wallet has deployed.

## Founder-approved public paid pricing catalog (no funds)

`GET /api/v1/pricing` is the canonical API and AI Agent price manifest.
It reads **only** `src/lib/capability-pricing-catalog.ts`, never a second
chain-specific schedule or the obsolete flat 0.05 USDC environment default.
It exposes exactly eight capabilities and fourteen variants:

| Capability | Variant(s) — exact USDC |
| --- | --- |
| gri_read | verified_cached 0.005; verified_change_attribution 0.01 |
| structural_country_digest | standard 0.02 |
| structural_corridor_digest | standard 0.05 |
| structural_country_profile | standard 0.03 |
| structural_corridor_profile | standard 0.08 |
| intelligence_query | focused 0.05; standard 0.10; complex_multi_source 0.15 |
| signed_risk_object | existing_valid_signed 0.05; newly_qualified_signed 0.10 |
| risk_gate_bundle | existing_proof_preflight 0.10; standard 0.15; complex_multi_source 0.25 |

All prices are in USDC with exactly six onchain token decimals.
Each variant shows Base, Arc and Polygon *catalog* options with the
same amount and exact native USDC contract. Bundles include their signed
object without a second charge. No hidden tier, automatic price increase or
mandatory subscription. No raw upstream data ever enters paid payloads.

This public manifest is **not** an invoice or x402 HTTP 402; it explicitly
reports merchant verification false, no source/data deliverability proof, and
no customer charge authorization. For the network-specific nonpayable
preview, use `POST /api/v1/payments/preflight`. Only after actual current
evidence, source rights, signed product, merchant setup and explicit
no-funds acceptance may separate live settlement be considered. The old
`GET /api/x402/risk` cannot advertise a flat USDC price for production.

## Public discovery (no funds)

\`GET /api/v1/payments/networks\`

Returns exact native networks, a reference to the approved pricing catalog,
the structured commercial license, canonical API/agent endpoints and explicit
\`merchant_settlement_ready=false\`. No wallet address or secrets are disclosed.

## Deterministic, nonpayable price preview (no funds)

\`POST /api/v1/payments/preflight\`

Request:

\`\`\`json
{"network":"arc","capability":"intelligence_query","variant":"focused"}
\`\`\`

Response contains exact founder-approved \`0.05\` USDC
(\`amount_atomic:"50000"\`), \`network:"eip155:5042"\`,
Arc's native USDC asset, a deterministic quote-binding SHA-256,
\`quotation_type:"NON_PAYABLE_CATALOG_PREVIEW"\`,
\`chargeable:false\` and \`payment_requirement_issued:false\`.
A preview is **not** an x402 402 challenge, invoice or settlement authorization.

\`\`\`json
{"network":"polygon","capability":"gri_read","variant":"verified_cached"}
\`\`\`

Returns exactly \`0.005\` USDC / \`5000\` atomic, subject to the
existing real-time data validation before any future paid offer.
Variant pricing always reuses \`capability-pricing-catalog.ts\`,
never separate pricing by chain. Official Agent discovery and OpenAPI
point to these new routes.

## Merchant production launch acceptance — not completed by a quote

1. Verify eligible source rights and actual deliverability of the exact
   requested structured product. Don't charge for stale/unsigned hot products.
2. Provision an **explicit** verified Geomacro EVM payTo address and a
   named/approved Circle Facilitator Service merchant account and API key
   or compatible signed seller-proof flow. Never infer a wallet address or
   enable payments from mere network discovery.
3. Implement a single versioned x402 \`exact\` quote bound to *network,
   native USDC asset, frozen capability price, payTo, resource, buyer request
   hash, expiry and license*. Verify vendor \`/supported\` and settlement
   response/status across the exact chosen chain. Do not mix Circle Gateway
   and Circle Facilitator Service wire APIs.
4. Reuse the existing replay-safe payment ledger and prepared deliverability
   receipt. Never double-charge a retry or supply a paid response before
   confirmed settlement/finality. For Base/Polygon monitor reorg/finality
   per Circle service requirements; Arc has its own finality behavior.
5. Execute per-chain negative tests, no-funds offer/readback canaries,
   independent B2/D1 signed-output verification, exact deployed website SHA,
   then founder's separate explicit real-money ACK before settlement.

**No raw data:** The customer only receives Geomacro-derived structured
intelligence under \`geomacro.structured-intelligence-commercial-license.v1\`.
Raw publisher articles, upstream titles, URLs, feeds and data archives are
not sold. Upstream rights and attribution restrictions remain independent.

**Zero-cost guard:** Do not reactivate Supabase, spend operator funds,
invent market pricing, add extra tiers or silently promote a new facilitator
to payable production. The public preview and discovery are useful even
while commercial signed products are unavailable.
