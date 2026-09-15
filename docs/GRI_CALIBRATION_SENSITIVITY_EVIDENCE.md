# GRI v1.2 Calibration and Sensitivity Evidence

Status: controlled methodology evidence for `gri-v1.2.0`. This document does **not** authorize predictive-accuracy, causality, institutional-grade accuracy, certification or SLA claims.

## Purpose

Geomacro needs two different questions answered without mixing them:

1. **Empirical validation:** what measured relationships exist between published/replayed GRI observations and predeclared external benchmark series?
2. **Parameter sensitivity:** how much does the current published GRI move when selected methodology parameters are changed in predeclared counterfactual scenarios?

The first question is handled by the existing versioned validation pipeline. The second is handled by a separate analysis-only sensitivity engine. Neither changes the live GRI calculation.

## Canonical production method remains unchanged

The production method remains `gri-v1.2.0`:

- three domains: geopolitics, macro and rare-earth / critical-mineral risk;
- equal base weights of one third each;
- 72-hour hard lookback;
- 24-hour exponential half-life;
- confidence-weighted evidence;
- per-source evidence cap of `1.0`;
- per-story evidence cap of `1.0` after source capping;
- deterministic category aggregation and rounding;
- current story-correlation contract and proof envelope.

The sensitivity code is not imported by the production publisher and does not alter the methodology manifest or proof hash contract.

## Evidence class A: published validation run audit

`scripts/audit-gri-validation-evidence.mjs` reads only the public/anon validation tables and independently checks the latest published `gri_validation_runs` record against its metric ledger.

The audit verifies:

- methodology and validation versions;
- evidence mode (`live_oos` or `retrospective_replay`);
- published status;
- benchmark count;
- sample-count/status consistency;
- complete benchmark × horizon × split metric grid;
- train fraction;
- evidence-class claim policy;
- deterministic `result_hash` recomputation over the published summary and metrics.

A structurally verified validation run is **not** automatically a favorable validation result. Metrics, sample counts and evidence mode still determine what can be said.

### Claim boundary

- `insufficient_data`: no performance claim.
- `retrospective_replay + completed`: retrospective calibration/methodology evidence only. It is not historical live prediction or true out-of-sample evidence.
- `live_oos + completed`: sample-qualified association/event-study metrics may be displayed with their limitations. Correlation is not causation and this still does not authorize predictive certainty or an institutional-grade accuracy claim.

The existing validation implementation uses predeclared benchmark definitions, 24/72/168-hour horizons, train/test splits, minimum sample gates and explicit claim-policy text.

## Evidence class B: current-snapshot parameter sensitivity

`scripts/audit-gri-v12-sensitivity.mjs` reads the latest public verified GRI snapshot and its public contribution ledger. It first recomputes the canonical baseline through `scripts/lib/gri-sensitivity-v12.js`.

The audit fails if the analysis baseline does not reproduce the stored production score within the configured numerical tolerance.

Only after baseline parity is established does it run the versioned `gri-sensitivity-v1.0.0` counterfactual set.

Current predeclared perturbations include:

- faster/slower recency half-life;
- shorter 24h/48h lookback windows;
- stricter/looser source concentration caps;
- stricter story concentration cap;
- ±10 percentage-point domain-weight shifts with the offset split across the other two domains;
- one combined stricter-evidence scenario.

No longer-than-72-hour lookback scenario is inferred from the current contribution ledger because the published contribution universe cannot prove that older candidate events are complete. A longer-lookback study would require a separately governed candidate-event dataset.

## What sensitivity evidence means

The report records, for each scenario:

- raw and display score;
- delta from the canonical score;
- event/source/story counts;
- coverage;
- category scores, normalized weights and contribution points.

It deliberately does **not** invent a pass/fail robustness threshold. Until a threshold is justified and predeclared, the evidence is descriptive: it shows how much the score moved under each counterfactual.

Therefore:

- `robustnessClaimAuthorized=false`;
- `predictiveAccuracyClaimAuthorized=false`;
- `institutionalGradeAccuracyClaimAuthorized=false`.

## Read-only workflow

`.github/workflows/gri-calibration-sensitivity-evidence.yml` uses only:

- `APP_SUPABASE_URL`;
- `APP_SUPABASE_ANON_KEY`.

It does not receive the Supabase service-role key and performs no database mutation. It runs:

1. the published validation evidence audit;
2. the current v1.2 sensitivity audit;
3. artifact upload with 90-day retention.

The workflow is available by manual dispatch, runs weekly, and runs when the relevant evidence code is merged to `main`.

Artifacts:

- `artifacts/gri-validation-evidence.json`
- `artifacts/gri-v12-sensitivity.json`

## Evidence status

The code and regression contract are not themselves live evidence. The first real read-only workflow run on reviewed `main` must be inspected before recording any measured calibration/sensitivity result in commercialization tracking.

A successful workflow run can close the **mechanical evidence/reproducibility** part of the calibration/sensitivity gate. It does not by itself justify a broad predictive or institutional-grade accuracy claim. Those claims require evidence appropriate to the exact statement, sufficient sample history and, where relevant, lookahead-safe/live out-of-sample validation.
