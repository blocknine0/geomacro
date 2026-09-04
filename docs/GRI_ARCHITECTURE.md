# Global Risk Index architecture and proof system

**Canonical methodology:** `gri-v1.1.0`
**Proof envelope:** `gri-proof-v1.1.0`

This document is the repository specification behind the public `/docs/gri-architecture` page.

## 1. Separation of concerns

GRI has three deliberately separate layers:

1. **Observed evidence** — source URL/title/domain, publisher time, Geomacro observation time.
2. **Model interpretation** — category, severity and confidence plus provider/model/classifier/prompt/input-hash provenance.
3. **Deterministic aggregation** — confidence/recency weight, source cap, category score, normalized category share and exact GRI contribution points.

A source proves that an observation exists. Classification provenance proves which scoring system produced the model interpretation. The immutable contribution ledger proves how those model-produced inputs became the published index.

## 2. Canonical formula

Eligible events are in the trailing 72 hours and must have a supported domain, severity in `[0,100]`, and confidence in `(0,100]`.

```text
ageHours_i       = (asOf - observedAt_i) / 1 hour
confidenceWeight = confidence_i / 100
decayWeight      = 2 ^ (-ageHours_i / 24)
rawWeight_i      = confidenceWeight * decayWeight
```

Within each domain, one source receives at most `1.0` total effective evidence weight. GRI v1.1 then applies an immutable story-cluster cap so repetition of the same underlying development across multiple publishers cannot create multiple independent evidence budgets:

```text
sourceRawWeight          = Σ rawWeight_i
sourceEffectiveWeight    = min(1.0, sourceRawWeight)
preStoryEventWeight_i    = sourceEffectiveWeight
                           * rawWeight_i / sourceRawWeight

storyRawWeight_s         = Σ preStoryEventWeight_i
storySourceWeight_s,j    = Σ preStoryEventWeight_i from source j
storyStrongestSource_s   = max_j(storySourceWeight_s,j)
storyEffectiveWeight_s   = min(1.0, storyStrongestSource_s)

effectiveEventWeight_i   = storyEffectiveWeight_s
                           * preStoryEventWeight_i / storyRawWeight_s
```

Category score:

```text
categoryScore_c =
  Σ(severity_i * effectiveEventWeight_i) / Σ(effectiveEventWeight_i)
```

Base domain weights are equal:

- geopolitics `0.25`
- macro `0.25`
- rare earth / critical minerals `0.25`
- crypto `0.25`

Missing domains are excluded, not assigned zero. Active domain weights are normalized and original base-weight coverage is published separately.

```text
GRI_raw     = Σ(normalizedDomainWeight_c * categoryScore_c)
GRI_display = round(GRI_raw)
```

GRI is an aggregate intelligence signal, not a prediction-market probability.

## 3. Exact contribution proof

For every event:

```text
globalShare_i = normalizedDomainWeight_c
              * effectiveEventWeight_i / categoryEffectiveWeight_c

contributionPoints_i = globalShare_i * severity_i
```

The event contribution ledger must reconcile to the raw GRI:

```text
GRI_raw = Σ contributionPoints_i
```

The publisher records a reconciliation residual. Publication fails when the residual exceeds the versioned tolerance.

## 4. Exact change proof

Only same-methodology snapshots are compared.

```text
GRI_change = Σ(currentContribution_i - previousContribution_i)
```

Each event is classified as:

- `added`
- `removed`
- `rescored`
- `reweighted`

Category deltas and event deltas are stored together with a change hash and a change reconciliation residual. A methodology transition is a new baseline, not a real-world score movement.

## 5. Worked hypothetical example

At `2026-08-30T12:00:00Z`, use five illustrative events:

| Event | Domain | Severity | Confidence | Age | Raw weight | GRI contribution |
|---|---|---:|---:|---:|---:|---:|
| G1 | geopolitics | 90 | 90% | 6h | 0.756807 | 14.719963 |
| G2 | geopolitics | 70 | 80% | 24h | 0.400000 | 6.051140 |
| M1 | macro | 60 | 85% | 12h | 0.601041 | 15.000000 |
| R1 | rare earth | 55 | 75% | 18h | 0.445953 | 13.750000 |
| C1 | crypto | 40 | 95% | 3h | 0.871154 | 10.000000 |

Geopolitics category score is `83.084411`, contributing `20.771103` GRI points. The other domain contributions are `15`, `13.75`, and `10`.

```text
20.771103 + 15 + 13.75 + 10 = 59.521103
GRI_display = 60
```

These numbers are an architecture example, not live Geomacro data.

## 6. Publication state machine

Migration `005_gri_proof_validation_production.sql` makes publication two-phase:

```text
compute -> draft snapshot -> write contribution ledger -> reconcile/hash -> publish
```

Anonymous clients can read only `status='published'` snapshots. Once a snapshot becomes published, database triggers reject updates/deletes to the snapshot and its contribution rows. A correction must be a new snapshot or a new methodology version.

## 7. Integrity hashes

Every complete proof package can expose:

- methodology hash
- calculation-input hash
- evidence/provenance hash
- calculation hash
- change-attribution hash
- complete proof hash

`node scripts/verify-gri-snapshot-v11.js` independently reconstructs the score from the stored proof ledger and verifies those hashes.

## 8. UI disclosure rule

Normal product surfaces remain compact. The full proof is **hidden by default**.

`Verify this GRI` lazy-loads the exact published proof package and exposes:

- **Why it moved** — previous score + exact delta = current score; category and event change ledger.
- **How it is calculated** — formula and per-event weights/contributions.
- **Evidence** — source and classifier provenance.
- **Integrity** — hashes, residuals and publication status.
- **Validation** — latest empirical validation status and out-of-sample metrics when sample gates are met.

## 9. Empirical validation

Validation is separate from calculation and never changes GRI values.

Default external benchmark definitions include:

- CBOE VIX
- US 30-year Treasury yield
- WTI crude oil
- gold
- S&P 500
- nominal broad U.S. dollar index

The daily validation workflow records 24h, 72h and 168h horizons with a chronological 70/30 train/test split. Metrics include Pearson/Spearman association, GRI-change vs future benchmark-change correlation, direction hit-rate where a defensible risk direction exists, and high-risk false-positive rate.

Minimum sample gates suppress performance claims when data is insufficient. Correlation is never described as causality or guaranteed predictive power.

## 10. Versioning

Any rule capable of changing the GRI for identical inputs requires a new methodology version, including changes to:

- domain set or base weights
- eligibility/lookback
- recency half-life
- confidence weighting
- source cap
- observation-time semantics
- missing-domain treatment
- rounding/display rule

Proof visualization and validation tooling can version independently because they do not change the numeric score.

## Historical methodology reproducibility

The repository retains the previous `gri-v1.0.0` implementation only for historical audit reproduction:

- `src/lib/gri-engine-v10.js`
- `scripts/lib/gri-proof-v10.js`
- `scripts/legacy/compute-gri-v10.js`
- `scripts/legacy/verify-gri-snapshot-v10.js`

These files are not part of the current publication, replay, validation or verification path. Current production truth is `gri-v1.1.0` with proof envelope `gri-proof-v1.1.0`.
