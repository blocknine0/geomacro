# GRI Historical Validation Protocol

Version: `gri-historical-validation-v1.0.0`

## Objective

Geomacro should be able to show how the current deterministic GRI methodology responds across historical stress windows without turning retrospective reconstruction into an unsupported prediction-performance claim.

This protocol separates three evidence classes.

### 1. Retrospective replay

Current status of the existing GRI historical replay pipeline.

- Historical rows are replayed at historical timestamps.
- Some current-contract classification/story provenance may have been produced after the historical as-of time.
- Therefore `lookahead_safe=false`.
- Valid use: methodology response, proof-chain testing, continuity checks, sensitivity analysis.
- Invalid use: predictive accuracy, real-time detection lead, trading alpha or causal claims.

### 2. Prospective lookahead-safe validation

Required before predictive-performance language is allowed.

Every input available to the historical calculation must have a provable availability timestamp at or before the historical evaluation time. Classification, clustering and all derived labels must either have existed then or be regenerated from information that was available then using a frozen methodology/model contract.

### 3. Live production performance

Required for current operational latency/reliability claims.

A monitored production environment must preserve at least:

- source/evidence observed time
- ingestion received time
- normalization/classification completion time
- GRI publication time
- Risk Object publication time
- Risk Gate evaluation time
- delivery/webhook time where applicable

Only this class can support production event-to-decision latency, uptime or SLA evidence.

## Predeclared windows

`validation/gri-known-event-windows.v1.json` contains a small initial set of known stress windows selected before running the validation report:

- Russia's full-scale invasion of Ukraine, February 2022
- Silicon Valley Bank failure, March 2023
- October 7 Israel-Hamas war onset, October 2023

The initial directional hypothesis is that the global risk index should increase from the pre-event baseline to the post-event evaluation window. A failed hypothesis is reported as `FAIL`; missing evidence is reported as `INSUFFICIENT_DATA`. Neither state is silently removed.

These are methodology-response checks, not a representative statistical benchmark. More windows, including negative/control periods, are required before any broad validation conclusion.

## Validation CLI

Export structured replay snapshot rows with fields:

- `as_of`
- `raw_score`
- `display_score`
- `coverage`
- `proof_verified`

Then run:

```bash
node scripts/validate-gri-replay-windows.mjs ./snapshots.json
```

The output reports per-window baseline/evaluation points, raw/display deltas, proof status, coverage status, direction match and the permitted claim boundary.

## Anti-cherry-picking rules

1. Event windows and expected direction must be committed before reviewing a new report result.
2. Failing windows remain in the report.
3. Insufficient-data windows remain visible.
4. Control/quiet windows should be added before presenting aggregate validation externally.
5. Methodology/model/version changes create a new validation run/version rather than rewriting old results.
6. Historical replay cannot be marketed as live publication history.

## Commercial use

For diligence, describe the current evidence accurately:

> Geomacro can retrospectively replay its deterministic GRI methodology and mathematically verify score construction and change attribution. The current historical replay is not yet lookahead-safe, so it is used for methodology validation rather than predictive-performance claims.

That statement is stronger than an unsupported backtest claim because it is reproducible and preserves the actual limitation.