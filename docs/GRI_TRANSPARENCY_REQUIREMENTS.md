# GRI Transparency and Change Attribution

## Implemented baseline: `gri-v1.1.0`

Geomacro now has one versioned deterministic aggregation engine in `scripts/lib/gri-engine-v11.js`. The previous rolling 24-hour simple mean is no longer the canonical methodology.

Every GRI v1 calculation is derived from eligible stored event records using:

- severity as the 0–100 risk signal;
- confidence-based evidence weighting;
- exponential recency decay with a 24-hour half-life;
- a 72-hour hard lookback;
- a per-source evidence cap;
- an immutable story-cluster evidence cap that prevents cross-publisher repetition of one underlying development from multiplying its influence;
- equal base weights across geopolitics, macro, rare earth / critical minerals, and crypto;
- explicit coverage instead of converting missing domains into zero risk;
- `created_at` as the observation timestamp, preventing late ingestion from backdating what the system knew.

The exact formula is documented in `docs/GRI_METHODOLOGY.md`. GRI v1 is explicitly an intensity index over **qualifying stored risk observations**; upstream ingestion gates mean it is not a complete census of all world events, and an empty window is unavailable rather than asserted to be low risk.

## Audit records

Migration `004_gri_audit_system.sql` introduces persisted `gri_snapshots` and `gri_contributions` tables. Migrations `007_gri_story_correlation.sql` and `009_gri_v11_story_cap.sql` add immutable story provenance and the v1.1 story-aware audit contract.

A published snapshot records:

- methodology version and methodology hash;
- input/data hash;
- calculation hash;
- raw and display score;
- coverage and weighted confidence;
- active categories and category breakdown;
- event and source counts;
- previous comparable snapshot;
- exact 24-hour score change;
- change-attribution JSON and hash.

Each contribution record preserves the event/source reference, severity, confidence, timestamps, decay, source-capped weights, normalized shares, exact contribution points, and classification provenance fields.

Newly ingested events also record model/provider provenance: classification provider, model, classification version, prompt version, scoring time, and prompt/input hash. Legacy records are explicitly marked `legacy-unversioned` where historical model metadata cannot be reconstructed honestly.

## Change Attribution Engine

A movement such as `83 → 63` is decomposed mathematically:

```text
GRI_change = Σ(current event contribution points - previous event contribution points)
```

The engine reports event-level changes as added, removed, rescored, or reweighted, plus category-level contribution deltas. The attribution stores a residual, which should be effectively zero apart from normal numeric storage/rounding precision.

This separates two different questions:

1. **Why did an event receive severity 72?** — inspect source plus classification provider/model/version/provenance.
2. **How did those events produce GRI 63, and why was it 83 before?** — inspect the deterministic GRI snapshot, category breakdown and event contribution deltas.

## Publication workflow

`node scripts/compute-gri-v11.js` computes the canonical snapshot. It supports:

- `--dry-run` for calculation inspection without a write;
- `--as-of <ISO>` for reproducibility checks.

Live GRI publication is deliberately decoupled from news ingestion. The dedicated `publish-gri.yml` workflow is the only canonical live publisher; ingestion does not publish GRI snapshots.

## Remaining product-layer work

The calculation/audit backend is now defined. Before calling the GRI institutional-grade in external materials, complete these deployment steps:

- apply migration `004` to the production Supabase project;
- enable snapshot publishing and confirm several consecutive snapshots reconcile;
- backfill historical GRI snapshots from the stored historical event dataset using the same methodology version or an explicitly versioned historical-calibration methodology;
- expose snapshot hash / methodology version / contribution drill-down in the public or professional UI;
- run calibration and sensitivity analysis on the fixed v1 parameters before making predictive-performance claims.

No methodology parameter should be silently changed. Any change to categories, weights, half-life, source cap, eligibility, observation-time semantics or rounding requires a new GRI methodology version.
