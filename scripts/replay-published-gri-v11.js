#!/usr/bin/env node

/**
 * Deterministic replay of an already-published GRI proof package.
 *
 * This script does NOT:
 * - fetch live events
 * - call an LLM
 * - rerun classification
 * - rerun story correlation
 * - write to Supabase
 *
 * It reconstructs the published proof exclusively from persisted
 * snapshot, contribution, disposition, and previous-snapshot ledgers.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  attributeGriChange,
  calculateGri,
} from './lib/gri-engine-v11.js';
import {
  GRI_PROOF_VERSION,
  buildProofArtifacts,
  reconcilesWithinTolerance,
} from './lib/gri-proof-v11.js';
import {
  dispositionHash,
  dispositionStorageRowToCanonical,
} from './lib/gri-disposition-v11.js';

dotenv.config();

const argv = process.argv.slice(2);

function arg(name) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1]
    ? argv[index + 1]
    : null;
}

const snapshotId = arg('--snapshot-id');

if (!snapshotId) {
  throw new Error(
    'Published proof replay requires --snapshot-id <uuid>'
  );
}

const url =
  process.env.SUPABASE_URL ||
  process.env.APP_SUPABASE_URL;

const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    'SUPABASE_URL/APP_SUPABASE_URL and service-role key are required'
  );
}

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function loadSnapshot(id) {
  const { data, error } = await supabase
    .from('gri_snapshots')
    .select('*')
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle();

  if (error) {
    throw new Error(
      `snapshot query failed: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      `published snapshot ${id} not found`
    );
  }

  return data;
}

async function loadContributions(id) {
  const { data, error } = await supabase
    .from('gri_contributions')
    .select('*')
    .eq('snapshot_id', id)
    .order('event_id', { ascending: true });

  if (error) {
    throw new Error(
      `contribution query failed: ${error.message}`
    );
  }

  return data ?? [];
}

async function loadDispositions(id) {
  const { data, error } = await supabase
    .from('gri_source_dispositions')
    .select('*')
    .eq('snapshot_id', id)
    .order('event_id', { ascending: true });

  if (error) {
    throw new Error(
      `source disposition query failed: ${error.message}`
    );
  }

  return data ?? [];
}

function contributionRowsToInput(rows) {
  return rows.map((r) => ({
    id: r.event_id,
    category: r.category,
    severity: Number(r.severity),
    confidence: Number(r.confidence),

    created_at: r.observed_at,
    published_at: r.published_at,

    source_name: r.source_name,
    source_domain: r.source_domain,
    source_url: r.source_url,
    source_title: r.source_title,
    summary: r.summary,

    story_cluster_id: r.story_cluster_id,
    story_canonical_label:
      r.story_canonical_label,
    story_assignment_decision:
      r.story_assignment_decision,
    story_match_confidence:
      r.story_match_confidence,
    story_decision_rationale:
      r.story_decision_rationale,
    story_clustering_provider:
      r.story_clustering_provider,
    story_clustering_model:
      r.story_clustering_model,
    story_clustering_version:
      r.story_clustering_version,
    story_clustering_prompt_version:
      r.story_clustering_prompt_version,
    story_clustering_scored_at:
      r.story_clustering_scored_at,
    story_clustering_input_hash:
      r.story_clustering_input_hash,

    classification_provider:
      r.classification_provider,
    classification_model:
      r.classification_model,
    classification_version:
      r.classification_version,
    classification_prompt_version:
      r.classification_prompt_version,
    classification_scored_at:
      r.classification_scored_at,
    classification_input_hash:
      r.classification_input_hash,
  }));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`REPLAY FAIL: ${message}`);
  }
}

async function main() {
  const snapshot =
    await loadSnapshot(snapshotId);

  assert(
    snapshot.proof_version === GRI_PROOF_VERSION,
    `expected ${GRI_PROOF_VERSION}, received ${snapshot.proof_version}`
  );

  assert(
    snapshot.verification_status === 'verified',
    `snapshot verification_status is ${snapshot.verification_status}`
  );

  const rows =
    await loadContributions(snapshot.id);

  const dispositionRows =
    await loadDispositions(snapshot.id);

  assert(
    rows.length === Number(snapshot.event_count),
    `contribution count ${rows.length} does not match event_count ${snapshot.event_count}`
  );

  assert(
    dispositionRows.length ===
      Number(snapshot.candidate_event_count),
    `disposition count ${dispositionRows.length} does not match candidate_event_count ${snapshot.candidate_event_count}`
  );

  const includedIds = dispositionRows
    .filter(
      (row) => row.disposition === 'included'
    )
    .map((row) => String(row.event_id))
    .sort();

  const contributionIds = rows
    .map((row) => String(row.event_id))
    .sort();

  assert(
    includedIds.length === contributionIds.length &&
      includedIds.every(
        (id, index) =>
          id === contributionIds[index]
      ),
    'included disposition set does not exactly match contribution set'
  );

  const calculation = calculateGri(
    contributionRowsToInput(rows),
    new Date(snapshot.as_of)
  );

  let previous = null;

  if (snapshot.previous_snapshot_id) {
    const previousSnapshot =
      await loadSnapshot(
        snapshot.previous_snapshot_id
      );

    const previousRows =
      await loadContributions(
        previousSnapshot.id
      );

    assert(
      previousRows.length ===
        Number(previousSnapshot.event_count),
      'previous contribution ledger is incomplete'
    );

    previous = calculateGri(
      contributionRowsToInput(previousRows),
      new Date(previousSnapshot.as_of)
    );
  }

  const attribution = previous
    ? attributeGriChange(
        previous,
        calculation
      )
    : null;

  assert(
    calculation.methodologyVersion ===
      snapshot.methodology_version,
    'methodology version mismatch'
  );

  assert(
    calculation.displayScore ===
      snapshot.display_score,
    `display score mismatch: replay=${calculation.displayScore}, stored=${snapshot.display_score}`
  );

  assert(
    snapshot.raw_score === null
      ? calculation.rawScore === null
      : calculation.rawScore !== null &&
        Math.abs(
          Number(calculation.rawScore) -
            Number(snapshot.raw_score)
        ) <= 0.00001,
    `raw score mismatch: replay=${calculation.rawScore}, stored=${snapshot.raw_score}`
  );

  assert(
    Number(calculation.eventCount) ===
      Number(snapshot.event_count),
    'event count mismatch after deterministic recalculation'
  );

  assert(
    Number(calculation.independentStoryCount) ===
      Number(snapshot.independent_story_count),
    'independent story count mismatch after deterministic recalculation'
  );

  const canonicalDispositions =
    dispositionRows.map(
      dispositionStorageRowToCanonical
    );

  const replayDispositionHash =
    dispositionHash(
      canonicalDispositions
    );

  assert(
    replayDispositionHash ===
      snapshot.disposition_hash,
    'disposition hash mismatch'
  );

  const proof =
    buildProofArtifacts(
      calculation,
      attribution,
      {
        proofVersion:
          GRI_PROOF_VERSION,
        dispositionHash:
          replayDispositionHash,
      }
    );

  const checks = {
    methodologyHash:
      proof.methodologyHash ===
      snapshot.methodology_hash,

    inputHash:
      proof.inputHash ===
      snapshot.input_hash,

    evidenceHash:
      proof.evidenceHash ===
      snapshot.evidence_hash,

    calculationHash:
      proof.calculationHash ===
      snapshot.calculation_hash,

    dispositionHash:
      proof.dispositionHash ===
      snapshot.disposition_hash,

    changeHash:
      (proof.changeHash ?? null) ===
      (snapshot.change_hash ?? null),

    proofHash:
      proof.proofHash ===
      snapshot.proof_hash,

    scoreReconciles:
      reconcilesWithinTolerance(
        proof.reconciliationResidual
      ),

    changeReconciles:
      reconcilesWithinTolerance(
        proof.changeResidual
      ),
  };

  const failed =
    Object.entries(checks)
      .filter(([, value]) => !value)
      .map(([name]) => name);

  if (failed.length > 0) {
    console.error(
      JSON.stringify(
        {
          replay: 'FAILED',
          snapshotId: snapshot.id,
          proofVersion:
            snapshot.proof_version,
          failedChecks: failed,
          checks,
        },
        null,
        2
      )
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        replay: 'PASS',
        snapshotId: snapshot.id,
        asOf: snapshot.as_of,
        proofVersion:
          snapshot.proof_version,
        eventCount: rows.length,
        candidateEventCount:
          dispositionRows.length,
        dispositionHash:
          replayDispositionHash,
        proofHash:
          proof.proofHash,
        reconciliationResidual:
          proof.reconciliationResidual,
        changeResidual:
          proof.changeResidual,
        checks,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.stack
      : error
  );
  process.exitCode = 1;
});
