# GEOMACRO — earned-first, derived structured JSON only, zero subscriptions
Updated 2026-10-20. Canonical repository: blocknine0/geomacro.

This document is an operational checklist, NOT evidence that the merchant can collect live USDC. The owner explicitly requires **no paid cloud subscription, no paid data API, no founder-funded canary and no 24/7 laptop**. Existing free quotas are hard caps. No fresh approval, licence, independent signature or mainnet payment is presumed.

## Exactly one pricing authority, no new tiers

Source of truth: `src/lib/capability-pricing-catalog.ts`, `geomacro.capability-usdc.v1`. The accompanying 14 **structured data** field specifications live in `src/lib/capability-structured-output-contract.ts`, exposed from `GET /api/v1/pricing` and `GET /api/intelligence/capabilities?view=outputs`. Every actual prepared 402 offer must derive its capability/variant and exact USDC atomic units from this catalog, NEVER from the old `.env` flat 0.05 setting.

| Capability and variant | Exact USDC | Derived machine data offered ONLY when genuine eligible inputs exist |
| --- | ---: | --- |
| gri_read / verified_cached | 0.005 | Current signed numerical index, real as-of, coverage, methodology, state/proof hash |
| gri_read / verified_change_attribution | 0.01 | Current and previous separately verified index scores + attributable change |
| structural_country_digest / standard | 0.02 | One country / one required verified structural module, observed period, derived facts and limitations; UNSCORED |
| structural_corridor_digest / standard | 0.05 | Directional corridor relationships only with qualified original/composition proof |
| structural_country_profile / standard | 0.03 | One country's multidimensional structural context/coverage; never mint a risk score |
| structural_corridor_profile / standard | 0.08 | Directional corridor's qualified dimensions, method and genuinely available context |
| intelligence_query / focused | 0.05 | Focused derived question-answer, freshness/state ID and limitations |
| intelligence_query / standard | 0.10 | Up to three supported topics / bounded eligible synthesis |
| intelligence_query / complex_multi_source | 0.15 | Qualified multi-topic/multi-subject derived synthesis, no invented cross-domain effects |
| signed_risk_object / existing_valid_signed | 0.05 | Existing genuinely unexpired verifiable signed GRO, no raw evidence |
| signed_risk_object / newly_qualified_signed | 0.10 | Newly created genuine, rights-approved signed GRO with exact readback |
| risk_gate_bundle / existing_proof_preflight | 0.10 | Policy preflight tied to valid signed proof; **GRO included** |
| risk_gate_bundle / standard | 0.15 | Signed GRO + verified governed policy reasoning, no transaction execution, **GRO included** |
| risk_gate_bundle / complex_multi_source | 0.25 | Multi-source verified policy decision and signed GRO, **GRO included** |

No customer receives an upstream article, verbatim headline, raw HTML, RSS/XML, publisher URL, original source blob, feed JSON, private source identifier, B2/Supabase/D1 dump, secret credential, unverified score, or a synthetic certainty claim. Customer sees Geomacro-authored **derived structured facts**, as-of/methodology, SHA/verified state and scope. Source-specific credit must be honoured when legally necessary; a source requiring attribution cannot silently be offered under an incompatible no-attribution commercial profile. A source being public or official does not by itself grant commercial reuse rights.

All 14 variants are published **specifications**, not proof that each can be charged. The pricing manifest is a free, nonpayable discovery service. The canonical paid resource is **POST /api/v1/intelligence/query**. Existing category and official agent routes route into that same engine; never duplicate price/ledger implementations.

## Four stages, progressively unlock real revenue

### Stage A — Laptop OFF by default: operate free ingestion and product discovery

- GitHub Actions `Auto Ingest News`, `Three-Domain 30-Minute Original Publisher Pulse`, website derived-news continuity, no-funds earning diagnostics and signed-ready backstop use GitHub-hosted schedules, NOT the owner's laptop. Cron is best-effort; backoff prevents quota spikes.
- Cloudflare free Workers/D1 and the existing authenticated commerce ledger + bounded B2 governor serve request-time derived JSON and minimal immutable **receipts**, not a 195-country raw warehouse.
- Never poll 195 x 3 cells at full rate, do not add paid LLM/search providers or new Supabase accounts. Use country/topic on-demand source retrieval, changed-page detection, short bounded cache, deduplication, no-funds admission and provider 429 backoff. Free quotas are finite and may cause honest 429/503 rather than a charge.
- The six-hourly First Earnings no-funds heartbeat tests **3 fixed country/category requests per run**, alternating USA/USA/USA against UKR/BRA/AUS at no added schedule/calls. A diagnostic is *never* an eligible offer or buyer receipt.
- The legacy **signed** site `GET /api/health?deep=1` may remain 503 until genuinely current independently signed Intelligence/GRI/Risk Indices are published. A different structural-baseline request may become legitimately eligible separately. Do not report signed health 200 based on that request.

### Stage B — Find the first TRUE eligible derived structural output, with no payment

1. Publish actual latest canonical website SHA from Lovable and compare `/.well-known/geomacro-build.json` + rendering, not just GitHub source sync.
2. Read `GET /api/v1/pricing`, `GET /api/v1/intelligence/availability` and `GET /api/v1/agent?view=openapi` from **deployed** origin. They MUST be discovery only, no x402 settlement.
3. `POST /api/v1/intelligence/availability` with a real country/topic, `delivery_tier:structural_baseline`, one `country_iso3`, one `topic`. Module must have actual source-native observation time, supported dimension, accurate unit/period, allowable derived commercial use, and no blocking stale/missing modules. A green GET/catalog alone does not suffice.
4. Start with `structural_country_digest` **0.02 USDC** because this is the *already existing separate unscored baseline path*, independent of currently unavailable signed GRI/Risk Indices. Never change its price. Test `macro_risk` (governed macro monetary), `fx_external_risk` (external FX) and `critical_minerals` (qualifying mineral baseline) per real country, subject to actual rights/coverage. Do not advertise unsupported country or current score.
5. Verify negative preflights: no data, stale data, ineligible source, wrong country/module and bad request MUST return no charge, no 402. Positive preflight can at most say `ELIGIBLE_BUT_PAYMENT_RAIL_LOCKED` while x402 has not been enabled.
6. The payer must see **exact structured JSON fields**, verified current state/period, method and limited license. Independent test must confirm NO raw original or customer-facing upstream link, and no true flags for raw delivery. `src/lib/public-paid-output-boundary.ts` rejects new nested raw HTML, article bodies, original XML/bytes/upstream datasets before offer freezing. Price-variant shape/rights/required modules remain independently enforced.

### Stage C — Owner-controlled merchant setup (NO subscription, NO funds now)

Owner must separately complete these real-world steps; a commit cannot supply a wallet or legally bind a licence:

- Supply **only to the existing protected production environment**, not a PR/chat: a self-custodied EVM **public payTo address** controlled by Geomacro. Keep recovery phrase and private key offline. Confirm chain=Base and exact native USDC contract.
- Review Coinbase CDP x402 merchant/facilitator setup, eligibility, transaction fees, supported mainnet, provider account/API credential requirements and real ability to receive USDC. No credit card or paid plan is assumed: if service insists on a paid subscription, leave rail LOCKED. Free provider quotas/conditions may change.
- Existing `CLOUDFLARE_API_TOKEN`, D1 database ID, quota ledger and authenticated Durable Object commerce ledger must have exact production readback with no Supabase. Never put wallet seed, customer payment proof, API secret or original evidence in website or client.
- Run no-funds negative tests of price, asset, chain, payTo, expiry, changed request/body, bytes hash, payout, replay, concurrency, revoked rights and ambiguous settlement; two independent Durable Object ledger readbacks. **`GET /api/v1/payments/networks` and price preview do NOT prove merchant readiness.**
- Exact original site build SHA, uncharged preflight, canonical 402 **rehearsal without payer signature**, prepared response-byte SHA and final-quote binding must pass for at least one actual genuinely eligible output.
- DO NOT set `GEOMACRO_COMMERCIAL_LAUNCH_ACK` or `COINBASE_X402_MAINNET_ACK` from this document or a generic “launch it” request. A distinct founder explicit real-USDC approval is needed after receipt-level acceptance. No owner-funded test is assumed.

### Stage D — First external buyer, measured earnings

Buyer picks an eligible capability; API independently revalidates real rights/freshness, freezes exact derived JSON and its hash, issues correct x402 402, verifies buyer payment signature/finality, writes once-only durable settlement and delivers identical frozen bytes. If anything fails **before settlement**, return no-charge and preserve a safe error. If settlement is ambiguous, freeze/reconcile; do not automatically charge again. Seller should verify one real independent customer paid and a matching ledger/USDC receipt **before** marking commercial revenue real. Keep a kill switch and small per-day usage cap in free tier.

Signed/current `gri_read`, `signed_risk_object` and `risk_gate_bundle` variants stay unavailable until the separate offline Facts/Rights/reviewer/country-certificates machine proofs, historical B2 lineage, protected current B2/D1 publisher and current Risk Indices recovery complete. No fake date, score or “195 countries all real time” guarantee.

## Operator's short checklist, ordered by real dependencies

1. **One-time:** actually publish latest locked site SHA in Lovable. Validate live route and merchant discovery separately.
2. **One-time:** choose an existing no-subscription x402 facilitator compatible with current Base integration; prepare a *receiving* public wallet address. Don't post secrets or approve real funds yet.
3. **Zero funds:** trigger existing `First Earnings Zero-Funds Live Acceptance` against exact live SHA and inspect positive/negative source eligibility for **an actual pilot country**. Read-only six-hourly schedule is a diagnostic only.
4. **Zero funds:** production Durable Object/D1, structured-only response and x402 quote binding acceptance, followed by accurate website build parity.
5. **External:** invite a real buyer/agent with the only truly deliverable, qualified price variant; don't pitch unsupported signed products.
6. **Later, explicit:** separately authorize real-USDC mainnet activation only when receipts demonstrate all required proofs, then obtain the **first external paid call** and reconcile actual transfer and exact response bytes.
7. **Scale only from receipts:** B2/D1/Workers rate caps and operational headroom govern throughput; no paid service until there is revenue and founder consent.

GitHub issue #2046 and main #1827 stay OPEN for legacy signed product HTTP 503. The first paid **unscored structural baseline** offer never claims to close those issues. Current status remains CONTROLLED PRELAUNCH until genuine external settlement receipts are observed.

Canonical references: `docs/earning-first-structural-pilot.md`, `docs/PAID_CAPABILITY_STRUCTURED_DELIVERABLES.md`, `docs/PAY_PER_CALL_PRODUCTION_ACTIVATION.md`, `docs/ops/P0_FOUR_SIGNED_PRODUCTION_RECOVERY_20261020.md`.

## October 23 first-sale commercial audit: candidate discovered, but NO earnings yet

Production no-funds buyer diagnostic [run 39901490029](https://github.com/blocknine0/geomacro/actions/runs/39901490029) actually found **USA Critical Minerals** `structural_baseline` data eligible, while its payment rail was **LOCKED**, and the deployed site SHA did not match canonical main. Two other USA pilot probes had no payable evidence. This is only a previous observation, not a fresh price quote or guarantee of present availability.

To remove *guesswork* for the first buyer, the existing `First Earnings Zero-Funds Live Acceptance` now reads one extra public `GET /api/v1/pricing`, validates the founder-locked `structural_country_digest / standard` **0.02 USDC = 20000 atomic units**, derivative structured output contract, and confirms the public catalog itself issues **no payment**. A positive country baseline is distinct from scored GRI and hot signed risk indices. The report uses `first_sale_catalog_only`; it does **not** claim a positive 402 quote, wallet receipt or settlement. The same no-funds three-category buyer check also runs after every genuine `Production Website Health` conclusion, even when full signed health is 503, with `--diagnostic-only` expressly preventing launch/earning claims.

**First-real-earning checklist**: canonical main must be *actually published* in Lovable; re-check USA Critical Minerals current structural preflight, source-native observation time, certified source-specific paid derived-use rights and actual single-country module; ensure founder-priced exact 0.02 USDC product will be prepared before any 402; verify Base recipient/facilitator + existing production ledger + payment replay protections with zero USDC; obtain owner's separate explicit real-money authorization; then only a real external buyer or owner-approved canary may pay once. Verify accepted real 402, signed derived payload delivery and reconciled settlement before reporting even $0.02 earned. Keep pre-existing full signed Intelligence/GRI/Risk Indices HTTP 503 RED until independently approved 3/3 exists; structural baseline admission must never falsify it.
