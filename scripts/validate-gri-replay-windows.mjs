#!/usr/bin/env node

import {
  readFile,
} from 'node:fs/promises';
import {
  pathToFileURL,
} from 'node:url';

const HOUR_MS = 3_600_000;
const PROOF_HASH_RE = /^[a-f0-9]{64}$/i;
const EXPECTED_DIRECTIONS = new Set([
  'increase',
  'decrease',
  'unchanged',
]);

function usage() {
  console.error(
    'Usage: node scripts/validate-gri-replay-windows.mjs <snapshots.json> [windows.json]',
  );
}

function parseTime(value, field) {
  const ms = Date.parse(String(value ?? ''));
  if (!Number.isFinite(ms)) {
    throw new Error(`${field} must be a valid timestamp`);
  }
  return ms;
}

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${field} must be finite`);
  }
  return number;
}

function positive(value, field) {
  const number = finite(value, field);
  if (number <= 0) {
    throw new Error(`${field} must be greater than zero`);
  }
  return number;
}

function boundedCoverage(value, field) {
  const number = finite(value, field);
  if (number < 0 || number > 1) {
    throw new Error(`${field} must be between 0 and 1`);
  }
  return number;
}

function requiredString(value, field) {
  const text = String(value ?? '').trim();
  if (!text) {
    throw new Error(`${field} is required`);
  }
  return text;
}

function normalizeSnapshots(input) {
  if (!Array.isArray(input)) {
    throw new Error('snapshots must be a JSON array');
  }

  const rows = input
    .map((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new Error(`snapshots[${index}] must be an object`);
      }

      const coverage =
        row.coverage === null || row.coverage === undefined
          ? null
          : boundedCoverage(
              row.coverage,
              `snapshots[${index}].coverage`,
            );

      return {
        as_of: String(row.as_of ?? ''),
        at: parseTime(row.as_of, `snapshots[${index}].as_of`),
        raw_score:
          row.raw_score === null || row.raw_score === undefined
            ? null
            : finite(
                row.raw_score,
                `snapshots[${index}].raw_score`,
              ),
        display_score:
          row.display_score === null || row.display_score === undefined
            ? null
            : finite(
                row.display_score,
                `snapshots[${index}].display_score`,
              ),
        coverage,
        proof_verified: row.proof_verified === true,
        proof_version: String(row.proof_version ?? '').trim(),
        proof_hash: String(row.proof_hash ?? '').trim(),
      };
    })
    .sort((a, b) => a.at - b.at);

  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1].at === rows[index].at) {
      throw new Error(
        `duplicate snapshot timestamp: ${rows[index].as_of}`,
      );
    }
  }

  return rows;
}

function normalizeProtocol(protocol) {
  if (
    !protocol ||
    typeof protocol !== 'object' ||
    Array.isArray(protocol) ||
    !Array.isArray(protocol.windows) ||
    protocol.windows.length === 0
  ) {
    throw new Error('validation protocol is invalid');
  }

  const protocolVersion = requiredString(
    protocol.protocol_version,
    'protocol_version',
  );
  const methodologyVersion = requiredString(
    protocol.methodology_version,
    'methodology_version',
  );
  const proofVersion = requiredString(
    protocol.proof_version,
    'proof_version',
  );
  const evidenceClass = requiredString(
    protocol.evidence_class,
    'evidence_class',
  );

  if (evidenceClass !== 'retrospective_replay') {
    throw new Error(
      'this validator only supports retrospective_replay evidence',
    );
  }
  if (protocol.lookahead_safe !== false) {
    throw new Error(
      'retrospective replay protocol must set lookahead_safe=false',
    );
  }
  if (
    protocol.lookahead_safe_required_for_predictive_claims !== true
  ) {
    throw new Error(
      'lookahead_safe_required_for_predictive_claims must be true',
    );
  }

  const maxSnapshotDistanceHours = positive(
    protocol.max_snapshot_distance_hours,
    'max_snapshot_distance_hours',
  );

  const seenIds = new Set();
  const windows = protocol.windows.map((window, index) => {
    if (!window || typeof window !== 'object' || Array.isArray(window)) {
      throw new Error(`windows[${index}] must be an object`);
    }

    const id = requiredString(window.id, `windows[${index}].id`);
    if (seenIds.has(id)) {
      throw new Error(`duplicate validation window id: ${id}`);
    }
    seenIds.add(id);

    const expectedDirection = requiredString(
      window.expected_direction,
      `${id}.expected_direction`,
    ).toLowerCase();
    if (!EXPECTED_DIRECTIONS.has(expectedDirection)) {
      throw new Error(
        `${id}.expected_direction must be increase, decrease or unchanged`,
      );
    }

    const minimumCoverage = boundedCoverage(
      window.minimum_coverage,
      `${id}.minimum_coverage`,
    );
    const baselineHoursBefore = positive(
      window.baseline_hours_before,
      `${id}.baseline_hours_before`,
    );
    const evaluationHoursAfter = positive(
      window.evaluation_hours_after,
      `${id}.evaluation_hours_after`,
    );
    const claimBoundary = requiredString(
      window.claim_boundary,
      `${id}.claim_boundary`,
    );
    if (claimBoundary !== 'methodology_response_only') {
      throw new Error(
        `${id}.claim_boundary must be methodology_response_only`,
      );
    }

    return {
      ...window,
      id,
      label: requiredString(window.label, `${id}.label`),
      event_at: requiredString(window.event_at, `${id}.event_at`),
      event_at_ms: parseTime(window.event_at, `${id}.event_at`),
      baseline_hours_before: baselineHoursBefore,
      evaluation_hours_after: evaluationHoursAfter,
      expected_direction: expectedDirection,
      minimum_coverage: minimumCoverage,
      claim_boundary: claimBoundary,
    };
  });

  return {
    protocol_version: protocolVersion,
    methodology_version: methodologyVersion,
    proof_version: proofVersion,
    evidence_class: evidenceClass,
    lookahead_safe: false,
    max_snapshot_distance_hours: maxSnapshotDistanceHours,
    windows,
  };
}

function closestSnapshot(rows, targetMs, side, maxDistanceMs) {
  const eligible = rows.filter((row) =>
    side === 'before'
      ? row.at <= targetMs
      : row.at >= targetMs,
  );

  if (eligible.length === 0) return null;

  const row = eligible.reduce((best, candidate) => {
    if (!best) return candidate;
    const currentDistance = Math.abs(candidate.at - targetMs);
    const bestDistance = Math.abs(best.at - targetMs);
    return currentDistance < bestDistance ? candidate : best;
  }, null);

  const distanceMs = Math.abs(row.at - targetMs);
  if (distanceMs > maxDistanceMs) {
    return null;
  }

  return {
    row,
    distance_hours: distanceMs / HOUR_MS,
  };
}

function publicSnapshot(selection) {
  if (!selection) return null;
  return {
    as_of: selection.row.as_of,
    raw_score: selection.row.raw_score,
    display_score: selection.row.display_score,
    coverage: selection.row.coverage,
    proof_verified: selection.row.proof_verified,
    proof_version: selection.row.proof_version || null,
    proof_hash: selection.row.proof_hash || null,
    distance_hours: selection.distance_hours,
  };
}

function overallStatus(results) {
  if (results.some((row) => row.status === 'FAIL')) {
    return 'FAIL';
  }
  if (results.some((row) => row.status === 'INSUFFICIENT_DATA')) {
    return 'INSUFFICIENT_DATA';
  }
  return 'PASS';
}

export function validateReplayWindows(
  snapshotsInput,
  protocolInput,
) {
  const snapshots = normalizeSnapshots(snapshotsInput);
  const protocol = normalizeProtocol(protocolInput);
  const maxDistanceMs =
    protocol.max_snapshot_distance_hours * HOUR_MS;

  const results = protocol.windows.map((window) => {
    const baselineTarget =
      window.event_at_ms -
      window.baseline_hours_before * HOUR_MS;
    const evaluationTarget =
      window.event_at_ms +
      window.evaluation_hours_after * HOUR_MS;

    const baseline = closestSnapshot(
      snapshots,
      baselineTarget,
      'before',
      maxDistanceMs,
    );
    const evaluation = closestSnapshot(
      snapshots,
      evaluationTarget,
      'after',
      maxDistanceMs,
    );

    const insufficiencyReasons = [];
    if (!baseline) insufficiencyReasons.push('baseline_snapshot_missing_or_too_far');
    if (!evaluation) insufficiencyReasons.push('evaluation_snapshot_missing_or_too_far');
    if (baseline?.row.raw_score === null) insufficiencyReasons.push('baseline_raw_score_missing');
    if (evaluation?.row.raw_score === null) insufficiencyReasons.push('evaluation_raw_score_missing');
    if (baseline?.row.coverage === null) insufficiencyReasons.push('baseline_coverage_missing');
    if (evaluation?.row.coverage === null) insufficiencyReasons.push('evaluation_coverage_missing');

    if (insufficiencyReasons.length > 0) {
      return {
        id: window.id,
        label: window.label,
        status: 'INSUFFICIENT_DATA',
        expected_direction: window.expected_direction,
        direction_match: null,
        raw_delta: null,
        display_delta: null,
        coverage_ok: null,
        proof_verified: null,
        insufficiency_reasons: insufficiencyReasons,
        baseline: publicSnapshot(baseline),
        evaluation: publicSnapshot(evaluation),
        claim_boundary: window.claim_boundary,
      };
    }

    const rawDelta =
      evaluation.row.raw_score - baseline.row.raw_score;
    const directionMatch =
      window.expected_direction === 'increase'
        ? rawDelta > 0
        : window.expected_direction === 'decrease'
          ? rawDelta < 0
          : rawDelta === 0;

    const coverageOk =
      baseline.row.coverage >= window.minimum_coverage &&
      evaluation.row.coverage >= window.minimum_coverage;

    const proofOk = [baseline.row, evaluation.row].every(
      (row) =>
        row.proof_verified === true &&
        row.proof_version === protocol.proof_version &&
        PROOF_HASH_RE.test(row.proof_hash),
    );

    const failureReasons = [];
    if (!directionMatch) failureReasons.push('direction_mismatch');
    if (!coverageOk) failureReasons.push('coverage_below_minimum');
    if (!proofOk) failureReasons.push('proof_envelope_invalid_or_unverified');

    return {
      id: window.id,
      label: window.label,
      status: failureReasons.length === 0 ? 'PASS' : 'FAIL',
      expected_direction: window.expected_direction,
      direction_match: directionMatch,
      raw_delta: rawDelta,
      display_delta:
        baseline.row.display_score !== null &&
        evaluation.row.display_score !== null
          ? evaluation.row.display_score - baseline.row.display_score
          : null,
      coverage_ok: coverageOk,
      proof_verified: proofOk,
      failure_reasons: failureReasons,
      baseline: publicSnapshot(baseline),
      evaluation: publicSnapshot(evaluation),
      claim_boundary: window.claim_boundary,
    };
  });

  const evaluated = results.filter(
    (row) => row.status !== 'INSUFFICIENT_DATA',
  );
  const passed = results.filter((row) => row.status === 'PASS');
  const failed = results.filter((row) => row.status === 'FAIL');
  const insufficient = results.filter(
    (row) => row.status === 'INSUFFICIENT_DATA',
  );

  return {
    protocol_version: protocol.protocol_version,
    methodology_version: protocol.methodology_version,
    proof_version: protocol.proof_version,
    evidence_class: protocol.evidence_class,
    lookahead_safe: false,
    predictive_claim_allowed: false,
    max_snapshot_distance_hours:
      protocol.max_snapshot_distance_hours,
    overall_status: overallStatus(results),
    summary: {
      configured_windows: results.length,
      evaluated_windows: evaluated.length,
      passed_windows: passed.length,
      failed_windows: failed.length,
      insufficient_windows: insufficient.length,
      pass_rate:
        evaluated.length > 0
          ? passed.length / evaluated.length
          : null,
    },
    results,
    limitations: [
      'Retrospective replay can test methodology response and reproducibility but cannot establish real-time predictive performance when provenance was generated after the historical as-of time.',
      'This report trusts proof_verified as an upstream replay-validation result and additionally requires the expected proof version and a well-formed proof hash; it does not independently recompute each snapshot proof bundle.',
      'No predictive, causal, alpha, lead-time, uptime or production-SLA claim is permitted from this retrospective replay report.',
    ],
  };
}

async function main() {
  const [
    snapshotsPath,
    windowsPath = 'validation/gri-known-event-windows.v1.json',
  ] = process.argv.slice(2);

  if (!snapshotsPath) {
    usage();
    process.exit(2);
  }

  try {
    const [snapshots, protocol] = await Promise.all([
      readFile(snapshotsPath, 'utf8').then(JSON.parse),
      readFile(windowsPath, 'utf8').then(JSON.parse),
    ]);

    const report = validateReplayWindows(snapshots, protocol);
    console.log(JSON.stringify(report, null, 2));

    process.exit(report.overall_status === 'PASS' ? 0 : 1);
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'validation_failed',
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
