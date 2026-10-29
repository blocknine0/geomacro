# GeoMacro continuous original-source production contract (195 countries / three categories)

**Implementation stage**: 29 Oct 2026. Continuous monitoring/recovery is separate from uninterrupted verified event supply. Source endpoints, independent event proof, country-specific origin evidence and paid customer delivery have four distinct acceptance gates.

## Existing production collectors (unaltered by this PR)

- Five-Minute Original News Fastlane (best-effort scheduled 5m; runtime quota/adaptive-cadence decides actual due polls): original UN News, Federal Reserve and WTO release sources, NRCan/other minerals originals; bounded original article date, fixed pinned HTTPS hosts, deduped derived journal publication.
- Global OSINT 15-minute country-rotating discovery: index leads and locally registered publisher native-dated candidates (not certified originals or 195x3 qualified news).
- 30-minute official original-publisher source pulse, 90-minute broader official mesh, and quota-held encrypted backlog/backstop (respects account-wide D1 headroom).
- Website Derived News Cadence Backstop watches the **actual original publisher job and successful D1 writing step**, attempts a bounded exact-main fastlane dispatch for missed scheduled execution, retaining genuine quota failures.
- Independent 72-hour D1 Quota Observatory checks provider usage, real ingestion, replay and public delivery; first-party yearly/quarterly statistics retain their original edition clocks.

These jobs and cron declarations are not proof of a particular active run or 24/7 freshness. Free GitHub scheduled events may delay/drop; free D1 quotas can halt publication. Never extend data timestamps artificially, or recycle quiet feeds as novel facts.

## New independently observable source SLO

The existing **D1 Launch 72h Quota Observatory (No Funds)** hourly job now GETs the already deployed anonymous canonical `/v1/public/three-domain-continuity` once, with strict HTTPS hostname, limited body, bounded timeout, and **no new cron**. A separate safe `source-continuity.json` is included with the existing hourly artifact, so it can be compared against provider quota/replay receipts. All changes are GeoMacro-only, and do not affect PREDGE.

The new evaluator requires BOTH of these real measured clocks for **every** domain:
1. An actual D1 retained official open-data source-check checkpoint no older than three hours (not a dataset reference year).
2. An independent official-origin 30-minute source pulse currently validated by D1 and no older than 75 minutes.

A `SOURCE_AND_ORIGINAL_PUBLISHER_CURRENT_NO_VERIFIED_NEW_EVENT` status is a **healthy quiet monitoring lane**, not proof there was no global news; `SOURCE_AND_ORIGINAL_PUBLISHER_CURRENT_NEWS_UNSCORED` retains unscored status. If either check is missing/stale or D1 returns 503, mark that category `DEGRADED`. The code never raises an arbitrary signed/current/payable claim; no source content or keys are stored in the receipt.

`--strict` marks source failure as a failed *non-blocking* step with an Actions annotation. It does not stop the independent D1 quota collector, source ingestion or PREDGE. The recurring source-monitor heartbeat is hourly best effort, not a guarantee.

## Actual source coverage desired for human/machine structured answers

| Lane | First-party examples | Schedule semantics | Country & certainty |
|---|---|---|---|
| Geopolitics | UN News, UN press, Security Council sanctions updates, official national statements, EU Council, government sanctions bodies | Detect event as published; publisher feed and native release clock | Global leads are not country-specific original claims; use affected-country evidence and independent originating corroboration |
| Macro/FX | Federal Reserve, ECB, national central banks, IMF / World Bank official series, Eurostat/Statistics Canada, fiscal authorities | RSS/release windows for policy, monthly/quarterly/annual for data; real exchange quotes need an actual price feed | Record currency, units, reference period, exact release time and reported methodology; do not pretend annual WDI is live |
| Critical Minerals | USGS, NRCan, EITI, official mining ministries, geology agencies, IEA mineral datasets, original mine/export announcements | Original announcement as published, structural commodity data at periodic cadence | Explicit commodity/grade, country, lifecycle, processing versus production, original source and publication time |

**Verified source availability** = bounded first-party origin + parse + authentic original item clock + independent canonical state readback. **Verified paid answer** additionally requires relevant ISO3/commodity scope, independent supported facts, reuse eligibility, valid signed GRO where required, D1/B2 evidence receipt and x402 paid delivery success. Green source health alone is not billable.

## Repeatable improvement loop

- Maintain 1,170 immutable 195x3 human/machine question cases with one linked prospective source list and evidence requirements per case.
- Run at most 12 unpaid rotating cases per delivered daily tick (3 on PR), plus a one-GET official World Bank reference probe. Real 422/503/429 outcomes are retained, not relabeled as passes.
- Join actual unavailable country/category/commodity/intent against private source-health and D1/B2 provenance before expanding source adapter coverage. Do not infer all source gaps from HTTP status.
- Activate one new official publisher lane only when its actual deployed Actions transport/parser, native original clock, country/commodity mapping, rights and qualified live readback succeed. Keep index-only lead and annual structural data separately labeled.
- For missed scheduler runs, reuse current bounded dispatch backstop. For upstream denial, respect 401/403/429; quarantine a provider while continuing independent sources. If D1 quota is exhausted, preserve held backlog; no fake quota recovery or invented publication.
- Verify sustained 72-hour provider quota+source freshness+gap receipts, plus exact paid mainnet transaction and immutable structured JSON before commercial continuity claims.

## Remaining P0 realities

- Free-provider quotas and GitHub cron do not provide contractual uptime. To promise a strict publisher polling SLA rather than best effort, one must operate a deployed independent scheduler/queue with measured account limits and a funded infrastructure/observability budget. This repository change adds monitoring to existing checks, not a guaranteed new scheduler.
- One primary source, one publisher pulse or one current D1 status is not enough to claim all 585 country/category cells have fresh qualified news. Quiescent countries require accurate last-known/background context and explicit absence of recent news evidence.
- Real source rights, corroboration, independent signature, public paid eligibility and true x402 settlement remain unchanged gates, **not waived** by the monitoring loop.

Production proof to inspect after merge:
`https://github.com/blocknine0/geomacro/actions/workflows/d1-launch-72h-observatory.yml`
`https://github.com/blocknine0/geomacro/actions/workflows/five-minute-original-news-fastlane.yml`

No PREDGE code, workflow, quota, credential, contract or delivery semantics changed.
