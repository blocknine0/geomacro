# Geomacro buyer and AI-agent launch acceptance (19 October 2026)

**Status: acceptance checklist, not a production-launch certificate.** This document is product-facing: what a human buyer and a machine buyer must actually experience. Supabase remains frozen; no real funds or automatic owner ACK. The implementation uses one canonical intelligence engine.

## Human customer journey

1. **Homepage:** within 40 seconds, communicate three domains, one free qualified Find, latest original publication timestamp, clear stale/previously verified state and paths to Ask, Intelligence, Risk Indices, API and Pricing. Never invent a new release or show "current" when only an older original is available.
2. **Intelligence:** category filters for geopolitics, macro/FX and critical minerals; event observations with "what changed", "why it matters", "watch next" and eligible confidence. A no-score Find is labeled unscored. Website Finds are >=15 minutes delayed; separately governed Risk Indices retain >=60 minutes of public delay.
3. **Ask:** question, no-evidence answer and retry states are understandable. Historical context is distinguished from fresh first-party observations. Missing values or an unavailable country/category are explicit, not generated numbers.
4. **Pricing:** free website browsing differs from commercial API. Display the existing `geomacro.capability-usdc.v1` schedule: 8 capabilities / 14 variants, exact amount before authorizing payment, not a universal 0.05 USDC price. No new tiers.
5. **Checkout:** buyer sees an exact bound capability, variant, network, asset, amount, quote expiry and response eligibility. Stale, unqualified, unavailable or failed results must never be charged. No implied customer consent or background payment.
6. **Support/trust:** publish dated availability, product use/licence, commercial boundaries, contact and known limitations. Mobile/keyboard/desktop checks required.

## Machine/agent journey

1. **Discover:** `GET /api/v1/agent`, `GET /api/v1/agent?view=openapi`, `GET /api/v1/pricing`. Discovery is free and never proves readiness or authorizes payment.
2. **Validate:** tool-specific JSON envelopes are a discriminated `oneOf` in the official OpenAPI. A `country_risk` call must supply `{"tool":"country_risk","arguments":{"country_iso3":"IND","domains":["macro"]}}`. ISO3 routing across 195 countries is **not** a guarantee of fresh commercial data for all 585 cells.
3. **Check only eligible baseline:** `GET /api/v1/intelligence/availability` describes the **structural_baseline-only** no-funds preflight; `POST` accepts a canonical query with exactly that `delivery_tier` and supported scope. It is **not** a universal all-capability readiness oracle.
4. **Canonical paid execution:** `POST /api/v1/intelligence/query` is the payment resource. The official `POST /api/v1/agent` forwards to the canonical handler; agent facade or discovery does **not** create a second payment entitlement, signer or source of intelligence truth. The x402 proof must be bound to the canonical resource.
5. **Successful delivery:** JSON with schema/product version, query plan/state version, exact delivered product hash, original evidence clock, allowed derived fields and explicit non-execution boundary; verified customer bytes, source rights and signed proof where required.
6. **Non-delivery:** preserve fail-closed HTTP 400/415/422/429/503 and canonical 402 semantics. Never auto-pay on 402, never auto-retry a settled charge, honor Retry-After on 429 and distinguish transport faults from genuine data unavailability. No provider/raw source names, source URLs, rights proofs or private keys.
7. **Idempotency:** replay, expired challenge, changed tier/request/country, mismatched USDC asset/network/payee, duplicate concurrency and stale content must not create extra charges. Any conditional not-modified/no-charge path requires *server-verified* current content equality, never caller-provided ETag alone.
8. **Cost safety:** bounded payload, quota and budget; log redacted request/status IDs without secret headers; no unbounded 585-cell polling or forced Class-B / D1 free-tier overrun.

## Evidence-based go/no-go matrix

| Area | Minimum acceptance evidence | Not accepted as substitute |
| --- | --- | --- |
| Website | Browser + SSR 200, dated Find cards, 3 category states, keyboard/mobile, exact deployed SHA | A static HTML build marker alone |
| Data acquisition | Native-dated originals, actual article parsing, true 3-domain observations, source-specific rights, independent fallbacks | HTTP 200 or catalog of 778 leads |
| Signed products | Current Intelligence / GRI v1.2 / Risk Indices; exact B2 hash readback + D1 promotion + signature/rights checks | Old October 8 snapshots, unscored free Finds |
| Runtime | Genuine production `GET /api/health?deep=1` HTTP 200 and separate no-funds source profile acceptance | A candidate Worker 200 for source ingestion only |
| Commercial delivery | Real current proof, exact 8/14 pricing parity, negative-path no-charge/replay tests, D1/B2/ledger and payee verification | Prices listed on a webpage or locally mocked signed response |
| Security & rights | No raw upstream redistribution, reviewed licence eligibility, protected keys and independent provenance; fail closed | Self-authorized reviewer signatures or illustrative sample hashes |
| Partners | Actual external PREDGE/Federico signed/verdict acceptance for their respective pilots | A scheduled kickoff date or only an internal synthetic test |
| Mainnet | Explicit founder real-funds ACK, controlled exact quote, one genuine funded canary, signed delivery plus settlement reconciliation | Automated test, testnet purchase or implicit authorization |

## Operational order (no fund usage until authorized)

1. Keep current public experience honest and usable while current-signed products are unavailable; keep legacy 503 explicit in operator status.
2. Prove original three-domain evidence and source-specific commercial rights; do not weaken qualification to force a paid result.
3. Generate authentic signed current state and verify B2/D1 original clocks, published hash/readback and independent trust.
4. Verify runtime deep-health 200 on the actual deployment, Cloudflare quota budgets, no-charge and double-charge negative paths.
5. Verify exact live SHA, two browser viewport sizes, no-JS SSR, agents/OpenAPI and x402 quote binding.
6. Present remaining external partner and owner mainnet decisions. Do not label commercial LIVE, close #1827, or invoke funds until their independent proofs exist.

Reference: `docs/GEOMACRO_INTELLIGENCE_CONTRACT_V1.md`, `docs/PRODUCTION_LAUNCH_ACCEPTANCE.md`, issue #1827.
