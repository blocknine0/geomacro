# Geomacro Early Warning Calibration

Status: PRELAUNCH RESEARCH / CALIBRATION ONLY

This layer measures country-level escalation features from Geomacro's governed GDELT 2.0 Event ingestion. It does not publish a CEWS score, public alert, market direction, buy/sell instruction or commercial signal.

## Why this exists

The provisional CEWS methodology must not be treated as calibrated merely because its arithmetic is deterministic. Before Geomacro can make performance claims, the weights and thresholds need evidence from historical replay and live observation.

The GDELT calibration layer creates reproducible feature vectors that can later be compared with independently verified outcomes.

## Input boundary

The live validator reads only rows that are already:

- `source_id = gdelt_v2_events`;
- `quality_status = VERIFIED`;
- `commercial_eligibility_status = VERIFIED`;
- inside the two-hour analysis window.

The source registry must also remain:

- `commercial_usage_status = COMMERCIAL_OK`;
- `enabled_for_ingestion = true`;
- `enabled_for_commercial_signals = false`.

If commercial-signal activation is unexpectedly enabled, the validator fails rather than silently changing product behavior.

## Feature windows

For each country with eligible observations, `gdelt-country-escalation-features-v1` computes:

### Current 15 minutes

- event count;
- mean and minimum Goldstein scale;
- negative event count;
- severe-negative event count (`Goldstein <= -5`);
- negative-intensity sum;
- mean GDELT tone;
- mention, source and article totals;
- distinct source-record count.

### Current 60 minutes

The same features are aggregated over the latest hour.

### Prior 60 minutes

The same features are aggregated over the previous hour, creating a non-overlapping baseline.

## Delta features

The v1 research feature vector includes:

- current-hour event count minus prior-hour event count;
- current/prior event-count ratio when a denominator exists;
- current-hour negative intensity minus prior-hour negative intensity;
- current/prior negative-intensity ratio when a denominator exists;
- source-count delta;
- article-count delta;
- freshness in seconds.

When the prior period is zero and the current period is non-zero, the ratio is deliberately `null` instead of infinite. Downstream calibration must handle that case explicitly.

## Goldstein boundary

GDELT Goldstein scale is used here only as an event-metadata feature. A more negative value can represent a more conflictual event classification, but Geomacro does not interpret the raw number as a probability, market return or standalone severity truth.

## Research-only invariant

Every output currently carries:

```text
research_only = true
commercial_signal_activation = false
public_alert_activation = false
```

The feature object deliberately has no `cews_score` and no public `status` field.

## Live validation

`scripts/early-warning/validate-gdelt-country-escalation-live.mjs` performs a read-only check against the authoritative Supabase data already written by the governed GDELT ingestion workflow.

The validator:

- reads the source registry;
- reads verified GDELT observations from the last two hours;
- checks freshness;
- builds country feature vectors;
- emits only bounded aggregate evidence;
- performs no insert, upsert, update or delete;
- performs no Early Warning ledger write;
- performs no public distribution.

The dedicated GitHub Actions gate statically checks that the validator contains no database mutation method and then runs the live read-only validation.

## What this does not prove

A successful calibration check does not prove predictive value.

It proves only that:

- the governed live data is available and fresh enough for replay;
- the feature extraction is deterministic;
- current/prior windows are reproducible;
- the research path cannot silently activate a customer-facing signal.

## Next evidence stages

1. collect/replay a sufficiently large historical sample;
2. define independently verifiable material-event outcomes;
3. measure feature distributions before outcomes and in control periods;
4. quantify false positives and missed events;
5. calibrate or reject candidate CEWS weights/thresholds;
6. freeze a versioned calibrated methodology only after the evidence supports it;
7. keep structural-risk intelligence distinct from unsupported asset-price prediction claims.
