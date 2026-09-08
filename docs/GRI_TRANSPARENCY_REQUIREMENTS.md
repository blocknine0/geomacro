# GRI Transparency and Change Attribution

## Current implemented baseline: `gri-v1.2.0`

Geomacro's current public Global Risk Index uses the versioned deterministic `gri-v1.2.0` aggregation contract after current event classification and story assignment.

The current methodology uses:

- severity as the 0–100 risk signal;
- confidence-based evidence weighting;
- exponential recency decay with a 24-hour half-life;
- a 72-hour hard lookback;
- a per-source evidence cap;
- an immutable story-cluster evidence cap;
- equal base weights across geopolitics, macroeconomics and rare earth / critical-mineral risk;
- explicit coverage instead of converting missing domains into zero risk;
- observation time (`created_at` / `observed_at`) as the time Geomacro knew an observation;
- versioned classification and story-correlation provenance.

Crypto is part of the broader Geomacro data/product architecture but is not a current GRI v1.2 scoring domain.

The exact current formula is documented in `docs/GRI_METHODOLOGY.md`. GRI remains an intensity index over qualifying stored risk observations, not a census of every world event and not a prediction-market probability.

## Audit records

The persisted GRI audit architecture stores immutable/versioned snapshot and contribution proof material.

A published snapshot can record:

- methodology version and methodology hash;
- proof version and proof hash;
- input/data/evidence/calculation hashes;
- raw and display score;
- coverage and confidence metadata;
- active categories and category breakdown;
- event/source/story counts as applicable;
- previous comparable snapshot;
- exact score change;
- change-attribution payload and hash;
- reconciliation residuals.

Contribution records preserve the observation/source reference, severity, confidence, timestamps, source/story concentration weights, normalized shares, exact contribution points and relevant model/story provenance.

Current event classification and story-correlation provenance should be explicit enough to identify provider/model, contract version, prompt version, scoring time and input hash.

Historical records whose original model metadata cannot be reconstructed must be labelled honestly rather than retroactively inventing provenance.

## Change Attribution Engine

A score movement such as `83 -> 63` is decomposed mathematically:

```text
GRI_change = Σ(current contribution points - previous contribution points)
```

The engine can distinguish observation-level changes such as:

- added
- removed
- rescored
- reweighted

Reweighting includes changes created by recency, source concentration, story concentration or active-domain normalization even when severity itself is unchanged.

Category-level contribution deltas and observation-level deltas should reconcile to the published score movement within the explicitly versioned numeric tolerance.

This separates two questions:

1. **Why did an observation receive a particular severity/confidence?** Inspect the source and classification provenance.
2. **How did qualifying observations produce the GRI, and why did it move?** Inspect the deterministic snapshot, effective weights and contribution/change ledger.

## Publication workflow

The current canonical commands are:

```bash
bun run gri:compute
bun run gri:verify
bun run gri:validate
```

These route to the current v1.2 stack. Explicit v1.1 commands remain for compatibility/audit work and are not the canonical current publication path.

Live GRI publication remains separated from news ingestion. The dedicated GRI publication workflow is the canonical live publisher, preventing ingestion retries from creating an uncontrolled competing publication path.

The current public read model also has a maximum acceptable snapshot age. A stale or missing published snapshot should be surfaced as a freshness/availability problem rather than silently presented as current verified risk.

## Public proof requirements

A professional or institutional user should be able to trace a published GRI through the following chain:

```text
published score
    -> category breakdown
    -> contribution/change ledger
    -> effective source/story weights
    -> accepted observations
    -> source + classification/story provenance
    -> methodology/proof versions and hashes
```

The UI does not need to display every field at once. Compact surfaces may show the score and change first, with deeper proof available on demand.

## Historical replay boundary

Retrospective replay is useful for calibration and audit, but historical results must preserve their lookahead-safety status.

If later classification or story-assignment contracts are applied retrospectively to historical observations, those replays are **not** genuine historical live or out-of-sample records. They must remain clearly labelled as retrospective calibration/audit runs.

## Empirical validation boundary

Validation is separate from calculation and never changes GRI values.

External benchmark testing may evaluate relationships against risk-sensitive variables such as volatility, rates, commodities, equities or currencies. Any predictive or institutional-grade performance claim must be supported by adequate sample size, clearly defined methodology and honest out-of-sample boundaries.

Correlation must not be represented as causality or guaranteed predictive performance.

## Commercial and institutional transparency gates

Before calling GRI institutionally validated or production-proven in external materials, Geomacro should have evidence for:

- consistent live publication and freshness monitoring;
- consecutive snapshot/proof reconciliation;
- source/provenance completeness for current published observations;
- explicit commercial-use rights for customer-delivered evidence and derived outputs;
- sensitivity/calibration analysis for the current methodology;
- independently reviewed security and operational controls where appropriate;
- honest validation metrics with adequate sample gates;
- stable customer-facing methodology and change-notice policy.

Current engineering proof should not be overstated as independent third-party methodology validation or customer adoption.

## Versioning rule

Do not silently change any rule capable of altering the score for identical validated inputs. A new methodology version is required for changes to:

- active domains or base weights;
- eligibility/lookback;
- recency half-life;
- confidence weighting;
- source cap;
- story cap/correlation dependency;
- observation-time semantics;
- missing-domain treatment;
- normalization;
- contribution/change-attribution semantics;
- rounding/display rules.

Matching code, tests and documentation should move together with a methodology change.
