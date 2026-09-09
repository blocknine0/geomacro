# GRI Historical Validation Protocol

Version: `gri-historical-validation-v1.0.0`

## Objective

Geomacro should be able to show how the current deterministic GRI methodology responds across historical stress windows without turning retrospective reconstruction into an unsupported prediction-performance claim.

This protocol separates three evidence classes conceptually, but the current replay-window validator is deliberately restricted to the first class and fails closed if a caller attempts to relabel retrospective evidence as lookahead-safe.

### 1. Retrospective replay

Current status of the existing GRI historical replay pipeline.

- Historical rows are replayed at historical timestamps.
- Some current-contract classification/story provenance may have been produced after the historical as-of time.
- Therefore `lookahead_safe=false`.
- Valid use: methodology response, proof-chain testing, continuity checks and sensitivity analysis.
- Invalid use: predictive accuracy, real-time detection lead, trading alpha, causality, uptime or production SLA claims.

### 2. Prospective lookahead-safe validation

Required before predictive-performance language is allowed.

Every input available to the historical calculation must have a provable availability timestamp at or before the historical evaluation time. Classification, clustering and all derived labels must either have existed then or be regenerated from information that was available then using a frozen methodology/model contract.

A separate validation contract is required for this evidence class. `scripts/validate-gri-replay-windows.mjs` will reject it rather than trusting a caller-supplied label.

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

The initial directional hypothesis is that the Global Risk Index should increase from the pre-event baseline to the post-event evaluation window. A failed hypothesis is reported as `FAIL`; missing or temporally unsuitable evidence is reported as `INSUFFICIENT_DATA`. Neither state is silently removed.

These are methodology-response checks, not a representative statistical benchmark. More windows, including negative/control periods, are required before any broad validation conclusion.

## Snapshot-selection contract

The current replay defaults to a 24-hour cadence. This validation protocol allows a snapshot to be at most 30 hours away from the intended baseline/evaluation timestamp in the required direction. A more distant snapshot is treated as unavailable instead of being silently substituted.

This prevents a sparse replay from using a point days or months away to manufacture a directional result.

The validator also rejects duplicate snapshot timestamps so input ordering cannot decide between conflicting values.

## Proof and coverage contract

Export structured replay snapshot rows with fields:

- `as_of`
- `raw_score`
- `display_score`
- `coverage`
- `proof_verified`
- `proof_version`
- `proof_hash`

Coverage must be present and in `[0, 1]` even when a window's minimum threshold is zero. Missing coverage is `INSUFFICIENT_DATA`, never an implicit pass.

For a window to pass its proof check, both selected snapshots must:

- have `proof_verified=true` from the governed replay-validation path
- match the protocol's expected proof version
- contain a well-formed 64-character proof hash

This report does not independently recompute every snapshot proof bundle. The proof boolean is an upstream validation result, with proof-version/hash checks added here to prevent a bare caller-controlled boolean from being sufficient.

## Validation CLI

Run:

```bash
node scripts/validate-gri-replay-windows.mjs ./snapshots.json
```

The output reports per-window baseline/evaluation points, their distance from the target timestamps, raw/display deltas, proof status, coverage status, direction match, failure/insufficiency reasons and the permitted claim boundary.

Exit codes are deterministic:

- `0`: all configured windows pass
- `1`: at least one window fails or has insufficient data
- `2`: malformed input or protocol/configuration error

A failing directional hypothesis remains a valid report result. The non-zero exit code exists so CI or diligence tooling cannot mistake that report for an all-pass result.

## Anti-cherry-picking rules

1. Event windows and expected direction must be committed before reviewing a new report result.
2. Failing windows remain in the report.
3. Insufficient-data windows remain visible.
4. Control/quiet windows should be added before presenting aggregate validation externally.
5. Methodology/model/version changes create a new validation run/version rather than rewriting old results.
6. Historical replay cannot be marketed as live publication history.
7. A retrospective protocol cannot be relabelled as lookahead-safe by configuration alone.
8. Snapshot selection tolerances are versioned in the protocol and cannot be widened after seeing a result without creating a new protocol version.

## Commercial use

For diligence, describe the current evidence accurately:

> Geomacro can retrospectively replay its deterministic GRI methodology and mathematically verify score construction and change attribution. The current historical replay is not yet lookahead-safe, so it is used for methodology validation rather than predictive-performance claims.

That statement is stronger than an unsupported backtest claim because it is reproducible and preserves the actual limitation.
