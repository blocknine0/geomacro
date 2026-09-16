# FOMC scoped proof consumer

This adapter consumes the bounded proof-sample artifact produced by the historical replay repository for one explicitly narrow scope:

- country: USA
- event family: monetary policy
- materiality rule: `CB_POLICY_RATE_MOVE_25BP`
- artifact schema: `early-warning-fomc-scoped-proof-samples-v1`

It does not authorize a broad claim about US monetary policy, country risk, equities, crypto, FX, rates, or future market prices.

## Cross-repository contract

The historical repository owns:

1. the completeness-qualified FOMC rate-move slice,
2. deterministic control periods,
3. point-in-time macro features,
4. the scoped CEWS replay,
5. the bounded `ReplaySample[]` artifact.

The main Geomacro repository owns the proof-metric formulas in `src/lib/early-warning-proof-metrics.ts`.

The consumer validates the historical artifact before it reaches those formulas. It verifies the schema version, exact claim scope, artifact and sample hashes, denominator counts, sample scope, and all publication/commercial safety flags.

## Publication boundary

The adapter deliberately invokes the existing publication-readiness gate with the main-repo minimums:

- at least 100 resolved samples,
- at least 30 material events,
- at least 5 countries,
- calibrated methodology,
- complete material-event universe,
- documented control sampling.

The FOMC artifact is a one-country, one-rule research slice and carries `methodology_calibrated=false`. Therefore this adapter must remain non-publishable even when it can compute TP/FP/FN/TN, precision, recall, false-positive rate, and lead-time statistics internally.

The consumer also hard-codes these boundaries in its returned result:

- `scope_publication_allowed=false`
- `public_performance_claims_allowed=false`
- `commercial_signal_activation=false`
- `market_price_prediction=false`

## Merge order

The historical proof bridge that emits `early-warning-fomc-scoped-proof-samples-v1` must be reviewed and merged before this consumer is considered ready for merge. A generated real-data artifact and executable CI validation are still required before any performance result is used externally.
