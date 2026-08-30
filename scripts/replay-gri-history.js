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
  calculateGri,
  canonicalJson,
} from '../src/lib/gri-engine.js';
import { buildProofArtifacts, roundNumber, sha256 } from './lib/gri-proof.js';

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
const replayVersion = 'gri-replay-v1.0.0';

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
    category_breakdown: calculation.categories,
    methodology_hash: proof.methodologyHash,
    input_hash: proof.inputHash,
    evidence_hash: proof.evidenceHash,
    calculation_hash: proof.calculationHash,
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
  const timed = events
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
    methodologyHash: proof.methodologyHash,
    inputHash: proof.inputHash,
    evidenceHash: proof.evidenceHash,
    calculationHash: proof.calculationHash,
  }));
  const resultHash = sha256(canonicalJson({
    replayVersion,
    methodologyVersion: GRI_METHOD_VERSION,
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
    evidenceMode: 'retrospective_replay',
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    cadenceHours,
    sourceEvents: events.length,
    snapshots: planned.length,
    scoredSnapshots: scored,
    resultHash,
    warning: 'Retrospective calibration only. Not a historical live or out-of-sample prediction claim.',
  }, null, 2));
  if (dryRun) return;

  const { data: run, error: runError } = await supabase.from('gri_replay_runs').insert({
    methodology_version: GRI_METHOD_VERSION,
    replay_version: replayVersion,
    status: 'draft',
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    cadence_hours: cadenceHours,
    observation_time_rule: 'created_at_retrospective',
    lookahead_safe: false,
    snapshot_count: planned.length,
    result_hash: resultHash,
    notes: 'Retrospective calibration replay. Historical created_at is used as an observation-time proxy; classifications may have been generated later. Never present this run as historical live/OOS performance.',
  }).select('id').single();
  if (runError) throw new Error(`replay run insert failed: ${runError.message}`);

  try {
    await writeSnapshotRows(planned.map(({ calculation, proof }) => snapshotStorage(run.id, calculation, proof)));
    const { count, error: countError } = await supabase
      .from('gri_replay_snapshots')
      .select('*', { count: 'exact', head: true })
      .eq('replay_run_id', run.id);
    if (countError) throw new Error(`replay verification query failed: ${countError.message}`);
    if (count !== planned.length) throw new Error(`replay row-count mismatch: expected ${planned.length}, stored ${count}`);

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
