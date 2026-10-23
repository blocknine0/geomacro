# Geomacro — official three-category mainnet API contract

Status: **code/discovery integration**, NOT a production payment or signed-data readiness certificate. Brand name is **Geomacro**. Do not relabel prelaunch as mainnet-live until the independent production acceptance steps succeed.

## Exactly one canonical intelligence engine

- Production origin: `https://geomacro.live`
- Canonical payment-bound intelligence resource: `POST /api/v1/intelligence/query`
- Geopolitics fixed category: `POST /api/v1/intelligence/geopolitics`
- Macro / FX fixed category: `POST /api/v1/intelligence/macro-fx`
- Critical Minerals fixed category: `POST /api/v1/intelligence/critical-minerals`
- Official Geomacro Agent: `GET/POST /api/v1/agent`
- Agent/OpenAPI discovery: `GET /api/v1/agent?view=openapi`
- Official locked price schedule: `GET /api/v1/pricing`
- Free no-funds availability: `GET/POST /api/v1/intelligence/availability`
- Free public derived Finds: `GET /api/v1/finds`
- Base/Arc/Polygon **nonpayable** rail previews: `GET /api/v1/payments/networks`, `POST /api/v1/payments/preflight`.

The three category POSTs reuse `createCategoryIntelligenceHandlers` and forward to the **same canonical handler**. They apply fixed topics and modules, currently accept country subjects only, and default to `live_on_demand`. Country ISO3 routability (195) is **not** an assertion that a current signed, rights-cleared product exists for all 195 x 3 cells. Do not attach unrelated topic or corridor subjects to fixed-country aliases; for qualified corridor/multi-topic requests use the governed canonical query or official Agent with its appropriate schema.

A minimal **non-paying** category request has the shape:

```http
POST /api/v1/intelligence/macro-fx
Content-Type: application/json

{"subjects":[{"type":"country","country_iso3":"IND"}],
 "question":"What are India's current macro and FX risks?",
 "max_age_seconds":86400}
```

Equivalent paths for geopolitical and mineral questions are the category routes listed above. Never send an unapproved payment signature in a smoke test. If current source rights or eligible verified data are unavailable, a truthful non-chargeable 422/503 is **success for the fail-closed policy**, not commercial deliverability.

## Source and delivery reuse

Use the existing same-source record/evidence pipeline for public Finds, Intelligence, Ask Geomacro and structured paid intelligence. Independent GRI 1.2 scoring and three signed Risk Indices are **derived consumers with separate genuine scoring, signing and publication approvals**. Do not assign source-item timestamps to annual observations or write artificial current scores. No raw upstream article, third-party payload, upstream source URL, private reviewer proof, or signing secret enters buyer output.

x402 v2 accepts the canonical resource URL in its payment binding; a category alias is a **request convenience, not a separate merchant resource, charge, wallet or settlement record**. The `PAYMENT-REQUIRED` challenge, if and only if a real eligible prepared deliverable exists and the launch gates are open, remains bound to `/api/v1/intelligence/query`. Clients must follow the canonical payment resource and never auto-pay retries. Frozen exact response bytes, price/variant, network/native USDC, payTo, freshness, source rights, current signature, ledger idempotency and settlement all remain validated by the existing contract.

## Locked founder pricing

No price changes in this update. All 8 capabilities / 14 approved variants continue to come only from `src/lib/capability-pricing-catalog.ts` (`geomacro.capability-usdc.v1`). Examples: `intelligence_query` focused **0.05**, standard **0.10**, complex multi-source **0.15 USDC**; `gri_read` verified cached **0.005**, attribution **0.01 USDC**; country digest **0.02**, corridor digest **0.05**, country profile **0.03**, corridor profile **0.08 USDC**. The catalogue also contains existing signed-risk-object and risk-gate-bundle variants. Those are not additional category subscriptions, and the bundle includes its signed object without double charge. Base is the approved initial Coinbase mainnet network; native Arc/Polygon catalog preview is not merchant settlement acceptance.

## Public brand/discovery equality

The **runtime** `/.well-known/x402` and `/.well-known/x402.json` discovery now declare `name: "Geomacro"`, the three official category routes, the one canonical payment-bound query resource, and explicit boundaries separating routability from current signed data coverage. The official dynamic `/api/v1/agent` already presents the Geomacro brand and governed category tools. **Owner-locked static** `public/.well-known/x402`, `x402.json`, `geomacro-agent.json` and `geomacro-commerce.json` are deliberately unchanged because the website lock rejects their modification. They remain frozen `prelaunch`, `resources: []`, `productionFundsAuthorized: false` fallback assets. Separately approve and baseline-update website static naming before claiming public fallback branding is finalized. Never bypass the website lock by changing the verifier.

## Verification required before calling this live

1. Product CI, pre-mainnet no-funds tests, Website Lock, Hosting Alignment and CodeQL green on the **exact merged SHA**.
2. Actual served `geomacro.live` SHA parity and JSON/readback of all three category discovery paths, official OpenAPI, locked price manifest and x402 fallback without any payment header.
3. Current independently qualified, signed, lawful and original-date-bound Intelligence, GRI and Risk Indices acceptance: B2 readback, D1 hot promotion, valid reviewer and Facts/Rights signatures, current three-product deep health **HTTP 200** (not synthetic 200).
4. Authenticated merchant/wallet ownership and current network/facilitator support; prepared product and true exact signed data, immutable quote/body hash, no-funds negative and replay tests.
5. **Separate explicit owner approval** for real-money activation and one independently reconciled real-USDC purchase. This patch neither grants authorization nor sends funds. Keep the emergency stop switch intact.

Supabase remains frozen. No paid API/service, invented source rights, no extra engine, fake reviewer certificate, silent production deployment, or transaction is part of this change.
