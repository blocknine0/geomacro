# Geomacro three-domain delivery and whole-source census v1

**Canonical contract:** `geomacro.three-domain-delivery.v1`

## Human surface: website + Ask Geomacro

- **Geopolitics:** verified country and corridor scope, dated event, what changed, effects, direction/confidence only when qualified, why it matters, what to watch. A sourced transport signal or stale GRI can never manufacture an incident or live signed score.
- **Macro / FX:** per-country official CPI/GDP reference **observation period**, central-bank release or FX **reference quote** with distinct reference date, units/currency pair and non-spot limitation. Annual statistics are history, not real-time headlines.
- **Critical Minerals:** commodity/mineral scope, verified production/import/export policy development, supply-chain stage and affected countries/corridors where evidenced. A monthly copper table, mineral directory or undated press page is not a mine disruption.
- Site Finds remains a 15-minute-delayed, bounded derivative observation, not raw article redistribution. One development may matter in multiple categories but its event identity must be deduplicated.

## Machine and authorized-partner surface

Use the exact existing canonical engine, not three independent implementations:
`POST /api/v1/intelligence/query`, the existing category-specific POST routes and official agent endpoints. Responses are **derived structured JSON** under existing signed, rights, quote, and exact proof controls.

Machine discovery is public, free and non-payable:
- `GET /api/v1/intelligence/query?view=delivery-contract` (canonical route).
- `GET /api/intelligence/capabilities?view=domains` (same pure contract).
- `GET /api/intelligence/capabilities?view=outputs` (exact eight capability, fourteen variant deliverable fields).
- `GET /api/v1/pricing` (founder-locked, actual current USDC schedule).
- `GET /api/v1/intelligence/query?view=source-status` (actual bounded observable source pulse, *not* qualification).
- `GET /api/v1/intelligence/query?view=structural-72h` (recent bounded private D1-derived research feed, not scored or commercially approved).

The discovery contract is metadata only. No x402 payment or source request is made. No source name/URL, upstream article, raw statistic or secret is copied into paid responses.

## Single evidence pipeline for all sources

Each source reference passes the same distinct steps:

1. **Registered** in a source crosswalk, canonical country registry or national authority inventory. This creates no data claim.
2. **Transport readable** by approved access. A 200, subscription or responsive homepage cannot prove a new event.
3. **Original evidence qualified:** country/corridor and topic, source-native time/period, correction/retraction and identity, and actual bytes when required by the commercial contract.
4. **Event-qualified:** duplicate report identities resolve to one event, independent corroboration if that product requires it, no stale/future time.
5. **Rights-qualified for intended delivery:** internal research, public display, Predge's research trial and paid API are separate permissions. Source approval does not automatically grant all uses.
6. **Signed current product:** only canonical publisher/signer, nonexpired risk score/GRO and exact D1/B2 readback. Delivery and charging require a further payment/entitlement proof.

Do not use a provider's reference series to satisfy a *current event* requirement, or a 403 workaround to satisfy an *authorized transport* requirement.

## Mandatory source-type distinctions

| Source type | Can supply | Must never imply |
| --- | --- | --- |
| Earthquake/hazard API | Native hazard event fields/country leads | Independent geopolitical risk score |
| Sanctions/regulatory original | Dated policy and affected party changes | Sanctions applicability for unverified country/subject |
| Conflict/newspaper discovery | Candidate original event links | Genuine first-party confirmation |
| Central-bank FX reference | Dated official fixing and quote convention | Tick-rate spot exchange quote |
| World Bank/IMF annual series | Observation year, indicator and unit | Today's macro event |
| PortWatch/other transport statistics | Dated vessel/reference count | A new maritime attack |
| MARAD/UKMTO emails | Authenticated advisory lead after approved subscription | Per-event commercial resale rights |
| National mineral statistical release | Commodity, source period and production reference | A new closure, export ban or delivery shortfall |
| National ministry/geological survey directory | Exact original-release discovery | Verified current 195-country mineral coverage |

## All-source census

`node scripts/ops/audit-all-source-product-contract.mjs`

Reads **every record** in the country global/national crosswalk, 20 corridor source providers, 58 named-route references, 11 registered national mineral authorities, operator's shared lineup, and all configured 30-minute/day source readers. The script fails closed on unrecognized category tags, orphaned active readers, duplicate configured reader IDs, or a missing PSE/VAT 195-country canonical registry. It reports only registry counts and category records: no secrets, source URLs or commercial proof claims.

Runs inside the **existing** daily GDACS/PortWatch official-source workflow; no new cron, network requests, Supabase/B2 writes or x402 costs. App CI separately tests three-category deliverable shapes and source evidence fail-closed transitions.

The report does NOT say any of 195x3 runtime cells or 58 corridors are up-to-date. Existing verified WDI CPI/GDP **annual** country counts and six PortWatch **daily** corridor source observations are only those explicitly accepted in their own source jobs.

## Distribution and owner safeguards

- Preserve the final eight founder-approved capability prices and fourteen variants. No tiers, price rises, double signed-GRO charge or unapproved settlement.
- Predge's documented protected research delivery is a *different* permission from commercial signed event delivery. Its client-side readback and authorized mailbox evidence must be verified separately.
- Respect website publishing lock; this PR creates public API discovery and documentation, **not** a disguised website republish. Website/Ask backend deployment parity and exact SHA need their own acceptance.
- Keep Supabase frozen. No extra Cloudflare cron, key account, paid source, or synthetic x402 income.
- Keep the existing current signed Intelligence, GRI and Risk Indices recovery / deep-health 503 issue open until actual live proof is checked. Never change health response from 503 to 200 solely because discovery metadata is correct.

## Release acceptance

1. `src/__tests__/three-domain-final-delivery-contract.test.ts` passes.
2. `scripts/ops/audit-all-source-product-contract.mjs` passes on checked-out latest `main` (zero external requests).
3. App build / CodeQL and source-CI pass.
4. After merge, compare exact source commit and live API GET discovery; source health and commercial readiness must be independently verified rather than inferred from merge success.
