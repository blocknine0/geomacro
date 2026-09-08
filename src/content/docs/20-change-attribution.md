# 20. Change Attribution

A core Geomacro requirement is to explain not only the current risk number, but why it moved.

GRI v1.2 persists contribution-level proof material so change between comparable snapshots can be reconciled mathematically.

Conceptually:

```text
previous contribution
        ↓
added / removed / rescored / reweighted evidence
        ↓
current contribution
        ↓
exact contribution delta
        ↓
GRI change
```

Across two comparable snapshots:

```text
GRI_change = Σ(currentContribution_i - previousContribution_i)
```

Source/story concentration can change an observation's contribution even when its severity is unchanged, so attribution preserves the exact effective weights used by each snapshot.

The public proof system also records change residuals and reconciliation information. Material movement should reconcile within explicitly documented numeric tolerance.

This is why a Geomacro score should be accompanied by evidence, attribution and methodology context rather than shown as an unexplained scalar.