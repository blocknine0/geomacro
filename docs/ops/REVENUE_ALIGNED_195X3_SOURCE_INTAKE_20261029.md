# GeoMacro revenue-aligned continuous source intake (2026-10-29)

## Business need and available production proof

Customers purchase 14 defined USDC capability variants; paid delivery depends on verified original/structural evidence, matching country/corridor scope, product freshness, source rights and the existing immutable payment/signature gates. One RSS success is NOT a paid structured JSON delivery.

Real main-branch private 195×3 source audit from GitHub Actions #40911872139 checked 511 source endpoints and found 123 of 585 country/category cells with any attributed native-dated candidates (462 without), despite some healthy *fallback* source in all 585 cells. One day later/intake rotation can yield different counts; do NOT attribute small fluctuations to a given feed. The same run found all seven supplemental Macro/Minerals private source candidates unavailable (six `UNAVAILABLE`, one `DENIED`); continually polling them without replacement does not create saleable value.

## Implemented no-new-source-slot changes

- Two previously unhealthy supplemental source positions are replaced, ONE FOR ONE, with exact pinned first-party British government Atom issuers. `department-for-transport.atom` targets transport, corridor, port, freight and macro events; `uk-export-finance.atom` is a *research candidate* for official export financing and rare minerals supply-chain/offtake developments. A normal UKEF release does NOT imply mineral evidence. Those are newly proposed official research transports; only actual GitHub-hosted HTTP plus item-native `published`, category topic matching and follow-up evidence makes it an observed candidate.
- The existing 7-position extra source limit, 512 absolute source cap, private-only ingest, no index-based original page time, no commercial source rights, and all existing D1 quota admission are unchanged. Existing EIA and metals quotes are not replaced by these department feeds: EIA independent official macro statistics remain separate; no live metals trade quote is claimed.
- The canonical live private source health job creates a new deterministic **585-cell revenue-source-demand receipt** from actual current source checks. For each country/category, it records exactly which original-publisher or independent corroboration family to seek and what paid capabilities need additional evidence.
- Sourcing priorities: (0) no healthy feed; (1) registered local feed unhealthy; (2) global-only; (3) regional-only; (4) healthy quiet original; (5) observed dated candidate. This prioritizes actual country originals over another global news aggregator. A healthy quiet feed is NOT a missing event to be fabricated.
- The produced private counts-and-ISO3 JSON artifact and its source receipt can be compared across live ticks; no raw headlines/articles or upstream URLs, no secrets or PREDGE I/O. It does not change current invoices, 14 prices or activated settlement.

## Required production acceptance

1. Exact-head regression, Product CI, security checks, unchanged PREDGE, and live 511-endpoint OSINT network run; inspect the new DfT and UKEF states: HTTP denied, `MALFORMED`, `UNAVAILABLE`, `EMPTY_OR_OUTSIDE_WINDOW`, `OBSERVED`. Only the latter two mean transport observed and parseable. A source can be healthy without relevant dated story.
2. Download `geomacro-private-osint-live-coverage-<run_id>` and verify `geomacro-revenue-source-demand-195x3.json` has 195×3 unique genuine measured cells with 0 automatically qualified paid cells and no source-content leak.
3. After merge, independently verify at least one protected-main scheduled intake receipt under actual provider quota and D1/B2 source publication. PR read-only tests do not prove main job delivery.
4. To promote an output as **chargeable**, join actual original notice/article date or official structural observation+period, precise ISO3 and commodity, independent issuer evidence (where applicable), source rights, signed/index proof where required, canonical D1/B2 byte readback, and exact x402 USDC mainnet buyer payment+JSON readback. This PR only improves available private source discovery and priority diagnostics.
5. If a first-party candidate remains denied/unparseable after real live probe, preserve explicit failure rather than marking it active or bypassing origin. Replace again with independently verified original within existing requests in a subsequent reviewed PR.

## Source publication cadence truth

UK department feeds are event-driven. Eurostat datasets publish at 11:00 and 23:00 Brussels local time; World Bank WDI and mineral reserves are periodic, **not realtime news**. The existing official-source fastlane, 15-minute discovery, quota-held replay, D1 72h observatory and B2 SHA chain continue unchanged. Strict always-on publication SLAs require operational D1/B2 capacity and independent durable scheduler, not merely a green GitHub cron.

See canonical [paid variant contract](../../docs/PAID_CAPABILITY_STRUCTURED_DELIVERABLES.md), [source continuity contract](CONTINUOUS_ORIGINAL_SOURCE_PRODUCTION_CONTRACT_20261029.md) and [585-cell gap audit](../../scripts/ops/build-native-country-repair-worklist.mjs).

PREDGE code/credentials/quotas/workflows/contracts and behavior remain untouched.
