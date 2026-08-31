#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  GRI_LOOKBACK_HOURS,
  GRI_METHOD_VERSION,
  attributeGriChange,
  calculateGri,
} from '../src/lib/gri-engine.js';
import {
  GRI_PROOF_VERSION,
  buildProofArtifacts,
  roundNumber,
} from './lib/gri-proof.js';

dotenv.config();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const asOfArgIndex = args.indexOf('--as-of');
const asOf = asOfArgIndex >= 0 && args[asOfArgIndex + 1]
  ? new Date(args[asOfArgIndex + 1])
  : new Date();
if (!Number.isFinite(asOf.getTime())) throw new Error('Invalid --as-of timestamp');

const url = process.env.SUPABASE_URL || process.env.APP_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error('SUPABASE_URL/APP_SUPABASE_URL and service-role key are required');
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const CANONICAL_CLASSIFICATION_VERSION = 'event-severity-v1.0.2';
const CANONICAL_CLASSIFICATION_PROMPT_VERSION = 'risk-desk-filter-v1.0.2';

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

async function fetchAllEvents() {
  const cutoff = new Date(asOf.getTime() - GRI_LOOKBACK_HOURS * 3_600_000).toISOString();
  const pageSize = 1000;
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('events')
      .select([
        'id','category','severity','confidence','created_at','published_at',
        'source_name','source_domain','source_url','source_title','summary',
        'classification_provider','classification_model','classification_version',
        'classification_prompt_version','classification_scored_at','classification_input_hash',
      ].join(','))
      .gt('created_at', cutoff)
      .lte('created_at', asOf.toISOString())
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`events query failed: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  const eligible = out.filter(hasCanonicalClassificationProvenance);
  const excluded = out.length - eligible.length;

  console.log(
    `GRI input eligibility: using ${eligible.length} provenance-complete event(s); ` +
      `excluding ${excluded} legacy/incomplete event(s).`
  );

  return eligible;
}

function storedContributionToEngine(row) {
  return {
    eventId: row.event_id,
    category: row.category,
    sourceKey: row.source_key,
    sourceName: row.source_name,
    sourceDomain: row.source_domain,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    summary: row.summary,
    severity: Number(row.severity),
    confidence: Number(row.confidence),
    observedAt: row.observed_at,
    publishedAt: row.published_at,
    ageHours: Number(row.age_hours),
    confidenceWeight: Number(row.confidence_weight),
    decayWeight: Number(row.decay_weight),
    rawWeight: Number(row.raw_weight),
    effectiveEventWeight: Number(row.effective_event_weight),
    sourceEffectiveWeight: Number(row.source_effective_weight),
    categoryEffectiveWeight: Number(row.category_effective_weight),
    normalizedCategoryWeight: Number(row.normalized_category_weight),
    withinCategoryShare: Number(row.within_category_share),
    globalShare: Number(row.global_share),
    contributionPoints: Number(row.contribution_points),
    classificationProvider: row.classification_provider,
    classificationModel: row.classification_model,
    classificationVersion: row.classification_version,
    classificationPromptVersion: row.classification_prompt_version,
    classificationScoredAt: row.classification_scored_at,
    classificationInputHash: row.classification_input_hash,
  };
}

async function loadComparisonSnapshot() {
  // Change attribution is anchored to the closest verified snapshot around
  // T-24h, not simply the latest previous publication.
  //
  // IMPORTANT:
  // A historical snapshot is eligible for comparison only when every stored
  // contribution carries canonical classification provenance. This prevents
  // a legacy/unversioned -> provenance-complete data transition from being
  // presented as a real-world GRI movement.
  const target = new Date(asOf.getTime() - 24 * 3_600_000);
  const earliest = new Date(target.getTime() - 6 * 3_600_000);
  const latest = new Date(target.getTime() + 6 * 3_600_000);

  const { data: candidates, error } = await supabase
    .from('gri_snapshots')
    .select(
      'id,as_of,methodology_version,raw_score,display_score,coverage,weighted_confidence,active_categories,event_count,source_count,category_breakdown,verification_status'
    )
    .eq('status', 'published')
    .eq('verification_status', 'verified')
    .eq('methodology_version', GRI_METHOD_VERSION)
    .gte('as_of', earliest.toISOString())
    .lte('as_of', latest.toISOString())
    .order('as_of', { ascending: true });

  if (error) {
    throw new Error(`previous GRI snapshot query failed: ${error.message}`);
  }

  const orderedCandidates = (candidates ?? [])
    .filter((row) => row.raw_score !== null)
    .sort(
      (a, b) =>
        Math.abs(new Date(a.as_of).getTime() - target.getTime()) -
        Math.abs(new Date(b.as_of).getTime() - target.getTime())
    );

  for (const data of orderedCandidates) {
    const { data: contribRows, error: contribError } = await supabase
      .from('gri_contributions')
      .select('*')
      .eq('snapshot_id', data.id)
      .order('event_id', { ascending: true });

    if (contribError) {
      throw new Error(
        `previous GRI contributions query failed for ${data.id}: ${contribError.message}`
      );
    }

    const rows = contribRows ?? [];

    const canonicalComparison =
      rows.length > 0 && rows.every(hasCanonicalClassificationProvenance);

    if (!canonicalComparison) {
      console.log(
        `Skipping comparison snapshot ${data.id}: contribution ledger contains ` +
          `legacy/incomplete classification provenance.`
      );
      continue;
    }

    if (
      Number.isInteger(Number(data.event_count)) &&
      Number(data.event_count) !== rows.length
    ) {
      console.log(
        `Skipping comparison snapshot ${data.id}: stored event_count ` +
          `${data.event_count} does not match ${rows.length} contribution row(s).`
      );
      continue;
    }

    return {
      snapshotId: data.id,
      methodologyVersion: data.methodology_version,
      asOf: data.as_of,
      rawScore: Number(data.raw_score),
      displayScore: Number(data.display_score),
      coverage: Number(data.coverage),
      activeCategories: data.active_categories ?? [],
      eventCount: data.event_count,
      sourceCount: data.source_count,
      weightedConfidence:
        data.weighted_confidence === null
          ? null
          : Number(data.weighted_confidence),
      categories: Array.isArray(data.category_breakdown)
        ? data.category_breakdown
        : [],
      contributions: rows.map(storedContributionToEngine),
      inputRows: [],
    };
  }

  // Fail closed. Until a provenance-complete T-24h reference exists,
  // no change attribution is published.
  return null;
}

function contributionStorageRows(snapshotId, contributions) {
  return contributions.map((c) => ({
    snapshot_id: snapshotId,
    event_id: c.eventId,
    category: c.category,
    source_key: c.sourceKey,
    source_name: c.sourceName,
    source_domain: c.sourceDomain,
    source_url: c.sourceUrl,
    source_title: c.sourceTitle,
    summary: c.summary,
    severity: roundNumber(c.severity, 6),
    confidence: roundNumber(c.confidence, 6),
    observed_at: c.observedAt,
    published_at: c.publishedAt,
    age_hours: roundNumber(c.ageHours, 6),
    confidence_weight: roundNumber(c.confidenceWeight, 10),
    decay_weight: roundNumber(c.decayWeight, 10),
    raw_weight: roundNumber(c.rawWeight, 10),
    effective_event_weight: roundNumber(c.effectiveEventWeight, 10),
    source_effective_weight: roundNumber(c.sourceEffectiveWeight, 10),
    category_effective_weight: roundNumber(c.categoryEffectiveWeight, 10),
    normalized_category_weight: roundNumber(c.normalizedCategoryWeight, 10),
    within_category_share: roundNumber(c.withinCategoryShare, 10),
    global_share: roundNumber(c.globalShare, 10),
    contribution_points: roundNumber(c.contributionPoints, 8),
    classification_provider: c.classificationProvider,
    classification_model: c.classificationModel,
    classification_version: c.classificationVersion,
    classification_prompt_version: c.classificationPromptVersion,
    classification_scored_at: c.classificationScoredAt,
    classification_input_hash: c.classificationInputHash,
  }));
}

async function insertContributions(snapshotId, contributions) {
  const rows = contributionStorageRows(snapshotId, contributions);
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabase.from('gri_contributions').insert(rows.slice(i, i + chunkSize));
    if (error) throw new Error(`contribution insert failed: ${error.message}`);
  }
}

async function verifyStoredLedger(snapshotId, expectedRawScore) {
  const { data, error } = await supabase
    .from('gri_contributions')
    .select('event_id,contribution_points')
    .eq('snapshot_id', snapshotId);
  if (error) throw new Error(`stored contribution verification failed: ${error.message}`);
  const rows = data ?? [];
  const ids = new Set(rows.map((r) => r.event_id));
  if (ids.size !== rows.length) throw new Error('stored contribution verification failed: duplicate event_id');
  const storedSum = rows.reduce((sum, r) => sum + Number(r.contribution_points), 0);
  const expected = expectedRawScore === null ? null : Number(expectedRawScore);
  const residual = expected === null ? null : expected - storedSum;
  if (residual !== null && Math.abs(residual) > 0.00001) {
    throw new Error(`stored contribution reconciliation failed: residual=${residual}`);
  }
  return { storedContributionCount: rows.length, storedSum, residual };
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
    classification_provider: r.classification_provider,
    classification_model: r.classification_model,
    classification_version: r.classification_version,
    classification_prompt_version: r.classification_prompt_version,
    classification_scored_at: r.classification_scored_at,
    classification_input_hash: r.classification_input_hash,
  }));
}

async function verifyDraftProofFromStoredRows(snapshotId, expected, previous) {
  const { data: rows, error } = await supabase
    .from('gri_contributions')
    .select('*')
    .eq('snapshot_id', snapshotId)
    .order('event_id', { ascending: true });
  if (error) throw new Error(`stored proof verification query failed: ${error.message}`);

  const recalculated = calculateGri(contributionRowsToInput(rows ?? []), new Date(expected.asOf));
  const reAttribution = previous ? attributeGriChange(previous, recalculated) : null;
  const reproved = buildProofArtifacts(recalculated, reAttribution);

  const checks = {
    methodologyVersion: recalculated.methodologyVersion === expected.calculation.methodologyVersion,
    displayScore: recalculated.displayScore === expected.calculation.displayScore,
    rawScore: expected.calculation.rawScore === null
      ? recalculated.rawScore === null
      : Math.abs(Number(recalculated.rawScore) - Number(expected.calculation.rawScore)) <= 0.00001,
    methodologyHash: reproved.methodologyHash === expected.proof.methodologyHash,
    inputHash: reproved.inputHash === expected.proof.inputHash,
    evidenceHash: reproved.evidenceHash === expected.proof.evidenceHash,
    calculationHash: reproved.calculationHash === expected.proof.calculationHash,
    changeHash: (reproved.changeHash ?? null) === (expected.proof.changeHash ?? null),
    proofHash: reproved.proofHash === expected.proof.proofHash,
    scoreReconciles: reproved.reconciliationResidual === null || Math.abs(reproved.reconciliationResidual) <= 1e-7,
    changeReconciles: reproved.changeResidual === null || Math.abs(reproved.changeResidual) <= 1e-7,
  };

  const verified = Object.values(checks).every(Boolean);
  if (!verified) {
    throw new Error(`stored proof package failed pre-publication verification: ${JSON.stringify(checks)}`);
  }

  return { checks, recalculated, reproved };
}

async function cleanupDraft(snapshotId) {
  try {
    await supabase.from('gri_contributions').delete().eq('snapshot_id', snapshotId);
    await supabase.from('gri_snapshots').delete().eq('id', snapshotId).eq('status', 'draft');
  } catch {
    // The draft is invisible to public RLS even if cleanup itself fails.
  }
}

async function main() {
  const events = await fetchAllEvents();
  const calculation = calculateGri(events, asOf);
  const previous = await loadComparisonSnapshot();
  const attribution = previous ? attributeGriChange(previous, calculation) : null;
  const proof = buildProofArtifacts(calculation, attribution);
  if (!proof.verified) {
    throw new Error(`GRI proof reconciliation failed before publication: score residual=${proof.reconciliationResidual}, change residual=${proof.changeResidual}`);
  }

  console.log(JSON.stringify({
    methodology: GRI_METHOD_VERSION,
    proofVersion: GRI_PROOF_VERSION,
    asOf: calculation.asOf,
    score: calculation.rawScore === null ? null : roundNumber(calculation.rawScore, 4),
    displayScore: calculation.displayScore,
    coveragePct: roundNumber(calculation.coverage * 100, 1),
    weightedConfidence: roundNumber(calculation.weightedConfidence, 2),
    events: calculation.eventCount,
    sources: calculation.sourceCount,
    activeCategories: calculation.activeCategories,
    previousDisplayScore: previous?.displayScore ?? null,
    change: attribution ? roundNumber(attribution.rawDelta, 4) : null,
    methodologyHash: proof.methodologyHash,
    inputHash: proof.inputHash,
    evidenceHash: proof.evidenceHash,
    calculationHash: proof.calculationHash,
    changeHash: proof.changeHash,
    proofHash: proof.proofHash,
    reconciliationResidual: proof.reconciliationResidual,
    changeResidual: proof.changeResidual,
    verified: proof.verified,
  }, null, 2));

  // Dry-run is allowed to report an unavailable/empty calculation so
  // operators can diagnose coverage without mutating production state.
  if (dryRun) return;

  // Production publication must fail closed when no canonical evidence is
  // available. An internally reproducible empty calculation is not a
  // publishable public GRI snapshot.
  if (
    calculation.rawScore === null ||
    calculation.displayScore === null ||
    calculation.contributions.length === 0 ||
    calculation.activeCategories.length === 0
  ) {
    throw new Error(
      'GRI publication blocked: no canonical provenance-complete evidence is available.'
    );
  }

  const snapshotRow = {
    as_of: calculation.asOf,
    methodology_version: GRI_METHOD_VERSION,
    methodology_hash: proof.methodologyHash,
    input_hash: proof.inputHash,
    evidence_hash: proof.evidenceHash,
    calculation_hash: proof.calculationHash,
    raw_score: roundNumber(calculation.rawScore, 6),
    display_score: calculation.displayScore,
    coverage: roundNumber(calculation.coverage, 6),
    weighted_confidence: roundNumber(calculation.weightedConfidence, 6),
    active_categories: calculation.activeCategories,
    event_count: calculation.eventCount,
    source_count: calculation.sourceCount,
    category_breakdown: calculation.categories,
    previous_snapshot_id: previous?.snapshotId ?? null,
    previous_as_of: previous?.asOf ?? null,
    previous_raw_score: previous?.rawScore ?? null,
    previous_display_score: previous?.displayScore ?? null,
    change_points: attribution ? roundNumber(attribution.rawDelta, 6) : null,
    change_hash: proof.changeHash,
    change_attribution: attribution,
    status: 'draft',
    proof_version: GRI_PROOF_VERSION,
    proof_hash: proof.proofHash,
    verification_status: 'verifying',
    reconciliation_residual: roundNumber(proof.reconciliationResidual, 12),
    change_residual: roundNumber(proof.changeResidual, 12),
    explanation: proof.explanation,
  };

  const { data: inserted, error: snapshotError } = await supabase
    .from('gri_snapshots')
    .insert(snapshotRow)
    .select('id')
    .single();
  if (snapshotError) throw new Error(`GRI draft snapshot insert failed: ${snapshotError.message}`);

  try {
    await insertContributions(inserted.id, calculation.contributions);
    const ledger = await verifyStoredLedger(inserted.id, snapshotRow.raw_score);
    if (ledger.storedContributionCount !== calculation.contributions.length) {
      throw new Error(`stored contribution count mismatch: expected ${calculation.contributions.length}, got ${ledger.storedContributionCount}`);
    }

    // Critical publication gate: recompute the complete proof package from the
    // rows that actually landed in Postgres. Only a byte-equivalent hash chain
    // and reconciled score/change ledger may become public/immutable.
    await verifyDraftProofFromStoredRows(
      inserted.id,
      { calculation, proof, asOf: calculation.asOf },
      previous,
    );

    const { error: publishError } = await supabase
      .from('gri_snapshots')
      .update({
        status: 'published',
        verification_status: 'verified',
        published_at: new Date().toISOString(),
      })
      .eq('id', inserted.id)
      .eq('status', 'draft');
    if (publishError) throw new Error(`GRI publication failed: ${publishError.message}`);

    console.log(`✅ Published immutable GRI proof package ${inserted.id} with ${calculation.contributions.length} contributions.`);
  } catch (error) {
    await cleanupDraft(inserted.id);
    throw error;
  }
}

main().catch((error) => {
  console.error('❌ GRI computation failed:', error?.stack || error?.message || error);
  process.exit(1);
});
