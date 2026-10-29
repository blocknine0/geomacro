# 195 countries × 3 domains × human/machine query-regression loop

Status: engineering candidate branch, **not** production acceptance or an auto-approved source. Effective country denominator: 193 UN members plus Holy See and State of Palestine. Do not substitute the separate 250-area risk registry.

## Round-1 deliverables

- `scripts/ops/audit-195x3-human-machine-source-gaps.mjs` generates exactly **1,170 synthetic question scenarios** (195 × geopolitics/macro/minerals × human/machine), **585 country/category cells**, and receipts. The scenarios are questions and evidence requirements, **not generated answers** or evidence.
- `config/answer-source-candidates-195x3.v1.json` inventories official and institutional new/confirmed *research candidate lanes*: UN Security Council, OFAC, World Bank Indicators v2, UN Comtrade trade releases/preview, USGS MCS 2026, IEA critical-minerals data and the GDELT discovery index. Every lane is **NON_ACTIVE_RESEARCH_REGISTRY**, requires endpoint/schema/original-clock/rights review before any canonical publisher insertion, and cannot be counted as live event coverage. Some overlap existing sources; this is a gap-routing registry, not eight newly activated feeds.
- `.github/workflows/global-195x3-human-machine-source-regression.yml` generates/validates the offline matrix on PR and runs **12 unattended, no-funds production preflight queries per daily tick** once merged, rotating their IDs so the full suite is sampled over ~98 delivered daily runs. GitHub scheduled delivery is best effort; no 98-day guarantee.
- Separate `question-manifest.json`, `country-category-gaps.json`, `live-no-funds-results.json`, `summary.json` receipts under `$RUNNER_TEMP/geomacro-195x3-query-regression`. Action artifact retention: seven days. For longer-term proof, operator-reviewed evidence may later be written through existing governed B2 evidence storage, subject to quota; this PR does **not** write B2/D1.
- The previous frozen 100-original-question audit remains unchanged and is a separate regression corpus. PREDGE code/contracts/quotas/credentials remain unchanged.

## Question classes

| Category | Scenario classes | Evidence demand |
| --- | --- | --- |
| Geopolitics | sanctions/export restrictions, armed conflict, elections/governance, tariffs/trade policy | native-dated official event and affected-country mapping; independent same-event evidence, licensing and signed GRO for signed claims |
| Macro / FX | inflation/interest rates, reserves/FX, debt/fiscal, bank liquidity | indicator units, reporting period and revision; national central bank/statistics context; current-market claims need current original event evidence |
| Critical Minerals | lithium, copper, rare-earth refinery, graphite supply/export | named mineral, lifecycle stage, geographic production/trade role, original report period and genuine recent developments separately |
| Actor/language | one human and one typed ISO3 machine input per category/country; sampled Bengali/Hindi human variants | preserve explicit scope, language, uncertainty and client-visible no-charge response |

Never infer that an absence of headlines means a country is safe, that a GDELT mention is a primary article, that USGS annual mining statistics are fresh mine incidents, or that a trade reporter code equals ISO3.

## Source-gaps → activation cycle

1. **Generate** 1,170 immutable planned requests and tag each with category/topic, ISO3 and expected evidence fields. Deduplicate requests and keep the SHA-256 manifest.
2. **Probe** daily bounded no-funds requests. Classify 402 as quote-ready only, 400 as schema/routing, 422 as missing evidence or unsupported scope *only if the returned code supports it*, 503 as upstream/quota/dependency, 429 as rate ceiling, and 200 without a payment signature as a security failure. No API 200 is treated as a paid-delivery test.
3. **Join** each failing country/topic with the actual **private** D1 provenance inventory, country-local publisher coverage, source-native publication timestamp/availability and B2 canonical receipt. The current script deliberately reports `NOT_MEASURED` until that privileged joined evidence exists; it does not infer missing sources from HTTP code alone.
4. **Prioritize** eligible true gaps by consumer demand, freshness, expected evidence field, primary issuer coverage, transport denial vs quiet vs parser failure, and cost/quota. Batch by publisher/agency, not 195 country network calls.
5. **Onboard** actual source adapters one by one: pin HTTPS publisher/host/path; follow robots, permitted access, licence, bounded response size, retry-after and conditional caching; validate publication date or exact data period and ISO3 mapping; distinguish source candidate, accepted metadata and independent original verified fact. Pre-existing first-party adapters are preferred over duplicate crawlers.
6. **Re-evaluate** the identical question IDs after actual D1/B2 readback, with immutable versioned source/evidence receipts and verified signed output. Activate payable responses only through the existing canonical x402 guard when every required proof is present. Fail closed on missing evidence; generate a transparent partial/unsupported response with no charge when necessary.

## Run commands

```bash
node scripts/tests/verify-195x3-human-machine-source-gaps.mjs
node scripts/ops/audit-195x3-human-machine-source-gaps.mjs
node scripts/ops/audit-195x3-human-machine-source-gaps.mjs --live --limit=12
```

`--live` is opt-in when invoked locally, with minimum 4-second spacing, maximum 30 requests/run, a pinned geomacro.live origin, 12-second request deadline, no secret or payment header and bounded sanitized response receipt. An unpaid 402 is not revenue or a fulfilled customer answer. A structurally complete 585-cell matrix is not 585 current verified cells.

## Release checkpoints

- PR checks: deterministic matrix test, source-registry non-activation check, GitHub workflow inventory safety. Review live consumer compatibility errors before attributing them to evidence.
- After merge: verify first scheduled/manual workflow receipt and exact deployed website revision. Subsequent runs must show actual production statuses and growth in 402 eligible preflights/verified original-signed deliveries without increasing quota failures.
- Real x402 mainnet paid JSON fulfillment, chain settlement, B2/D1 proof, 72-hour quota sustainability and real original-source rights are **separate** required acceptance gates. This suite cannot certify them.
