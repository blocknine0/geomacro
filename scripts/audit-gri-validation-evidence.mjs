#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SUPABASE_URL = process.env.APP_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON_KEY = process.env.APP_SUPABASE_ANON_KEY;
const METHOD_VERSION = process.env.GRI_METHOD_VERSION || "gri-v1.2.0";
const VALIDATION_VERSION =
  process.env.GRI_VALIDATION_VERSION || "gri-validation-v1.1.0";
const OUTPUT =
  process.env.GRI_VALIDATION_EVIDENCE_ARTIFACT ||
  "artifacts/gri-validation-evidence.json";
const HASH_RE = /^[a-f0-9]{64}$/i;
const SPLIT_ORDER = new Map([
  ["all", 0],
  ["train", 1],
  ["test", 2],
]);

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error("APP_SUPABASE_URL and APP_SUPABASE_ANON_KEY are required");
}

function headers() {
  return {
    apikey: ANON_KEY,
    authorization: `Bearer ${ANON_KEY}`,
    accept: "application/json",
  };
}

async function rest(table, params) {
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    method: "GET",
    headers: headers(),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`${table} read failed with HTTP ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error(`${table} returned a non-array response`);
  return body;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function metricForHash(row) {
  return {
    benchmark_key: row.benchmark_key,
    horizon_hours: Number(row.horizon_hours),
    split: row.split,
    sample_count: Number(row.sample_count),
    pearson_r: finite(row.pearson_r),
    spearman_rho: finite(row.spearman_rho),
    delta_pearson_r: finite(row.delta_pearson_r),
    delta_pearson_p_approx: finite(row.delta_pearson_p_approx),
    direction_hit_rate: finite(row.direction_hit_rate),
    high_risk_event_count: Number(row.high_risk_event_count ?? 0),
    false_positive_rate: finite(row.false_positive_rate),
    event_study_high_mean_z: finite(row.event_study_high_mean_z),
    event_study_baseline_mean_z: finite(row.event_study_baseline_mean_z),
    event_study_effect_z: finite(row.event_study_effect_z),
    notes: row.notes ?? null,
  };
}

function sortMetrics(metrics) {
  return [...metrics].sort((left, right) => {
    const benchmark = String(left.benchmark_key).localeCompare(
      String(right.benchmark_key),
    );
    if (benchmark !== 0) return benchmark;
    const horizon = Number(left.horizon_hours) - Number(right.horizon_hours);
    if (horizon !== 0) return horizon;
    return (
      (SPLIT_ORDER.get(left.split) ?? 99) -
      (SPLIT_ORDER.get(right.split) ?? 99)
    );
  });
}

async function writeEvidence(evidence) {
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

async function main() {
  const runs = await rest("gri_validation_runs", {
    select:
      "id,methodology_version,validation_version,evidence_mode,source_replay_run_id,status,sample_start,sample_end,sample_count,benchmark_count,train_fraction,result_hash,summary,published_at",
    methodology_version: `eq.${METHOD_VERSION}`,
    published_at: "not.is.null",
    order: "published_at.desc",
    limit: "1",
  });
  if (runs.length !== 1) {
    throw new Error("No published validation run is visible on the public read path");
  }
  const run = runs[0];

  const metricRows = await rest("gri_validation_metrics", {
    select:
      "benchmark_key,horizon_hours,split,sample_count,pearson_r,spearman_rho,delta_pearson_r,delta_pearson_p_approx,direction_hit_rate,high_risk_event_count,false_positive_rate,event_study_high_mean_z,event_study_baseline_mean_z,event_study_effect_z,notes",
    validation_run_id: `eq.${run.id}`,
    order: "benchmark_key.asc,horizon_hours.asc",
  });
  const metrics = sortMetrics(metricRows.map(metricForHash));
  const summary = run.summary && typeof run.summary === "object" ? run.summary : {};

  const benchmarkKeys = [...new Set(metrics.map((metric) => metric.benchmark_key))].sort();
  const horizons = Array.isArray(summary.horizonsHours)
    ? summary.horizonsHours.map(Number).filter(Number.isFinite)
    : [...new Set(metrics.map((metric) => metric.horizon_hours))].sort((a, b) => a - b);
  const minimumAll = Number(summary?.minimumSamples?.all ?? 30);
  const minimumTest = Number(summary?.minimumSamples?.test ?? 10);
  const completedFromMetrics =
    metrics.some(
      (metric) => metric.split === "all" && metric.sample_count >= minimumAll,
    ) &&
    metrics.some(
      (metric) => metric.split === "test" && metric.sample_count >= minimumTest,
    );
  const expectedStatus = completedFromMetrics ? "completed" : "insufficient_data";

  const gridKeys = new Set(
    metrics.map(
      (metric) =>
        `${metric.benchmark_key}|${metric.horizon_hours}|${metric.split}`,
    ),
  );
  let completeGrid = true;
  for (const benchmark of benchmarkKeys) {
    for (const horizon of horizons) {
      for (const split of ["all", "train", "test"]) {
        if (!gridKeys.has(`${benchmark}|${horizon}|${split}`)) {
          completeGrid = false;
        }
      }
    }
  }

  const recomputedResultHash = sha256(
    canonicalJson({
      summary,
      metrics,
    }),
  );
  const claimPolicy = String(summary.claimPolicy ?? "");
  let claimPolicyMatches = false;
  if (run.status === "insufficient_data") {
    claimPolicyMatches = claimPolicy.includes("Insufficient data");
  } else if (run.status === "completed" && run.evidence_mode === "live_oos") {
    claimPolicyMatches = claimPolicy.includes("Metrics may be displayed");
  } else if (
    run.status === "completed" &&
    run.evidence_mode === "retrospective_replay"
  ) {
    claimPolicyMatches = claimPolicy.includes("Retrospective calibration only");
  }

  const expectedMetricCount = benchmarkKeys.length * horizons.length * 3;
  const maxSampleCount = metrics.reduce(
    (max, metric) => Math.max(max, metric.sample_count),
    0,
  );
  const testCounts = metrics
    .filter((metric) => metric.split === "test")
    .map((metric) => metric.sample_count);

  const checks = {
    methodologyVersion: run.methodology_version === METHOD_VERSION,
    validationVersion: run.validation_version === VALIDATION_VERSION,
    evidenceModeKnown: ["live_oos", "retrospective_replay"].includes(
      run.evidence_mode,
    ),
    published: Boolean(run.published_at),
    statusConsistent: run.status === expectedStatus,
    resultHashShape: HASH_RE.test(String(run.result_hash ?? "")),
    resultHashRecomputed: recomputedResultHash === run.result_hash,
    benchmarkCountMatches:
      Number(run.benchmark_count) === benchmarkKeys.length &&
      Number(run.benchmark_count) === Number(summary.benchmarkKeys?.length ?? benchmarkKeys.length),
    sampleCountMatches: Number(run.sample_count) === maxSampleCount,
    metricGridComplete:
      completeGrid && metrics.length === expectedMetricCount && metrics.length > 0,
    splitSamplesNonNegative: metrics.every(
      (metric) => Number.isInteger(metric.sample_count) && metric.sample_count >= 0,
    ),
    claimPolicyMatchesEvidenceClass: claimPolicyMatches,
    trainFractionMatches:
      finite(run.train_fraction) !== null &&
      finite(summary.trainFraction) !== null &&
      Math.abs(Number(run.train_fraction) - Number(summary.trainFraction)) <= 0.00001,
  };

  const verified = Object.values(checks).every(Boolean);
  const evidenceClass =
    run.status !== "completed"
      ? "insufficient_data"
      : run.evidence_mode === "live_oos"
        ? "live_oos_completed"
        : "retrospective_completed";

  const evidence = {
    evidenceVersion: "gri-validation-evidence-audit-v1.0.0",
    auditedAt: new Date().toISOString(),
    runId: run.id,
    methodologyVersion: run.methodology_version,
    validationVersion: run.validation_version,
    evidenceMode: run.evidence_mode,
    evidenceClass,
    sourceReplayRunId: run.source_replay_run_id,
    status: run.status,
    sampleStart: run.sample_start,
    sampleEnd: run.sample_end,
    sampleCount: Number(run.sample_count),
    benchmarkCount: Number(run.benchmark_count),
    metricCount: metrics.length,
    horizonsHours: horizons,
    minimumSamples: {
      all: minimumAll,
      test: minimumTest,
    },
    testSampleRange: testCounts.length
      ? {
          min: Math.min(...testCounts),
          max: Math.max(...testCounts),
        }
      : null,
    resultHash: run.result_hash,
    recomputedResultHash,
    checks,
    verified,
    claimBoundary: {
      claimPolicy,
      associationMetricsDisplayable:
        run.status === "completed" && run.evidence_mode === "live_oos",
      predictiveAccuracyClaimAuthorized: false,
      causalityClaimAuthorized: false,
      institutionalGradeAccuracyClaimAuthorized: false,
      note:
        "A structurally valid published validation run can support only the evidence class and sample-qualified associations it actually measures. It does not authorize predictive certainty, causality or an institutional-grade accuracy claim.",
    },
    scope:
      "Read-only audit of the latest published GRI v1.2 validation run, its complete benchmark/horizon/split metric grid, sample-status contract, evidence-mode claim policy and deterministic result hash.",
  };

  await writeEvidence(evidence);
  console.log(JSON.stringify(evidence, null, 2));
  if (!verified) process.exitCode = 1;
}

main().catch(async (error) => {
  const evidence = {
    evidenceVersion: "gri-validation-evidence-audit-v1.0.0",
    auditedAt: new Date().toISOString(),
    verified: false,
    error: error instanceof Error ? error.message : String(error),
    claimBoundary: {
      predictiveAccuracyClaimAuthorized: false,
      causalityClaimAuthorized: false,
      institutionalGradeAccuracyClaimAuthorized: false,
    },
  };
  try {
    await writeEvidence(evidence);
  } catch {}
  console.error(`GRI validation evidence audit failed: ${evidence.error}`);
  process.exit(1);
});
