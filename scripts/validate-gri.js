#!/usr/bin/env node
import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { GRI_METHOD_VERSION, canonicalJson } from '../src/lib/gri-engine.js';

dotenv.config();
const VALIDATION_VERSION = 'gri-validation-v1.1.0';
const TRAIN_FRACTION = 0.70;
const HORIZONS = [24, 72, 168];
const MIN_ALL_SAMPLES = 30;
const MIN_TEST_SAMPLES = 10;
const HIGH_RISK_THRESHOLD = 75;

const args = process.argv.slice(2);
const replayIndex = args.indexOf('--replay-run');
const replayRunId = replayIndex >= 0 ? args[replayIndex + 1] : null;

const url = process.env.SUPABASE_URL || process.env.APP_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Supabase URL and service-role key are required');
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}
function finite(x) { const n = Number(x); return Number.isFinite(n) ? n : null; }
function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }
function stddev(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  const variance = xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}
function pearson(xs, ys) {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const mx = mean(xs); const my = mean(ys);
  let num = 0; let dx = 0; let dy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const a = xs[i] - mx; const b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : null;
}
function ranks(values) {
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v || a.i - b.i);
  const out = Array(values.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].v === sorted[i].v) j += 1;
    const rank = (i + 1 + j) / 2;
    for (let k = i; k < j; k += 1) out[sorted[k].i] = rank;
    i = j;
  }
  return out;
}
function spearman(xs, ys) { return xs.length >= 3 ? pearson(ranks(xs), ranks(ys)) : null; }
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}
function normalCdf(x) { return 0.5 * (1 + erf(x / Math.sqrt(2))); }
function correlationPApprox(r, n) {
  if (r === null || n < 4 || Math.abs(r) >= 1) return r === 1 || r === -1 ? 0 : null;
  const z = Math.atanh(r) * Math.sqrt(n - 3);
  return Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))));
}
function pctReturn(a, b) { return a === 0 ? null : (b - a) / Math.abs(a); }
function transformMove(def, current, future) {
  return def.transformation === 'pct_return' ? pctReturn(current, future) : future - current;
}
function sameOrAfter(observations, startIndex, targetMs, maxSkewHours = 36) {
  for (let i = startIndex; i < observations.length; i += 1) {
    const t = new Date(observations[i].observed_at).getTime();
    if (t >= targetMs) return t - targetMs <= maxSkewHours * 3_600_000 ? observations[i] : null;
  }
  return null;
}
function latestSnapshotAtOrBefore(snapshots, t) {
  let candidate = null;
  for (const s of snapshots) {
    const ms = new Date(s.as_of).getTime();
    if (ms <= t) candidate = s;
    else break;
  }
  return candidate;
}
function previousDailySnapshot(snapshots, current) {
  const currentMs = new Date(current.as_of).getTime();
  const target = currentMs - 24 * 3_600_000;
  let best = null; let bestGap = Infinity;
  for (const s of snapshots) {
    const t = new Date(s.as_of).getTime();
    if (t >= currentMs) break;
    const gap = Math.abs(t - target);
    if (gap < bestGap && gap <= 8 * 3_600_000) { best = s; bestGap = gap; }
  }
  return best;
}
function round(n, d = 6) {
  if (n === null || !Number.isFinite(Number(n))) return null;
  const f = 10 ** d; return Math.round(Number(n) * f) / f;
}

function metricForPairs(pairs, def, split) {
  const xs = pairs.map((p) => p.griLevel);
  const ys = pairs.map((p) => p.benchmarkLevel);
  const dx = pairs.filter((p) => p.griDelta !== null && p.futureMove !== null);
  const deltaX = dx.map((p) => p.griDelta);
  const deltaY = dx.map((p) => p.futureMove);
  const deltaR = pearson(deltaX, deltaY);

  const directional = def.risk_direction == null ? [] : dx.filter((p) => p.griDelta !== 0 && p.futureMove !== 0);
  const hits = directional.filter((p) => Math.sign(p.griDelta) === Math.sign(p.futureMove * def.risk_direction)).length;
  const high = def.risk_direction == null ? [] : dx.filter((p) => p.griDisplay >= HIGH_RISK_THRESHOLD);
  const falsePositives = high.filter((p) => p.futureMove * def.risk_direction <= 0).length;

  let highMeanZ = null; let baselineMeanZ = null; let effectZ = null;
  if (def.risk_direction != null && dx.length >= 3) {
    const stressMoves = dx.map((p) => p.futureMove * def.risk_direction);
    const m = mean(stressMoves); const sd = stddev(stressMoves);
    if (sd && sd > 0) {
      const withZ = dx.map((p) => ({ ...p, z: ((p.futureMove * def.risk_direction) - m) / sd }));
      const highZ = withZ.filter((p) => p.griDisplay >= HIGH_RISK_THRESHOLD).map((p) => p.z);
      const baseZ = withZ.filter((p) => p.griDisplay < HIGH_RISK_THRESHOLD).map((p) => p.z);
      highMeanZ = mean(highZ); baselineMeanZ = mean(baseZ);
      if (highMeanZ !== null && baselineMeanZ !== null) effectZ = highMeanZ - baselineMeanZ;
    }
  }

  return {
    split,
    sample_count: pairs.length,
    pearson_r: round(pearson(xs, ys)),
    spearman_rho: round(spearman(xs, ys)),
    delta_pearson_r: round(deltaR),
    delta_pearson_p_approx: round(correlationPApprox(deltaR, deltaX.length), 8),
    direction_hit_rate: directional.length ? round(hits / directional.length) : null,
    high_risk_event_count: high.length,
    false_positive_rate: high.length ? round(falsePositives / high.length) : null,
    event_study_high_mean_z: round(highMeanZ),
    event_study_baseline_mean_z: round(baselineMeanZ),
    event_study_effect_z: round(effectZ),
  };
}

async function fetchAll(table, select, configure = (q) => q) {
  const pageSize = 1000; const out = [];
  for (let from = 0; ; from += pageSize) {
    let q = supabase.from(table).select(select).range(from, from + pageSize - 1);
    q = configure(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table} query failed: ${error.message}`);
    const rows = data ?? []; out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

async function loadSnapshots() {
  if (!replayRunId) {
    const snapshots = await fetchAll(
      'gri_snapshots',
      'id,as_of,raw_score,display_score,methodology_version,status',
      (q) => q.eq('status', 'published').eq('methodology_version', GRI_METHOD_VERSION).not('raw_score', 'is', null).order('as_of', { ascending: true }),
    );
    return { snapshots, evidenceMode: 'live_oos', sourceReplayRunId: null, evidenceNote: 'True live published snapshots only.' };
  }

  const { data: run, error } = await supabase
    .from('gri_replay_runs')
    .select('id,methodology_version,status,observation_time_rule,lookahead_safe,notes')
    .eq('id', replayRunId)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw new Error(`replay run query failed: ${error.message}`);
  if (!run) throw new Error(`published replay run ${replayRunId} not found`);
  if (run.methodology_version !== GRI_METHOD_VERSION) throw new Error('replay methodology does not match current GRI methodology');
  const snapshots = await fetchAll(
    'gri_replay_snapshots',
    'as_of,raw_score,display_score',
    (q) => q.eq('replay_run_id', replayRunId).not('raw_score', 'is', null).order('as_of', { ascending: true }),
  );
  return {
    snapshots,
    evidenceMode: 'retrospective_replay',
    sourceReplayRunId: replayRunId,
    evidenceNote: 'Retrospective calibration using historical publisher timestamps. This is not proof that Geomacro emitted those scores in real time and is not labelled live out-of-sample.',
  };
}

async function main() {
  const source = await loadSnapshots();
  const snapshots = source.snapshots;
  const definitions = await fetchAll(
    'gri_benchmark_definitions',
    'benchmark_key,display_name,transformation,risk_direction,source_name,source_series_id,notes',
    (q) => q.eq('active', true).order('benchmark_key', { ascending: true }),
  );
  const observations = await fetchAll(
    'gri_benchmark_observations',
    'benchmark_key,observed_at,value,input_hash',
    (q) => q.order('observed_at', { ascending: true }),
  );

  const metrics = [];
  let maxSamples = 0;
  for (const def of definitions) {
    const obs = observations.filter((o) => o.benchmark_key === def.benchmark_key);
    for (const horizonHours of HORIZONS) {
      const pairs = [];
      for (let i = 0; i < obs.length; i += 1) {
        const at = new Date(obs[i].observed_at).getTime();
        const snapshot = latestSnapshotAtOrBefore(snapshots, at);
        if (!snapshot || at - new Date(snapshot.as_of).getTime() > 30 * 3_600_000) continue;
        const future = sameOrAfter(obs, i + 1, at + horizonHours * 3_600_000);
        if (!future) continue;
        const currentValue = finite(obs[i].value); const futureValue = finite(future.value);
        const griLevel = finite(snapshot.raw_score);
        if (currentValue === null || futureValue === null || griLevel === null) continue;
        const prev = previousDailySnapshot(snapshots, snapshot);
        const prevGri = prev ? finite(prev.raw_score) : null;
        pairs.push({
          at,
          griLevel,
          griDisplay: snapshot.display_score,
          griDelta: prevGri === null ? null : griLevel - prevGri,
          benchmarkLevel: currentValue,
          futureMove: transformMove(def, currentValue, futureValue),
        });
      }
      pairs.sort((a, b) => a.at - b.at);
      maxSamples = Math.max(maxSamples, pairs.length);
      const cut = Math.floor(pairs.length * TRAIN_FRACTION);
      const groups = [
        ['all', pairs],
        ['train', pairs.slice(0, cut)],
        ['test', pairs.slice(cut)],
      ];
      for (const [split, rows] of groups) {
        metrics.push({
          benchmark_key: def.benchmark_key,
          horizon_hours: horizonHours,
          ...metricForPairs(rows, def, split),
          notes: def.risk_direction == null
            ? 'Direction/event-study metrics intentionally omitted because no fixed risk direction is asserted for this benchmark. Correlation p-values are approximate Fisher-z diagnostics, not standalone proof.'
            : 'Correlation p-values are approximate Fisher-z diagnostics. Event-study z values are standardized within this benchmark/horizon/split.',
        });
      }
    }
  }

  const completed = metrics.some((m) => m.split === 'all' && m.sample_count >= MIN_ALL_SAMPLES) &&
    metrics.some((m) => m.split === 'test' && m.sample_count >= MIN_TEST_SAMPLES);
  const status = completed ? 'completed' : 'insufficient_data';
  const sampleTimes = snapshots.map((s) => new Date(s.as_of).getTime()).filter(Number.isFinite);
  const summary = {
    validationVersion: VALIDATION_VERSION,
    methodologyVersion: GRI_METHOD_VERSION,
    evidenceMode: source.evidenceMode,
    sourceReplayRunId: source.sourceReplayRunId,
    evidenceNote: source.evidenceNote,
    purpose: 'Empirical validation of association, standardized event-study response and forward relationships. Results do not establish causality or guarantee prediction.',
    trainFraction: TRAIN_FRACTION,
    horizonsHours: HORIZONS,
    minimumSamples: { all: MIN_ALL_SAMPLES, test: MIN_TEST_SAMPLES },
    highRiskThreshold: HIGH_RISK_THRESHOLD,
    benchmarkKeys: definitions.map((d) => d.benchmark_key),
    maxAvailablePairCount: maxSamples,
    claimPolicy: !completed
      ? 'Insufficient data: do not publish performance claims.'
      : source.evidenceMode === 'live_oos'
        ? 'Metrics may be displayed with sample counts and train/test labels; do not describe correlation as causation or predictive certainty.'
        : 'Retrospective calibration only. Do not describe replay metrics as historical live predictions or true out-of-sample performance.',
  };
  const resultHash = sha256(canonicalJson({ summary, metrics }));

  let runId = null;
  try {
    const { data: run, error: runError } = await supabase.from('gri_validation_runs').insert({
      methodology_version: GRI_METHOD_VERSION,
      validation_version: VALIDATION_VERSION,
      evidence_mode: source.evidenceMode,
      source_replay_run_id: source.sourceReplayRunId,
      status,
      sample_start: sampleTimes.length ? new Date(Math.min(...sampleTimes)).toISOString() : null,
      sample_end: sampleTimes.length ? new Date(Math.max(...sampleTimes)).toISOString() : null,
      sample_count: maxSamples,
      benchmark_count: definitions.length,
      train_fraction: TRAIN_FRACTION,
      result_hash: resultHash,
      summary,
    }).select('id').single();
    if (runError) throw new Error(`validation run insert failed: ${runError.message}`);
    runId = run.id;

    if (metrics.length) {
      const rows = metrics.map((m) => ({ validation_run_id: run.id, ...m }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from('gri_validation_metrics').insert(rows.slice(i, i + 500));
        if (error) throw new Error(`validation metric insert failed: ${error.message}`);
      }
    }

    const { error: publishError } = await supabase
      .from('gri_validation_runs')
      .update({ published_at: new Date().toISOString() })
      .eq('id', run.id)
      .is('published_at', null);
    if (publishError) throw new Error(`validation publication failed: ${publishError.message}`);

    console.log(JSON.stringify({ runId: run.id, status, evidenceMode: source.evidenceMode, resultHash, summary, metricsPublished: metrics.length }, null, 2));
  } catch (error) {
    if (runId) {
      await supabase.from('gri_validation_metrics').delete().eq('validation_run_id', runId);
      await supabase.from('gri_validation_runs').delete().eq('id', runId).is('published_at', null);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error('❌ GRI validation failed:', error?.stack || error?.message || error);
  process.exit(1);
});
