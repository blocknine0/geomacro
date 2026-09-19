# Telegram Global 194-Country Auto-Coverage

Status: **AUTOMATED ADMISSION + REGISTRY-DRIVEN INTERNAL LEAD INTAKE**

This contract replaces the old founder/operator approval bottleneck for the **internal Telegram lead layer**.

## Core rule

Geomacro does not wait for a human to approve each Telegram source.

A public Telegram source already present in the governed registry may enter the internal lead layer automatically when it passes deterministic admission checks:

- public username and URL are resolvable;
- source is public, not private/invite-only;
- country attribution is mapped to the canonical ISO3 registry when known;
- language and signal domains are recorded when known;
- it is not a known impersonation or explicit unofficial relay;
- the source health check succeeds.

Every automatically admitted item remains **UNVERIFIED**.

Automatic admission is **not** automatic truth, commercial rights clearance, GRI eligibility, Risk Gate eligibility, or customer-facing publisher redistribution.

## 194-country target

The source fabric uses `public.live_country_registry` as the canonical country universe. The worker now reads ACTIVE Telegram channels from `live_telegram_channel_registry` instead of requiring a founder-maintained runtime channel list. The target is the 194 enabled sovereign-country denominator already used by Geomacro's global Risk Gate coverage work.

For every country the system continuously measures:

- active Telegram sources;
- official-source presence;
- local publisher presence;
- regional fallback presence;
- latest message time;
- 5/15/60-minute freshness;
- source failures;
- source diversity;
- current coverage state.

A country with no material event is different from a country with no live coverage.

## Source admission

```
public Telegram source
      ↓
deterministic identity/URL checks
      ↓
country + language + domain resolution
      ↓
health check
      ↓
AUTO-ADMITTED INTERNAL LEAD SOURCE
      ↓
UNVERIFIED event
      ↓
cross-source corroboration
      ↓
CORROBORATING / VERIFIED / REJECTED
```

Known impersonation, explicit unofficial relays and inaccessible/private channels are rejected automatically.

## Per-country source target

Minimum:

1. local news
2. official authority
3. regional news

Preferred additions:

4. publisher
5. independent OSINT
6. sector-specific source

The target is at least 2 active sources per country where Telegram coverage exists, target 4, and 8+ for high-priority countries. The current registry is not yet populated to those targets for all 194 countries.

This is a target, not a claim that Telegram alone can observe every event.

## Global fallback

Telegram is the low-latency lead layer, not the entire global truth layer.

When Telegram coverage is weak or stale, Geomacro automatically falls back to:

- GDELT;
- direct RSS/API;
- official release feeds;
- regional publisher feeds.

The existing Geomacro flash corroboration layer remains the authority boundary for promotion.

## Operational states

### GREEN

At least the target source diversity is live and recent.

### DEGRADED

Telegram sources exist but freshness or diversity is below target. Fallback sources remain active.

### NO_LIVE_TELEGRAM_COVERAGE

No sufficiently fresh Telegram source is available. This must never be represented as "no news".

### NO_MATERIAL_EVENT_DETECTED

The monitored source universe is healthy, but no material event was detected in the measurement window.

## Important boundary

The goal is **194-country real-time detection coverage**, not a false claim of 100% event capture.

The measurable production objective is:

- every enabled country has a monitored source path;
- every source path has health telemetry;
- every lead has provenance and timestamp;
- every lead starts unverified;
- material events are clustered and corroborated;
- gaps fail closed and trigger fallback discovery.


## Implementation boundary

Runtime admission and worker-side registry discovery are implemented by the current branch. The remaining population task is automated public-channel discovery and continuous candidate replacement so the registry reaches the per-country targets. Until that population work is complete, Geomacro must not claim 194-country Telegram source completeness.
