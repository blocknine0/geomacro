# Global Risk Index — methodology v1.0.0

Geomacro's GRI is deterministic **after event classification**. Event severity and confidence are model-produced inputs with source/model provenance; the aggregate index itself contains no LLM call and no discretionary adjustment.

## What GRI v1 measures

GRI v1 is a **weighted intensity index of qualifying Geomacro risk observations**, not a census of every world event and not a claim that an empty feed means zero global risk. The upstream ingestion pipeline already applies relevance, confidence and minimum-severity gates before an event reaches `public.events`. GRI v1 therefore answers: *given the risk observations Geomacro has accepted, how severe is the current cross-domain risk surface after confidence, recency and source concentration are accounted for?*

This distinction is deliberate. Until historical calibration supports a defensible event-frequency baseline, Geomacro does not turn missing/quiet observations into a synthetic low-risk score. Coverage, event count, source count and weighted confidence are published alongside the index.

## Canonical formula

Eligible events are observations created in the trailing **72 hours** with a supported category, severity in `[0,100]`, and confidence in `(0,100]`.

For event `i`:

```text
ageHours_i        = (asOf - created_at_i) / 1 hour
confidenceWeight  = confidence_i / 100
decayWeight       = 2 ^ (-ageHours_i / 24)
rawWeight_i       = confidenceWeight * decayWeight
```

The 24-hour term is an exponential **half-life**, not a 24-hour cutoff. Events leave the canonical window after 72 hours.

### Source cap

Within a category, events are grouped by source domain (falling back to source name/URL host). A single source receives at most `1.0` total evidence weight:

```text
sourceRawWeight        = sum(rawWeight_i for source)
sourceEffectiveWeight  = min(1.0, sourceRawWeight)
effectiveEventWeight_i = sourceEffectiveWeight * rawWeight_i / sourceRawWeight
```

This prevents a publisher producing many articles from dominating a category merely through volume.

### Category score

```text
categoryScore_c =
  sum(severity_i * effectiveEventWeight_i) / sum(effectiveEventWeight_i)
```

The four v1 domains have equal base weights: geopolitics `0.25`, macro `0.25`, rare earth / critical minerals `0.25`, crypto `0.25`.

If a domain has no eligible evidence it is **excluded**, never treated as zero risk. Active category weights are renormalized to sum to `1.0`. Coverage is separately reported as the sum of active base weights.

### Global score

```text
GRI_raw = sum(normalizedCategoryWeight_c * categoryScore_c)
GRI_display = round(GRI_raw)
```

The database stores the higher-precision raw score and the integer display score.

## Why a score moved

Every event receives an exact `contribution_points` value:

```text
globalShare_i = normalizedCategoryWeight_c
              * effectiveEventWeight_i / categoryEffectiveWeight_c

contributionPoints_i = globalShare_i * severity_i
```

The event contributions sum to the raw GRI. For two snapshots:

```text
GRI_change = sum(currentContribution_i - previousContribution_i)
```

This gives an exact mathematical decomposition for a move such as `83 → 63`. Each event is labelled as added, removed, rescored, or reweighted; category-level deltas are also stored. A residual near floating-point zero is recorded as an integrity check.

## Time semantics

`created_at` is the canonical observation time because it records when Geomacro knew the event. `published_at` remains provenance. A late-ingested article therefore cannot rewrite an earlier historical snapshot by backdating itself.

## Audit records

Migration `004_gri_audit_system.sql` creates:

- `gri_snapshots`: methodology version/hash, input hash, calculation hash, raw/display score, coverage, confidence, category breakdown, and 24h comparison attribution.
- `gri_contributions`: exact event-level weights and contribution points for each snapshot.
- event classification provenance fields: provider, model, classification version, prompt version, scoring timestamp, and prompt/input hash.

`node scripts/compute-gri-v11.js` computes and persists a snapshot. `--dry-run` prints the calculation without writing. `--as-of <ISO>` supports reproducibility checks.

Live GRI publication is deliberately decoupled from news ingestion. The dedicated `publish-gri.yml` workflow is the only canonical live publisher, so an ingestion retry cannot create a competing publication path.

## Versioning rule

Do not silently change weights, half-life, source cap, eligibility, category set, timestamp semantics, or rounding. Any such change requires a new methodology version and a documented migration/calibration note.
