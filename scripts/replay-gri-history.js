#!/usr/bin/env node
/**
 * Retrospective GRI replay for calibration and methodology testing.
 *
 * IMPORTANT: this is not a claim that Geomacro published these scores in real
 * time. Historical rows are replayed using their stored created_at timestamp as
 * the observation-time proxy, while classification labels may have been
 * generated later. Every run is therefore permanently tagged
 * `retrospective_replay` / lookahead_safe=false.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  GRI_LOOKBACK_HOURS,
  GRI_METHOD_VERSION,
  GRI_STORY_CORRELATION_VERSION,
  GRI_STORY_CORRELATION_PROMPT_VERSION,
  calculateGri,
  canonicalJson,
} from './lib/gri-engine-v11.js';
import {
  GRI_PROOF_VERSION,
  buildProofArtifacts,
  reconcilesWithinTolerance,
  roundNumber,
  sha256,
} from './lib/gri-proof-v11.js';

dotenv.config();

const argv = process.argv.slice(2);
function arg(name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
function intArg(name, fallback) {
  const value = Number(arg(name, fallback));
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

const cadenceHours = intArg('--cadence-hours', 24);
const startArg = arg('--start');
const endArg = arg('--end');
const dryRun = argv.includes('--dry-run');
const replayVersion = 'gri-replay-v1.1.0';

const url = process.env.SUPABASE_URL || process.env.APP_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL/APP_SUPABASE_URL and service-role key are required');
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const SELECT_FIELDS = [
  'id','category','severity','confidence','created_at','published_at',
  'source_name','source_domain','source_url','source_title','summary',
  'classification_provider','classification_model','classification_version',
  'classification_prompt_version','classification_scored_at','classification_input_hash',
].join(',');

function hasCanonicalClassificationProvenance(row) {
  if (!row) return false;

  const classificationVersion = String(row.classification_version || '').trim();
  const provider = String(row.classification_provider || '').trim();
  const model = String(row.classification_model || '').trim();
  const promptVersion = String(row.classification_prompt_version || '').trim();
  const inputHash = String(row.classification_input_hash || '').trim();
  const scoredAt = Date.parse(String(row.classification_scored_at || ''));

  return Boolean(
    classificationVersion === CANONICAL_CLASSIFICATION_VERSION &&
      promptVersion === CANONICAL_CLASSIFICATION_PROMPT_VERSION &&
      provider &&
      model &&
      Number.isFinite(scoredAt) &&
      /^[a-f0-9]{64}$/i.test(inputHash)
  );
}

function hasCanonicalStoryProvenance(row) {
  if (!row) return false;

  const clusterId = String(row.story_cluster_id || '').trim();
  const label = String(row.story_canonical_label || '').trim();
  const decision = String(row.story_assignment_decision || '').trim();
  const rationale = String(row.story_decision_rationale || '').trim();
  const provider = String(row.story_clustering_provider || '').trim();
  const model = String(row.story_clustering_model || '').trim();
  const version = String(row.story_clustering_version || '').trim();
  const promptVersion = String(row.story_clustering_prompt_version || '').trim();
  const inputHash = String(row.story_clustering_input_hash || '').trim().toLowerCase();
  const scoredAt = Date.parse(String(row.story_clustering_scored_at || ''));
  const matchConfidence = Number(row.story_match_confidence);

  return Boolean(
    clusterId &&
      label &&
      ['anchor', 'matched'].includes(decision) &&
      rationale &&
      provider &&
      model &&
      version === GRI_STORY_CORRELATION_VERSION &&
      promptVersion === GRI_STORY_CORRELATION_PROMPT_VERSION &&
      Number.isFinite(scoredAt) &&
      Number.isFinite(matchConfidence) &&
      matchConfidence >= 0 &&
      matchConfidence <= 100 &&
      /^[a-f0-9]{64}$/i.test(inputHash)
  );
}

async function attachCurrentStoryProvenance(events) {
  if (events.length === 0) return events;

  const eventIds = events.map((row) => row.id);
  const assignmentsByEventId = new Map();
  const batchSize = 250;

  for (let i = 0; i < eventIds.length; i += batchSize) {
    const ids = eventIds.slice(i, i + batchSize);

    const { data, error } = await supabase
      .from('gri_story_assignments')
      .select(
        [
          'cluster_id',
          'event_id',
          'category',
          'decision',
          'match_confidence',
          'decision_rationale',
          'clustering_provider',
          'clustering_model',
          'clustering_version',
          'clustering_prompt_version',
          'clustering_scored_at',
          'clustering_input_hash',
        ].join(',')
      )
      .in('event_id', ids)
      .eq('clustering_version', GRI_STORY_CORRELATION_VERSION)
      .eq(
        'clustering_prompt_version',
        GRI_STORY_CORRELATION_PROMPT_VERSION
      );

    if (error) {
      throw new Error(
        `GRI story-assignment query failed: ${error.message}`
      );
    }

    for (const assignment of data ?? []) {
      if (assignmentsByEventId.has(assignment.event_id)) {
        throw new Error(
          `GRI v1.1 story provenance rejected: duplicate current-contract ` +
          `assignment for event ${assignment.event_id}`
        );
      }

      assignmentsByEventId.set(
        assignment.event_id,
        assignment
      );
    }
  }

  const missingAssignments = eventIds.filter(
    (id) => !assignmentsByEventId.has(id)
  );

  if (missingAssignments.length > 0) {
    throw new Error(
      `GRI v1.1 calculation blocked: ${missingAssignments.length} canonical ` +
      `event(s) have no ${GRI_STORY_CORRELATION_VERSION} assignment: ` +
      missingAssignments.slice(0, 12).join(', ')
    );
  }

  const clusterIds = [
    ...new Set(
      [...assignmentsByEventId.values()].map(
        (assignment) => assignment.cluster_id
      )
    ),
  ];

  const clustersById = new Map();

  for (let i = 0; i < clusterIds.length; i += batchSize) {
    const ids = clusterIds.slice(i, i + batchSize);

    const { data, error } = await supabase
      .from('gri_story_clusters')
      .select(
        [
          'id',
          'category',
          'canonical_label',
          'clustering_provider',
          'clustering_model',
          'clustering_version',
          'clustering_prompt_version',
          'clustering_scored_at',
          'clustering_input_hash',
        ].join(',')
      )
      .in('id', ids);

    if (error) {
      throw new Error(
        `GRI story-cluster query failed: ${error.message}`
      );
    }

    for (const cluster of data ?? []) {
      clustersById.set(cluster.id, cluster);
    }
  }

  const enriched = events.map((event) => {
    const assignment = assignmentsByEventId.get(event.id);
    const cluster = clustersById.get(assignment.cluster_id);

    if (!cluster) {
      throw new Error(
        `GRI v1.1 story provenance rejected: cluster ` +
        `${assignment.cluster_id} for event ${event.id} does not exist`
      );
    }

    if (
      assignment.category !== event.category ||
      cluster.category !== event.category
    ) {
      throw new Error(
        `GRI v1.1 story/category mismatch for event ${event.id}: ` +
        `event=${event.category}, assignment=${assignment.category}, ` +
        `cluster=${cluster.category}`
      );
    }

    if (
      cluster.clustering_version !==
        GRI_STORY_CORRELATION_VERSION ||
      cluster.clustering_prompt_version !==
        GRI_STORY_CORRELATION_PROMPT_VERSION
    ) {
      throw new Error(
        `GRI v1.1 rejected non-current story cluster ${cluster.id}`
      );
    }

    const row = {
      ...event,
      story_cluster_id: assignment.cluster_id,
      story_canonical_label: cluster.canonical_label,
      story_assignment_decision: assignment.decision,
      story_match_confidence: assignment.match_confidence,
      story_decision_rationale: assignment.decision_rationale,
      story_clustering_provider:
        assignment.clustering_provider,
      story_clustering_model:
        assignment.clustering_model,
      story_clustering_version:
        assignment.clustering_version,
      story_clustering_prompt_version:
        assignment.clustering_prompt_version,
      story_clustering_scored_at:
        assignment.clustering_scored_at,
      story_clustering_input_hash:
        assignment.clustering_input_hash,
    };

    if (!hasCanonicalStoryProvenance(row)) {
      throw new Error(
        `GRI v1.1 story provenance rejected for event ${event.id}`
      );
    }

    return row;
  });

  console.log(
    `GRI v1.1 story provenance: ${enriched.length} assigned event(s), ` +
    `${new Set(enriched.map((row) => row.story_cluster_id)).size} independent story cluster(s).`
  );

  return enriched;
}

async function firstEvent(desc = false) {
  const { data, error } = await supabase
    .from('events')
    .select('created_at')
    .not('created_at', 'is', null)
    .order('created_at', { ascending: !desc })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`event boundary query failed: ${error.message}`);
  return data?.created_at ?? null;
}

function parseTime(value, label) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) throw new Error(`Invalid ${label}: ${value}`);
  return d;
}

function floorUtcHour(date) {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

async function resolveRange() {
  const earliest = startArg ?? await firstEvent(false);
  const latest = endArg ?? await firstEvent(true);
  if (!earliest || !latest) throw new Error('No historical events are available for replay');
  const start = floorUtcHour(parseTime(earliest, '--start'));
  const end = floorUtcHour(parseTime(latest, '--end'));
  if (end < start) throw new Error('Replay --end must be >= --start');
  return { start, end };
}

async function fetchEvents(start, end) {
  const cutoff = new Date(start.getTime() - GRI_LOOKBACK_HOURS * 3_600_000).toISOString();
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('events')
      .select(SELECT_FIELDS)
      .gte('created_at', cutoff)
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`historical events query failed: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

function snapshotStorage(runId, calculation, proof) {
  return {
    replay_run_id: runId,
    as_of: calculation.asOf,
    raw_score: roundNumber(calculation.rawScore, 6),
    display_score: calculation.displayScore,
    coverage: roundNumber(calculation.coverage, 6),
    weighted_confidence: roundNumber(calculation.weightedConfidence, 6),
    event_count: calculation.eventCount,
    source_count: calculation.sourceCount,
    independent_story_count: calculation.independentStoryCount,
    story_correlation_version: GRI_STORY_CORRELATION_VERSION,
    story_correlation_prompt_version:
      GRI_STORY_CORRELATION_PROMPT_VERSION,
    category_breakdown: calculation.categories,
    methodology_hash: proof.methodologyHash,
    input_hash: proof.inputHash,
    evidence_hash: proof.evidenceHash,
    calculation_hash: proof.calculationHash,
    proof_version: GRI_PROOF_VERSION,
    proof_hash: proof.proofHash,
    reconciliation_residual:
      roundNumber(proof.reconciliationResidual, 12),
    proof_verified: proof.verified,
  };
}

async function writeSnapshotRows(rows) {
  const size = 400;
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await supabase.from('gri_replay_snapshots').insert(rows.slice(i, i + size));
    if (error) throw new Error(`replay snapshot insert failed: ${error.message}`);
  }
}

async function cleanup(runId) {
  try {
    await supabase.from('gri_replay_snapshots').delete().eq('replay_run_id', runId);
    await supabase.from('gri_replay_runs').delete().eq('id', runId).eq('status', 'draft');
  } catch {
    // Draft replay rows are hidden from public RLS if cleanup fails.
  }
}

async function main() {
  const { start, end } = await resolveRange();
  const events = await fetchEvents(start, end);

  // Replay v1.1 deliberately uses the same current-contract classification
  // and immutable story provenance required by live publication.
  //
  // This remains retrospective evidence reconstruction, not lookahead-safe
  // historical publication. Classification/story provenance may have been
  // generated after the historical as-of timestamp.
  const canonicalEvents = events.filter(hasCanonicalClassificationProvenance);
  const enrichedEvents = await attachCurrentStoryProvenance(canonicalEvents);

  const timed = enrichedEvents
    .map((row) => ({ row, t: new Date(row.created_at).getTime() }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);

  const planned = [];
  const cadenceMs = cadenceHours * 3_600_000;
  let left = 0;
  let right = 0;
  const active = [];

  for (let t = start.getTime(); t <= end.getTime(); t += cadenceMs) {
    while (right < timed.length && timed[right].t <= t) {
      active.push(timed[right]);
      right += 1;
    }
    const minT = t - GRI_LOOKBACK_HOURS * 3_600_000;
    while (left < active.length && active[left].t < minT) left += 1;
    const windowRows = active.slice(left).map((x) => x.row);
    const calculation = calculateGri(windowRows, new Date(t));
    const proof = buildProofArtifacts(calculation, null);
    if (!proof.verified) throw new Error(`Replay proof failed at ${calculation.asOf}`);
    planned.push({ calculation, proof });
  }

  const manifest = planned.map(({ calculation, proof }) => ({
    asOf: calculation.asOf,
    rawScore: roundNumber(calculation.rawScore, 6),
    displayScore: calculation.displayScore,
    coverage: roundNumber(calculation.coverage, 6),
    eventCount: calculation.eventCount,
    sourceCount: calculation.sourceCount,
    independentStoryCount: calculation.independentStoryCount,
    methodologyHash: proof.methodologyHash,
    inputHash: proof.inputHash,
    evidenceHash: proof.evidenceHash,
    calculationHash: proof.calculationHash,
    proofHash: proof.proofHash,
    reconciliationResidual:
      roundNumber(proof.reconciliationResidual, 12),
  }));
  const resultHash = sha256(canonicalJson({
    replayVersion,
    methodologyVersion: GRI_METHOD_VERSION,
    proofVersion: GRI_PROOF_VERSION,
    evidenceMode: 'retrospective_replay',
    observationTimeRule: 'created_at_retrospective',
    lookaheadSafe: false,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    cadenceHours,
    snapshots: manifest,
  }));

  const scored = planned.filter((x) => x.calculation.rawScore !== null).length;
  console.log(JSON.stringify({
    replayVersion,
    methodologyVersion: GRI_METHOD_VERSION,
    proofVersion: GRI_PROOF_VERSION,
    evidenceMode: 'retrospective_replay',
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    cadenceHours,
    sourceEvents: events.length,
    canonicalCurrentContractEvents: enrichedEvents.length,
    snapshots: planned.length,
    scoredSnapshots: scored,
    resultHash,
    warning: 'Retrospective calibration only. Current-contract classifications and story assignments may have been produced after the historical as-of time. This is not historical live or out-of-sample performance.',
  }, null, 2));
  if (dryRun) return;

  const { data: run, error: runError } = await supabase.from('gri_replay_runs').insert({
    methodology_version: GRI_METHOD_VERSION,
    replay_version: replayVersion,
    proof_version: GRI_PROOF_VERSION,
    story_correlation_version: GRI_STORY_CORRELATION_VERSION,
    story_correlation_prompt_version:
      GRI_STORY_CORRELATION_PROMPT_VERSION,
    status: 'draft',
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    cadence_hours: cadenceHours,
    observation_time_rule: 'created_at_retrospective',
    lookahead_safe: false,
    snapshot_count: planned.length,
    result_hash: resultHash,
    notes: 'Retrospective calibration replay under gri-v1.1.0. Historical created_at is used as an observation-time proxy; current-contract classifications and immutable story assignments may have been generated later. lookahead_safe=false. Never present this run as historical live/OOS performance.',
  }).select('id').single();
  if (runError) throw new Error(`replay run insert failed: ${runError.message}`);

  try {
    await writeSnapshotRows(planned.map(({ calculation, proof }) => snapshotStorage(run.id, calculation, proof)));
    const { data: storedReplayRows, error: replayVerifyError } =
      await supabase
        .from('gri_replay_snapshots')
        .select(
          [
            'as_of',
            'event_count',
            'independent_story_count',
            'story_correlation_version',
            'story_correlation_prompt_version',
            'proof_version',
            'proof_hash',
            'reconciliation_residual',
            'proof_verified',
          ].join(',')
        )
        .eq('replay_run_id', run.id);

    if (replayVerifyError) {
      throw new Error(
        `replay verification query failed: ${replayVerifyError.message}`
      );
    }

    if ((storedReplayRows ?? []).length !== planned.length) {
      throw new Error(
        `replay row-count mismatch: expected ${planned.length}, ` +
        `stored ${(storedReplayRows ?? []).length}`
      );
    }

    for (const row of storedReplayRows ?? []) {
      if (
        row.proof_version !== GRI_PROOF_VERSION ||
        !/^[a-f0-9]{64}$/i.test(String(row.proof_hash || '')) ||
        row.proof_verified !== true ||
        row.story_correlation_version !==
          GRI_STORY_CORRELATION_VERSION ||
        row.story_correlation_prompt_version !==
          GRI_STORY_CORRELATION_PROMPT_VERSION ||
        !Number.isInteger(Number(row.independent_story_count)) ||
        Number(row.independent_story_count) < 0 ||
        Number(row.independent_story_count) >
          Number(row.event_count) ||
        !reconcilesWithinTolerance(
          row.reconciliation_residual === null
            ? null
            : Number(row.reconciliation_residual)
        )
      ) {
        throw new Error(
          `replay stored proof-envelope verification failed at ${row.as_of}`
        );
      }
    }

    const { error: publishError } = await supabase.from('gri_replay_runs').update({
      status: 'published',
      published_at: new Date().toISOString(),
    }).eq('id', run.id).eq('status', 'draft');
    if (publishError) throw new Error(`replay publication failed: ${publishError.message}`);
    console.log(`Published retrospective replay run ${run.id}`);
  } catch (error) {
    await cleanup(run.id);
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
