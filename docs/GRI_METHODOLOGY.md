# Global Risk Index — methodology v1.2.0

Geomacro's Global Risk Index (GRI) is deterministic **after event classification and current-contract story assignment**. Event severity and confidence are model-produced inputs with source/model provenance; the aggregate index itself contains no LLM call and no discretionary manual adjustment.

## What GRI v1.2 measures

GRI v1.2 is a **weighted intensity index of qualifying Geomacro risk observations**. It is not a census of every world event and does not treat an empty or missing feed as proof of zero global risk.

The current public methodology uses three supported domains:

- geopolitics
- macroeconomics
- rare earth / critical-mineral risk

Each domain has an equal base weight of `1/3`. If a domain has no eligible evidence, it is excluded rather than treated as zero; active category weights are renormalized and coverage is disclosed separately.

Crypto remains part of the broader Geomacro product/data architecture but is **not a current GRI v1.2 scoring domain**.

## Canonical observation eligibility

Eligible observations must:

- belong to a supported GRI v1.2 category;
- have severity in `[0,100]`;
- have confidence in `(0,100]`;
- fall within the trailing **72-hour** observation window;
- carry the current classification provenance contract;
- carry a valid current-contract story-cluster assignment and clustering provenance.

The current classification contract is versioned separately from the GRI formula. The current public application contract is defined in `src/lib/gri-current-contract.ts`.

## Event evidence weight

For event `i`:

```text
ageHours_i        = (asOf - observed_at_i) / 1 hour
confidenceWeight  = confidence_i / 100
decayWeight       = 2 ^ (-ageHours_i / 24)
rawWeight_i       = confidenceWeight * decayWeight
```

`created_at` / `observed_at` represents when Geomacro knew the observation. `published_at` remains source provenance and cannot backdate a historical snapshot.

The 24-hour term is an exponential **half-life**, not a cutoff. Observations leave the canonical window after 72 hours.

## Source concentration cap

Within a category, observations are grouped by stable source identity. One source receives at most `1.0` total evidence weight:

```text
sourceRawWeight        = sum(rawWeight_i for source)
sourceEffectiveWeight  = min(1.0, sourceRawWeight)
postSourceWeight_i     = sourceEffectiveWeight * rawWeight_i / sourceRawWeight
```

This prevents one publisher from dominating the index merely by publishing many articles.

## Story concentration cap

GRI v1.2 adds a second concentration control at the underlying-development level.

After source capping, events are grouped by immutable story cluster. For each story, post-source event weights are summed within each source. The story evidence budget is based on the strongest constituent source total and is capped at `1.0`. Member events share that story budget in proportion to their post-source-cap weights.

Conceptually:

```text
many articles
    -> source cap
    -> story grouping
    -> story cap
    -> effective evidence weight
```

This prevents multiple publishers repeating one underlying development from multiplying that single development into several independent evidence budgets.

The current story-correlation contract is versioned. Missing, duplicated or incompatible current-contract story assignments block the canonical v1.2 calculation rather than silently falling back.

## Category score

For category `c`:

```text
categoryScore_c =
  sum(severity_i * effectiveEventWeight_i)
  / sum(effectiveEventWeight_i)
```

where `effectiveEventWeight_i` is the weight after both source and story concentration controls.

The three v1.2 domains have equal base weights:

```text
geopolitics  = 1/3
macro        = 1/3
rare_earth   = 1/3
```

If a domain has no eligible evidence, it is excluded and the remaining active category weights are renormalized to sum to `1.0`. Missing coverage is disclosed rather than converted into synthetic low risk.

## Global score

```text
GRI_raw = sum(activeNormalizedCategoryWeight_c * categoryScore_c)
GRI_display = round(GRI_raw)
```

The persisted snapshot keeps the higher-precision raw score as well as the integer display score.

## Why a score moved

GRI is designed to expose change attribution rather than only a static number.

Each eligible observation receives a deterministic contribution to the global score. Across two snapshots:

```text
GRI_change = sum(currentContribution_i - previousContribution_i)
```

This supports mathematically reconciling change attribution for added, removed, rescored or reweighted observations and for category-level movement, subject only to explicitly documented floating-point/rounding tolerance.

Story/source concentration changes can also alter an observation's contribution even when its severity is unchanged. Attribution must therefore preserve the exact effective weights used by that snapshot.

## Provenance and reproducibility

Current publication requires explicit provenance for both event classification and story correlation. A canonical observation must retain enough metadata to identify the provider/model, version, prompt version, scoring timestamp and input hash used by the relevant upstream decision.

The same validated inputs, as-of time and methodology version must produce the same GRI result.

Historical methodology/proof implementations remain versioned separately for audit reproducibility. They must not be silently substituted into the current public calculation path.

## Audit records

The GRI audit system persists versioned snapshots and contribution-level proof material, including:

- methodology version and methodology hash;
- input/data integrity hashes;
- calculation/proof hashes;
- raw and display score;
- coverage and confidence metadata;
- category breakdown;
- exact contribution-level attribution;
- previous-snapshot comparison/change attribution;
- classification and story-correlation provenance.

The current canonical commands are:

```bash
bun run gri:compute
bun run gri:verify
bun run gri:validate
```

These route to the current v1.2 compute, proof and validation stack. Explicit `:v11` commands are retained for historical/compatibility work and are not the canonical current publication path.

`--dry-run` and explicit `--as-of <ISO>` modes remain useful for reproducibility checks where supported by the underlying script.

## Publication and freshness

Live GRI publication is deliberately separated from news ingestion. The dedicated publication workflow is the canonical live publisher, so an ingestion retry does not create an uncontrolled competing publication path.

The public read model also enforces a maximum acceptable snapshot age. Freshness is a publication/read-model safety rule and is disclosed separately from the score formula itself.

## Versioning rule

Do not silently change any of the following under the same methodology version:

- category set or base weights;
- lookback window;
- half-life;
- source concentration rule/cap;
- story concentration rule/cap;
- eligibility rules;
- timestamp semantics;
- normalization;
- rounding;
- contribution/change-attribution semantics.

Any material change requires a new methodology version, matching code/tests/documentation, and a documented calibration or migration note.
