#!/usr/bin/env node

import {
  readFile,
} from 'node:fs/promises';

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

function normalizeSnapshots(input) {
  if (!Array.isArray(input)) {
    throw new Error('snapshots must be a JSON array');
  }

  return input
    .map((row, index) => ({
      as_of: String(row?.as_of ?? ''),
      at: parseTime(row?.as_of, `snapshots[${index}].as_of`),
      raw_score:
        row?.raw_score === null
          ? null
          : finite(row?.raw_score, `snapshots[${index}].raw_score`),
      display_score:
        row?.display_score === null ||
        row?.display_score === undefined
          ? null
          : finite(row?.display_score, `snapshots[${index}].display_score`),
      coverage:
        row?.coverage === null ||
        row?.coverage === undefined
          ? null
          : finite(row?.coverage, `snapshots[${index}].coverage`),
      proof_verified:
        row?.proof_verified === true,
    }))
    .sort((a, b) => a.at - b.at);
}

function closestSnapshot(rows, targetMs, side) {
  const eligible = rows.filter((row) =>
    side === 'before'
      ? row.at <= targetMs
      : row.at >= targetMs,
  );

  if (eligible.length === 0) return null;

  return eligible.reduce((best, row) => {
    if (!best) return row;
    const currentDistance = Math.abs(row.at - targetMs);
    const bestDistance = Math.abs(best.at - targetMs);
    return currentDistance < bestDistance
      ? row
      : best;
  }, null);
}

export function validateReplayWindows(
  snapshotsInput,
  protocol,
) {
  const snapshots = normalizeSnapshots(snapshotsInput);

  if (
    !protocol ||
    typeof protocol !== 'object' ||
    !Array.isArray(protocol.windows)
  ) {
    throw new Error('validation protocol is invalid');
  }

  const results = protocol.windows.map((window) => {
    const eventAt = parseTime(window.event_at, `${window.id}.event_at`);
    const baselineTarget =
      eventAt -
      finite(
        window.baseline_hours_before,
        `${window.id}.baseline_hours_before`,
      ) * 3_600_000;
    const evaluationTarget =
      eventAt +
      finite(
        window.evaluation_hours_after,
        `${window.id}.evaluation_hours_after`,
      ) * 3_600_000;

    const baseline =
      closestSnapshot(
        snapshots,
        baselineTarget,
        'before',
      );
    const evaluation =
      closestSnapshot(
        snapshots,
        evaluationTarget,
        'after',
      );

    if (
      !baseline ||
      !evaluation ||
      baseline.raw_score === null ||
      evaluation.raw_score === null
    ) {
      return {
        id: window.id,
        status: 'INSUFFICIENT_DATA',
        direction_match: null,
        raw_delta: null,
        baseline: baseline
          ? { as_of: baseline.as_of, raw_score: baseline.raw_score }
          : null,
        evaluation: evaluation
          ? { as_of: evaluation.as_of, raw_score: evaluation.raw_score }
          : null,
        claim_boundary: window.claim_boundary,
      };
    }

    const rawDelta =
      evaluation.raw_score - baseline.raw_score;
    const expected =
      String(window.expected_direction ?? '').toLowerCase();
    const directionMatch =
      expected === 'increase'
        ? rawDelta > 0
        : expected === 'decrease'
          ? rawDelta < 0
          : expected === 'unchanged'
            ? rawDelta === 0
            : false;

    const minimumCoverage =
      finite(
        window.minimum_coverage ?? 0,
        `${window.id}.minimum_coverage`,
      );

    const coverageOk =
      baseline.coverage !== null &&
      evaluation.coverage !== null
        ? baseline.coverage >= minimumCoverage &&
          evaluation.coverage >= minimumCoverage
        : minimumCoverage === 0;

    const proofOk =
      baseline.proof_verified &&
      evaluation.proof_verified;

    return {
      id: window.id,
      label: window.label,
      status:
        directionMatch && coverageOk && proofOk
          ? 'PASS'
          : 'FAIL',
      expected_direction: expected,
      direction_match: directionMatch,
      raw_delta: rawDelta,
      display_delta:
        baseline.display_score !== null &&
        evaluation.display_score !== null
          ? evaluation.display_score - baseline.display_score
          : null,
      coverage_ok: coverageOk,
      proof_verified: proofOk,
      baseline: {
        as_of: baseline.as_of,
        raw_score: baseline.raw_score,
        coverage: baseline.coverage,
      },
      evaluation: {
        as_of: evaluation.as_of,
        raw_score: evaluation.raw_score,
        coverage: evaluation.coverage,
      },
      claim_boundary: window.claim_boundary,
    };
  });

  const evaluated = results.filter(
    (row) => row.status !== 'INSUFFICIENT_DATA',
  );
  const passed = results.filter(
    (row) => row.status === 'PASS',
  );

  return {
    protocol_version: protocol.protocol_version,
    methodology_version: protocol.methodology_version,
    evidence_class: protocol.evidence_class,
    lookahead_safe:
      protocol.evidence_class === 'prospective_lookahead_safe',
    predictive_claim_allowed:
      protocol.evidence_class === 'prospective_lookahead_safe' &&
      protocol.lookahead_safe_required_for_predictive_claims === true,
    summary: {
      configured_windows: results.length,
      evaluated_windows: evaluated.length,
      passed_windows: passed.length,
      pass_rate:
        evaluated.length > 0
          ? passed.length / evaluated.length
          : null,
    },
    results,
    limitations: [
      'Retrospective replay can test methodology response and reproducibility but cannot establish real-time predictive performance when provenance was generated after the historical as-of time.',
      'No predictive, causal or trading-performance claim is permitted unless the evidence class is prospective_lookahead_safe.',
    ],
  };
}

async function main() {
  const [snapshotsPath, windowsPath = 'validation/gri-known-event-windows.v1.json'] =
    process.argv.slice(2);

  if (!snapshotsPath) {
    usage();
    process.exit(2);
  }

  try {
    const [snapshots, protocol] = await Promise.all([
      readFile(snapshotsPath, 'utf8').then(JSON.parse),
      readFile(windowsPath, 'utf8').then(JSON.parse),
    ]);

    const report = validateReplayWindows(
      snapshots,
      protocol,
    );

    console.log(JSON.stringify(report, null, 2));

    process.exit(
      report.summary.evaluated_windows > 0
        ? 0
        : 1,
    );
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

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
