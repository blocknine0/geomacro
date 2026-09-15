#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  GRI_CANONICAL_SENSITIVITY_PARAMETERS,
  GRI_SENSITIVITY_SCENARIOS,
  GRI_SENSITIVITY_VERSION,
  calculateGriCounterfactual,
} from "./lib/gri-sensitivity-v12.js";

const SUPABASE_URL = process.env.APP_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON_KEY = process.env.APP_SUPABASE_ANON_KEY;
const METHOD_VERSION = process.env.GRI_METHOD_VERSION || "gri-v1.2.0";
const PROOF_VERSION = process.env.GRI_PROOF_VERSION || "gri-proof-v1.2.0";
const MAX_AGE_HOURS = Number(
  process.env.GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS || "3",
);
const OUTPUT =
  process.env.GRI_SENSITIVITY_ARTIFACT ||
  "artifacts/gri-v12-sensitivity.json";
const HASH_RE = /^[a-f0-9]{64}$/i;
const SCORE_TOLERANCE = 0.00001;

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error("APP_SUPABASE_URL and APP_SUPABASE_ANON_KEY are required");
}
if (!Number.isFinite(MAX_AGE_HOURS) || MAX_AGE_HOURS <= 0) {
  throw new Error("GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS must be positive");
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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 6) {
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

async function writeEvidence(evidence) {
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

async function main() {
  const snapshots = await rest("gri_snapshots", {
    select:
      "id,as_of,methodology_version,proof_version,proof_hash,verification_status,status,raw_score,display_score,coverage,event_count,source_count,independent_story_count,published_at",
    status: "eq.published",
    methodology_version: `eq.${METHOD_VERSION}`,
    order: "as_of.desc",
    limit: "1",
  });
  if (snapshots.length !== 1) {
    throw new Error("No current published GRI v1.2 snapshot is visible to the public read path");
  }
  const snapshot = snapshots[0];

  const rows = await rest("gri_contributions", {
    select:
      "event_id,category,source_key,severity,confidence,observed_at,story_cluster_id",
    snapshot_id: `eq.${snapshot.id}`,
    order: "event_id.asc",
  });

  const snapshotTime = Date.parse(String(snapshot.as_of));
  const snapshotAgeHours = Number.isFinite(snapshotTime)
    ? (Date.now() - snapshotTime) / 3_600_000
    : null;

  const baseline = calculateGriCounterfactual(
    rows,
    snapshot.as_of,
    GRI_CANONICAL_SENSITIVITY_PARAMETERS,
  );
  const storedRaw = finite(snapshot.raw_score);
  const storedCoverage = finite(snapshot.coverage);
  const baselineRawResidual =
    storedRaw === null || baseline.rawScore === null
      ? null
      : baseline.rawScore - storedRaw;
  const baselineCoverageResidual =
    storedCoverage === null
      ? null
      : baseline.coverage - storedCoverage;

  const scenarioResults = GRI_SENSITIVITY_SCENARIOS.map((scenario) => {
    const result = calculateGriCounterfactual(
      rows,
      snapshot.as_of,
      scenario.overrides,
    );
    return {
      id: scenario.id,
      description: scenario.description,
      parameters: result.parameters,
      rawScore: round(result.rawScore),
      displayScore: result.displayScore,
      deltaRawFromCanonical:
        result.rawScore === null || baseline.rawScore === null
          ? null
          : round(result.rawScore - baseline.rawScore),
      deltaDisplayFromCanonical:
        result.displayScore === null || baseline.displayScore === null
          ? null
          : result.displayScore - baseline.displayScore,
      coverage: round(result.coverage),
      eventCount: result.eventCount,
      sourceCount: result.sourceCount,
      independentStoryCount: result.independentStoryCount,
      categoryScores: Object.fromEntries(
        result.categories.map((category) => [
          category.category,
          {
            score: round(category.score),
            normalizedWeight: round(category.normalizedWeight),
            contributionPoints: round(category.contributionPoints),
          },
        ]),
      ),
    };
  });

  const deltas = scenarioResults
    .map((scenario) => scenario.deltaRawFromCanonical)
    .filter((value) => Number.isFinite(value));

  const checks = {
    currentMethodology: snapshot.methodology_version === METHOD_VERSION,
    currentProofVersion: snapshot.proof_version === PROOF_VERSION,
    verifiedPublication:
      snapshot.status === "published" && snapshot.verification_status === "verified",
    proofHashValid: HASH_RE.test(String(snapshot.proof_hash ?? "")),
    publicReadFreshness:
      snapshotAgeHours !== null &&
      snapshotAgeHours >= -0.25 &&
      snapshotAgeHours <= MAX_AGE_HOURS,
    contributionCountMatches:
      Number(snapshot.event_count) === rows.length && rows.length > 0,
    baselineRawParity:
      baselineRawResidual !== null &&
      Math.abs(baselineRawResidual) <= SCORE_TOLERANCE,
    baselineDisplayParity:
      baseline.displayScore === Number(snapshot.display_score),
    baselineCoverageParity:
      baselineCoverageResidual !== null &&
      Math.abs(baselineCoverageResidual) <= SCORE_TOLERANCE,
    scenarioSetVersioned:
      GRI_SENSITIVITY_VERSION === "gri-sensitivity-v1.0.0" &&
      GRI_SENSITIVITY_SCENARIOS.length > 0,
    allScenarioScoresFinite:
      scenarioResults.every(
        (scenario) =>
          Number.isFinite(scenario.rawScore) &&
          Number.isInteger(scenario.displayScore),
      ),
  };

  const verified = Object.values(checks).every(Boolean);
  const evidence = {
    evidenceVersion: GRI_SENSITIVITY_VERSION,
    auditedAt: new Date().toISOString(),
    methodologyVersion: snapshot.methodology_version,
    proofVersion: snapshot.proof_version,
    snapshotId: snapshot.id,
    snapshotAsOf: snapshot.as_of,
    snapshotAgeHours:
      snapshotAgeHours === null ? null : round(snapshotAgeHours, 4),
    canonical: {
      storedRawScore: storedRaw,
      storedDisplayScore: Number(snapshot.display_score),
      recomputedRawScore: round(baseline.rawScore),
      recomputedDisplayScore: baseline.displayScore,
      rawResidual: round(baselineRawResidual, 9),
      coverageResidual: round(baselineCoverageResidual, 9),
      parameters: GRI_CANONICAL_SENSITIVITY_PARAMETERS,
      eventCount: rows.length,
    },
    scenarioCount: scenarioResults.length,
    observedDeltaRangeRaw: deltas.length
      ? {
          min: round(Math.min(...deltas)),
          max: round(Math.max(...deltas)),
          maxAbsolute: round(Math.max(...deltas.map((value) => Math.abs(value)))),
        }
      : null,
    scenarios: scenarioResults,
    checks,
    verified,
    claimBoundary: {
      robustnessClaimAuthorized: false,
      predictiveAccuracyClaimAuthorized: false,
      institutionalGradeAccuracyClaimAuthorized: false,
      interpretation:
        "This report measures how the current published eligible event set changes under predeclared counterfactual parameter perturbations. It does not define a pass/fail robustness threshold and does not establish predictive accuracy.",
    },
    scope:
      "Read-only sensitivity evidence over the current published v1.2 eligible contribution universe. Lookback perturbations are only shorter than the canonical 72-hour window so the stored published universe remains complete. Longer-lookback sensitivity requires a separately governed candidate-event dataset and is intentionally not inferred here.",
  };

  await writeEvidence(evidence);
  console.log(JSON.stringify(evidence, null, 2));
  if (!verified) process.exitCode = 1;
}

main().catch(async (error) => {
  const evidence = {
    evidenceVersion: GRI_SENSITIVITY_VERSION,
    auditedAt: new Date().toISOString(),
    verified: false,
    error: error instanceof Error ? error.message : String(error),
    claimBoundary: {
      robustnessClaimAuthorized: false,
      predictiveAccuracyClaimAuthorized: false,
      institutionalGradeAccuracyClaimAuthorized: false,
    },
  };
  try {
    await writeEvidence(evidence);
  } catch {}
  console.error(`GRI sensitivity audit failed: ${evidence.error}`);
  process.exit(1);
});
