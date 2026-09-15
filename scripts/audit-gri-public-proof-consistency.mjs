#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SUPABASE_URL = process.env.APP_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON_KEY = process.env.APP_SUPABASE_ANON_KEY;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
const METHOD_VERSION = process.env.GRI_METHOD_VERSION || "gri-v1.2.0";
const PROOF_VERSION = process.env.GRI_PROOF_VERSION || "gri-proof-v1.2.0";
const OUTPUT =
  process.env.GRI_CONSISTENCY_ARTIFACT ||
  "artifacts/gri-public-proof-consistency.json";

const STORY_VERSION = "story-correlation-v1.0.0";
const STORY_PROMPT_VERSION = "story-match-title-v1.0.0";
const HASH_RE = /^[a-f0-9]{64}$/;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error(
    "APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY and a service-role key are required",
  );
}

const snapshotFields = [
  "id",
  "as_of",
  "methodology_version",
  "methodology_hash",
  "input_hash",
  "evidence_hash",
  "calculation_hash",
  "disposition_hash",
  "candidate_event_count",
  "change_hash",
  "proof_version",
  "proof_hash",
  "verification_status",
  "reconciliation_residual",
  "change_residual",
  "raw_score",
  "display_score",
  "coverage",
  "weighted_confidence",
  "active_categories",
  "event_count",
  "source_count",
  "independent_story_count",
  "story_correlation_version",
  "story_correlation_prompt_version",
  "category_breakdown",
  "previous_as_of",
  "previous_raw_score",
  "previous_display_score",
  "change_points",
  "change_attribution",
  "explanation",
  "status",
  "published_at",
];

function headers(key) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    accept: "application/json",
  };
}

async function rest(key, table, params) {
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  for (const [name, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) url.searchParams.set(name, value);
  }
  const response = await fetch(url, {
    method: "GET",
    headers: headers(key),
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(`${table} read failed with HTTP ${response.status}`);
  }
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error(`${table} returned a non-array response`);
  return body;
}

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
    .join(",")}}`;
}

function exactObjectParity(left, right, fields) {
  return fields.every((field) => stable(left?.[field]) === stable(right?.[field]));
}

function sortedIds(rows) {
  return rows.map((row) => String(row.event_id)).sort();
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, i) => value === right[i]);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function writeEvidence(evidence) {
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

async function main() {
  const serviceSnapshots = await rest(SERVICE_KEY, "gri_snapshots", {
    select: snapshotFields.join(","),
    status: "eq.published",
    methodology_version: `eq.${METHOD_VERSION}`,
    order: "as_of.desc",
    limit: "1",
  });
  if (serviceSnapshots.length !== 1) {
    throw new Error("No current published GRI snapshot is visible to the service role");
  }
  const serviceSnapshot = serviceSnapshots[0];

  const anonSnapshots = await rest(ANON_KEY, "gri_snapshots", {
    select: snapshotFields.join(","),
    id: `eq.${serviceSnapshot.id}`,
    status: "eq.published",
    methodology_version: `eq.${METHOD_VERSION}`,
    limit: "1",
  });
  const anonSnapshot = anonSnapshots[0] ?? null;

  const [serviceContributions, anonContributions, serviceDispositions, anonDispositions] =
    await Promise.all([
      rest(SERVICE_KEY, "gri_contributions", {
        select: "event_id",
        snapshot_id: `eq.${serviceSnapshot.id}`,
        order: "event_id.asc",
      }),
      rest(ANON_KEY, "gri_contributions", {
        select: "event_id",
        snapshot_id: `eq.${serviceSnapshot.id}`,
        order: "event_id.asc",
      }),
      rest(SERVICE_KEY, "gri_source_dispositions", {
        select: "event_id,disposition",
        snapshot_id: `eq.${serviceSnapshot.id}`,
        order: "event_id.asc",
      }),
      rest(ANON_KEY, "gri_source_dispositions", {
        select: "event_id,disposition",
        snapshot_id: `eq.${serviceSnapshot.id}`,
        order: "event_id.asc",
      }),
    ]);

  const serviceContributionIds = sortedIds(serviceContributions);
  const anonContributionIds = sortedIds(anonContributions);
  const serviceIncludedIds = sortedIds(
    serviceDispositions.filter((row) => row.disposition === "included"),
  );
  const anonIncludedIds = sortedIds(
    anonDispositions.filter((row) => row.disposition === "included"),
  );

  const serviceDispositionShape = serviceDispositions
    .map((row) => `${String(row.event_id)}:${String(row.disposition)}`)
    .sort();
  const anonDispositionShape = anonDispositions
    .map((row) => `${String(row.event_id)}:${String(row.disposition)}`)
    .sort();

  const serviceValidationRuns = await rest(SERVICE_KEY, "gri_validation_runs", {
    select: "id,methodology_version,validation_version,evidence_mode,status,sample_count,benchmark_count,result_hash,published_at",
    methodology_version: `eq.${METHOD_VERSION}`,
    published_at: "not.is.null",
    order: "published_at.desc",
    limit: "1",
  });

  let validationAvailable = false;
  let validationRunParity = true;
  let validationMetricCountParity = true;
  let validationMetricCount = 0;

  if (serviceValidationRuns.length > 0) {
    validationAvailable = true;
    const serviceRun = serviceValidationRuns[0];
    const anonRuns = await rest(ANON_KEY, "gri_validation_runs", {
      select: "id,methodology_version,validation_version,evidence_mode,status,sample_count,benchmark_count,result_hash,published_at",
      id: `eq.${serviceRun.id}`,
      limit: "1",
    });
    const anonRun = anonRuns[0] ?? null;
    validationRunParity = Boolean(anonRun) && stable(serviceRun) === stable(anonRun);

    const [serviceMetrics, anonMetrics] = await Promise.all([
      rest(SERVICE_KEY, "gri_validation_metrics", {
        select: "benchmark_key,horizon_hours,split,sample_count",
        validation_run_id: `eq.${serviceRun.id}`,
        order: "benchmark_key.asc,horizon_hours.asc,split.asc",
      }),
      rest(ANON_KEY, "gri_validation_metrics", {
        select: "benchmark_key,horizon_hours,split,sample_count",
        validation_run_id: `eq.${serviceRun.id}`,
        order: "benchmark_key.asc,horizon_hours.asc,split.asc",
      }),
    ]);
    validationMetricCount = serviceMetrics.length;
    validationMetricCountParity = stable(serviceMetrics) === stable(anonMetrics);
  }

  const eventCount = Number(serviceSnapshot.event_count);
  const candidateCount = Number(serviceSnapshot.candidate_event_count);
  const storyCount = Number(serviceSnapshot.independent_story_count);
  const reconciliationResidual = finite(serviceSnapshot.reconciliation_residual);
  const changeResidual = finite(serviceSnapshot.change_residual);
  const snapshotTime = Date.parse(String(serviceSnapshot.as_of));
  const snapshotAgeHours = Number.isFinite(snapshotTime)
    ? (Date.now() - snapshotTime) / 3_600_000
    : null;

  const checks = {
    anonSnapshotVisible: Boolean(anonSnapshot),
    snapshotFieldParity:
      Boolean(anonSnapshot) && exactObjectParity(serviceSnapshot, anonSnapshot, snapshotFields),
    publishedStatus: serviceSnapshot.status === "published",
    verifiedStatus: serviceSnapshot.verification_status === "verified",
    methodologyVersion: serviceSnapshot.methodology_version === METHOD_VERSION,
    proofVersion: serviceSnapshot.proof_version === PROOF_VERSION,
    storyCorrelationVersion: serviceSnapshot.story_correlation_version === STORY_VERSION,
    storyCorrelationPromptVersion:
      serviceSnapshot.story_correlation_prompt_version === STORY_PROMPT_VERSION,
    eventCountValid: Number.isInteger(eventCount) && eventCount > 0,
    independentStoryCountValid:
      Number.isInteger(storyCount) && storyCount > 0 && storyCount <= eventCount,
    candidateCountValid:
      Number.isInteger(candidateCount) && candidateCount >= eventCount,
    requiredHashesValid: [
      serviceSnapshot.methodology_hash,
      serviceSnapshot.input_hash,
      serviceSnapshot.evidence_hash,
      serviceSnapshot.calculation_hash,
      serviceSnapshot.disposition_hash,
      serviceSnapshot.proof_hash,
    ].every((value) => HASH_RE.test(String(value ?? ""))),
    residualsReconcile:
      (reconciliationResidual === null || Math.abs(reconciliationResidual) <= 1e-7) &&
      (changeResidual === null || Math.abs(changeResidual) <= 1e-7),
    serviceContributionCount: serviceContributions.length === eventCount,
    anonContributionCount: anonContributions.length === eventCount,
    contributionMembershipParity: sameStrings(serviceContributionIds, anonContributionIds),
    serviceDispositionCount: serviceDispositions.length === candidateCount,
    anonDispositionCount: anonDispositions.length === candidateCount,
    dispositionRowParity: sameStrings(serviceDispositionShape, anonDispositionShape),
    serviceIncludedMatchesContributions: sameStrings(
      serviceIncludedIds,
      serviceContributionIds,
    ),
    anonIncludedMatchesContributions: sameStrings(anonIncludedIds, anonContributionIds),
    validationRunParity,
    validationMetricParity: validationMetricCountParity,
  };

  const verified = Object.values(checks).every(Boolean);
  const evidence = {
    evidenceVersion: "gri-public-proof-consistency-v1.0.0",
    auditedAt: new Date().toISOString(),
    snapshotId: serviceSnapshot.id,
    snapshotAsOf: serviceSnapshot.as_of,
    snapshotAgeHours:
      snapshotAgeHours === null ? null : Number(snapshotAgeHours.toFixed(4)),
    methodologyVersion: serviceSnapshot.methodology_version,
    proofVersion: serviceSnapshot.proof_version,
    displayScore: serviceSnapshot.display_score,
    rawScore: finite(serviceSnapshot.raw_score),
    eventCount,
    candidateEventCount: candidateCount,
    independentStoryCount: storyCount,
    contributionCount: serviceContributions.length,
    dispositionCount: serviceDispositions.length,
    validationAvailable,
    validationMetricCount,
    hashes: {
      methodologyHash: serviceSnapshot.methodology_hash,
      inputHash: serviceSnapshot.input_hash,
      evidenceHash: serviceSnapshot.evidence_hash,
      calculationHash: serviceSnapshot.calculation_hash,
      dispositionHash: serviceSnapshot.disposition_hash,
      changeHash: serviceSnapshot.change_hash,
      proofHash: serviceSnapshot.proof_hash,
    },
    checks,
    verified,
    scope:
      "Single persisted live snapshot parity across service-role and anon/RLS reads plus public proof ledgers. This is not sustained freshness, calibration, SLA, certification, or an independent external audit.",
  };

  await writeEvidence(evidence);
  console.log(JSON.stringify(evidence, null, 2));
  if (!verified) process.exitCode = 1;
}

main().catch(async (error) => {
  const evidence = {
    evidenceVersion: "gri-public-proof-consistency-v1.0.0",
    auditedAt: new Date().toISOString(),
    verified: false,
    error: error instanceof Error ? error.message : String(error),
    scope:
      "Read-only persisted GRI parity audit failed before verification completed.",
  };
  try {
    await writeEvidence(evidence);
  } catch {}
  console.error(`GRI public proof consistency audit failed: ${evidence.error}`);
  process.exit(1);
});
