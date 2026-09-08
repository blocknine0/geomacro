# 19. Normalization and GRI Aggregation

GRI v1.2 uses one deterministic aggregate path after classification and current-contract story assignment.

For eligible observation `i`:

```text
ageHours_i       = (asOf - observed_at_i) / 1 hour
confidenceWeight = confidence_i / 100
decayWeight      = 2 ^ (-ageHours_i / 24)
rawWeight_i      = confidenceWeight × decayWeight
```

The canonical lookback is **72 hours** and the recency half-life is **24 hours**.

After source and story concentration controls, each active domain score is the effective-weighted mean of event severity.

The three current base domain weights are:

```text
geopolitics = 1/3
macro       = 1/3
rare_earth  = 1/3
```

If a domain has no eligible evidence, it is excluded and the remaining active weights are renormalized.

```text
GRI_raw     = Σ(active normalized domain weight × domain score)
GRI_display = round(GRI_raw)
```

The persisted proof keeps the higher-precision raw score. No discretionary manual adjustment or LLM call occurs inside numeric aggregation.