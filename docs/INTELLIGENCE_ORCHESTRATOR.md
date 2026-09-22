# Geomacro Intelligence Orchestration Contract

**Status:** permanent production scheduling architecture
**Version:** 1.1

## Purpose

Geomacro uses one scheduled control-plane workflow for live intelligence acquisition and processing. Individual intelligence adapters do not own independent production cron schedules.

The master heartbeat is every 15 minutes at minute 7, 22, 37 and 52 UTC. A persistent scheduler state row decides which task is due at each heartbeat.

## Permanent invariants

1. One production scheduler owns the live intelligence heartbeat.
2. Only one orchestrator run may execute at a time.
3. Due tasks execute serially, in explicit priority order.
4. Every task has its own cadence and optional phase offset.
5. Failed tasks are recorded as `degraded`, retain their last successful state, and become retryable without failing unrelated tasks.
6. Scheduler-state writes fail closed. A source task may degrade; corruption of scheduler state may not be silently ignored.
7. Source cursors and source-native release timestamps remain authoritative. The system never assumes that a GitHub schedule fired exactly on time.
8. Upstream source rights remain separate from scheduler state.
9. Commercial eligibility remains fail-closed and is never inferred from endpoint reachability.
10. Manual payment, launch-acceptance and administrative workflows remain outside the intelligence scheduler.
11. Missing scheduler state is seeded as immediately due on the first heartbeat; the global task cap bounds bootstrap execution so stale production freshness is not deferred to a future aligned slot.

## Task cadence

| Task | Cadence | Role |
|---|---:|---|
| `gdelt_gal` | 15 min | Global first-break observation |
| `gdelt_v2` | 15 min | Governed GDELT event metadata |
| `country_raw_mesh` | 15 min | 195-country raw acquisition mesh |
| `rss_live` | 15 min | Breaking official/curated RSS corroboration |
| `realtime_fanout` | 15 min | Event-triggered corridor/hot-topic escalation |
| `telegram_discovery` | 30 min | Discovery/lead channel |
| `news_ingest` | 2 h | Broader discovery and structured intelligence |
| `gri_publish` | 2 h, opt-in | Deterministic GRI recomputation/publication |
| `source_evidence` | 6 h | Source certification evidence graph |

These are scheduler cadences, not claims about upstream publication frequency.

## Recovery behavior

A missed GitHub heartbeat does not imply a missed source interval. Each adapter must use its own persisted source cursor/release state and deduplicate observations. A task that fails receives a bounded retry schedule and does not reset the source cursor until a successful persistence cycle completes.

## Source mesh

The first-break layer is deliberately multi-source:

- GDELT GAL and GDELT V2
- national government/statistical/monetary-authority surfaces
- route/domain authorities such as maritime, canal, UN, WHO and WTO surfaces
- USGS hazard/mineral data
- UCDP/UNHCR/World Bank/Eurostat and other release-driven datasets where the exact rights and adapter contract are verified
- Telegram and RSS as governed discovery/corroboration lanes

The product does not claim total observation of all events worldwide.

## Commercial boundary

Raw acquisition, source rights, source certification, and customer delivery remain separate state machines. GDELT V2 commercial Risk Gate activation remains disabled even though governed GDELT metadata ingestion is permitted.

## Operational acceptance

A production release is complete only when:

- the orchestrator workflow is present and scheduled;
- all live intelligence workflows are operator-only or delegated to the orchestrator;
- static contract tests pass;
- production database migration for scheduler state is applied;
- the authoritative production Supabase identity is verified;
- the next scheduled orchestration cycle executes with persisted scheduler state;
- no recurring production failure is caused by stale workflow coupling, overlapping cron ownership, or an avoidable artifact/serialization defect.