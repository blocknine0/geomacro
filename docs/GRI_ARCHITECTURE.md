# Global Risk Index architecture and proof system

**Current public methodology:** `gri-v1.2.0`  
**Current proof envelope:** `gri-proof-v1.2.0`  
**Current classifier contract:** `event-severity-v1.0.5`  
**Current story-correlation contract:** `story-correlation-v1.0.0`

This document is the repository specification behind the public GRI architecture surfaces. Historical v1.0/v1.1 implementations remain in the repository only for audit reproducibility and compatibility; they are not the current public calculation contract.

## 1. Separation of concerns

GRI deliberately separates:

1. **Observed evidence** — source identity, source URL/title, publisher time and Geomacro observation time.
2. **Model interpretation** — category, severity and confidence, together with provider/model/classifier/prompt/input-hash provenance.
3. **Story correlation** — immutable assignment of qualifying observations to one underlying development so cross-publisher repetition does not multiply one story into multiple independent evidence budgets.
4. **Deterministic aggregation** — confidence/recency weighting, source cap, story cap, category score, normalized category share and exact contribution points.
5. **Persisted proof** — immutable snapshot/contribution records, hashes and change attribution used to reproduce and verify the published score.

A source proves that an observation exists. Classification/story provenance records how the observation was interpreted and grouped. The deterministic contribution ledger proves how those inputs became the published index.

## 2. Current GRI v1.2 domain contract

The current scoring domains are exactly:

- geopolitics
- macroeconomics
- rare earth / critical-mineral risk

Each domain has equal base weight `1/3`.

Crypto remains part of Geomacro's broader data/product architecture but is **not** a current GRI v1.2 scoring domain.

Missing domains are excluded rather than assigned zero. Active domain weights are renormalized and coverage is disclosed separately.

## 3. Observation eligibility and evidence weight

Eligible observations must satisfy the current category, severity, confidence, time-window, classification-provenance and story-provenance contracts.

For event `i`:

```text
ageHours_i       = (asOf - observedAt_i) / 1 hour
confidenceWeight = confidence_i / 100
decayWeight      = 2 ^ (-ageHours_i / 24)
rawWeight_i      = confidenceWeight * decayWeight
```

The canonical lookback is 72 hours. The 24-hour value is an exponential half-life, not a hard cutoff.

`created_at` / `observed_at` is the observation-time contract for what Geomacro knew. `published_at` remains source provenance and cannot backdate a snapshot.

## 4. Source concentration control

Within each category, a stable source receives at most `1.0` total evidence weight:

```text
sourceRawWeight        = Σ rawWeight_i
sourceEffectiveWeight  = min(1.0, sourceRawWeight)
postSourceWeight_i     = sourceEffectiveWeight
                         * rawWeight_i / sourceRawWeight
```

This prevents article volume from one publisher from dominating a category.

## 5. Story concentration control

After source capping, observations are grouped by immutable story cluster.

For each underlying story, post-source weights are aggregated by constituent source. The story evidence budget is based on the strongest constituent source total and capped at `1.0`. Member observations share that story budget in proportion to their post-source-cap weights.

Conceptually:

```text
many articles
    -> source cap
    -> immutable story grouping
    -> story cap
    -> effective evidence weight
```

This prevents multiple publishers repeating one underlying development from creating several independent evidence budgets.

A missing, duplicated or incompatible current-contract story assignment blocks the canonical v1.2 calculation rather than silently falling back.

## 6. Category and global score

For active category `c`:

```text
categoryScore_c =
  Σ(severity_i * effectiveEventWeight_i)
  / Σ(effectiveEventWeight_i)
```

Then:

```text
GRI_raw = Σ(activeNormalizedCategoryWeight_c * categoryScore_c)
GRI_display = round(GRI_raw)
```

The persisted snapshot stores higher-precision raw values in addition to the display score.

GRI is an aggregate risk-intensity signal. It is not a prediction-market probability.

## 7. Contribution proof and change attribution

Every eligible observation has a deterministic contribution to the global score. The contribution ledger must reconcile to the raw GRI within the versioned numeric tolerance.

Across two comparable snapshots:

```text
GRI_change = Σ(currentContribution_i - previousContribution_i)
```

Observation-level changes can be classified as added, removed, rescored or reweighted. Source/story concentration changes can alter an observation's contribution even when its severity is unchanged, so exact effective weights must be preserved in the proof record.

Category deltas and event deltas are stored with reconciliation residuals and integrity hashes. A methodology transition is a new baseline, not a real-world risk movement.

## 8. Publication state and immutability

The GRI publication path follows a persisted proof workflow:

```text
compute
  -> draft snapshot
  -> contribution/provenance ledger
  -> reconcile + hash
  -> publish
```

Current public surfaces read persisted published snapshots rather than recalculating the current score in the browser.

Published proof records are intended to remain immutable. Corrections should be new snapshots or explicitly versioned methodology/proof changes rather than silent rewrites of historical published state.

## 9. Integrity material

The current proof stack can carry versioned integrity material such as:

- methodology hash
- calculation-input/data hash
- evidence/provenance hash
- calculation hash
- change-attribution hash
- proof version and complete proof hash
- reconciliation residuals

The canonical current commands are:

```bash
bun run gri:compute
bun run gri:verify
bun run gri:validate
```

These route to the current v1.2 compute/verification/validation path. Explicit v1.1 commands remain only for historical/compatibility work.

## 10. Public verification UX

Normal product surfaces should remain compact. Verification details can be opened on demand to expose:

- current methodology/proof version
- previous score and exact delta
- category and event change attribution
- formula and effective weights
- evidence and classification/story provenance
- integrity hashes and reconciliation state
- validation status where sample gates support a defensible claim

If proof material, freshness or provenance is unavailable, the UI should expose that condition rather than inventing a verified state.

## 11. Empirical validation boundary

Validation is separate from calculation and must never silently change the GRI score.

External benchmark testing may examine association against variables such as volatility, rates, oil, gold, equities or the dollar, but performance claims must be gated by sample size and methodology. Correlation must not be described as causality or guaranteed predictive power.

Retrospective replay must retain its lookahead-safety limitations. Historical replay generated with later classifications/story assignments must not be presented as historical live or genuine out-of-sample performance.

## 12. Versioning rule

Any rule capable of changing the score for identical validated inputs requires a new methodology version, including changes to:

- domain set or base weights
- eligibility/lookback
- recency half-life
- confidence weighting
- source cap
- story cap/correlation dependency
- observation-time semantics
- missing-domain treatment
- normalization
- contribution/change-attribution semantics
- rounding/display rule

Proof visualization and external validation tooling may version independently when they do not alter the numeric score.

## Historical methodology reproducibility

Legacy implementations remain explicitly versioned in the repository for audit reproduction, including v1.0 and v1.1 engines/proof paths.

They must not be represented as the current public methodology. The current public contract is `gri-v1.2.0` with proof envelope `gri-proof-v1.2.0`.
