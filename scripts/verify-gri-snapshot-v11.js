#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { attributeGriChange, calculateGri } from './lib/gri-engine-v11.js';
import { buildProofArtifacts, roundNumber } from './lib/gri-proof-v11.js';

dotenv.config();
const args = process.argv.slice(2);
const snapshotArg = args.indexOf('--snapshot-id');
const snapshotId = snapshotArg >= 0 ? args[snapshotArg + 1] : null;

const url = process.env.SUPABASE_URL || process.env.APP_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.APP_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Supabase URL and service-role key are required');
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const CANONICAL_CLASSIFICATION_VERSION = 'event-severity-v1.0.4';
const CANONICAL_CLASSIFICATION_PROMPT_VERSION = 'risk-desk-filter-v1.0.4';

const GRI_METHOD_VERSION = 'gri-v1.1.0';
const GRI_PROOF_VERSION = 'gri-proof-v1.1.0';
const GRI_STORY_CORRELATION_VERSION = 'story-correlation-v1.0.0';
const GRI_STORY_CORRELATION_PROMPT_VERSION = 'story-match-title-v1.0.0';

function contributionHasCanonicalProvenance(row) {
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


function contributionHasCanonicalStoryProvenance(row) {
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

async function loadSnapshot(id = null) {
  let q = supabase
    .from('gri_snapshots')
    .select('*')
    .eq('status', 'published')
    .eq('methodology_version', GRI_METHOD_VERSION);
  if (id) q = q.eq('id', id);
  else q = q.order('as_of', { ascending: false }).limit(1);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`snapshot query failed: ${error.message}`);
  if (!data) throw new Error(id ? `snapshot ${id} not found` : 'no published GRI snapshot found');
  return data;
}

async function loadContributions(id) {
  const { data, error } = await supabase
    .from('gri_contributions')
    .select('*')
    .eq('snapshot_id', id)
    .order('event_id', { ascending: true });
  if (error) throw new Error(`contribution query failed: ${error.message}`);
  return data ?? [];
}

async function loadExpectedPreviousPublication(snapshot) {
  const { data, error } = await supabase
    .from('gri_snapshots')
    .select(
      'id,as_of,display_score,proof_version,story_correlation_version,story_correlation_prompt_version'
    )
    .eq('status', 'published')
    .eq('verification_status', 'verified')
    .eq('methodology_version', GRI_METHOD_VERSION)
    .eq('proof_version', GRI_PROOF_VERSION)
    .eq('story_correlation_version', GRI_STORY_CORRELATION_VERSION)
    .eq(
      'story_correlation_prompt_version',
      GRI_STORY_CORRELATION_PROMPT_VERSION
    )
    .lt('as_of', snapshot.as_of)
    .neq('id', snapshot.id)
    .order('as_of', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `previous publication verification query failed: ${error.message}`
    );
  }

  return data ?? null;
}

async function loadExpectedComparison(snapshot) {
  const currentAsOf = new Date(snapshot.as_of);
  const target = new Date(currentAsOf.getTime() - 24 * 3_600_000);
  const earliest = new Date(target.getTime() - 6 * 3_600_000);
  const latest = new Date(target.getTime() + 6 * 3_600_000);

  const { data: candidates, error } = await supabase
    .from('gri_snapshots')
    .select('*')
    .eq('status', 'published')
    .eq('verification_status', 'verified')
    .eq('methodology_version', GRI_METHOD_VERSION)
    .eq('proof_version', GRI_PROOF_VERSION)
    .gte('as_of', earliest.toISOString())
    .lte('as_of', latest.toISOString())
    .neq('id', snapshot.id);

  if (error) {
    throw new Error(
      `comparison verification query failed: ${error.message}`
    );
  }

  const orderedCandidates = (candidates ?? [])
    .filter((row) => row.raw_score !== null)
    .sort(
      (a, b) =>
        Math.abs(new Date(a.as_of).getTime() - target.getTime()) -
        Math.abs(new Date(b.as_of).getTime() - target.getTime())
    );

  for (const candidate of orderedCandidates) {
    const rows = await loadContributions(candidate.id);

    if (
      rows.length === 0 ||
      !rows.every(contributionHasCanonicalProvenance) ||
      !rows.every(contributionHasCanonicalStoryProvenance)
    ) {
      continue;
    }

    if (
      candidate.story_correlation_version !==
        GRI_STORY_CORRELATION_VERSION ||
      candidate.story_correlation_prompt_version !==
        GRI_STORY_CORRELATION_PROMPT_VERSION
    ) {
      continue;
    }

    const storyCount = new Set(
      rows.map((row) => row.story_cluster_id).filter(Boolean)
    ).size;

    if (
      Number(candidate.independent_story_count) !== storyCount
    ) {
      continue;
    }

    const eventCount = Number(candidate.event_count);

    if (
      !Number.isInteger(eventCount) ||
      eventCount <= 0 ||
      eventCount !== rows.length
    ) {
      continue;
    }

    return {
      snapshot: candidate,
      targetAsOf: target.toISOString(),
      status: 'matched',
      gapHours:
        Math.abs(new Date(candidate.as_of).getTime() - target.getTime()) /
        3_600_000,
      reason: null,
    };
  }

  const noCandidates = orderedCandidates.length === 0;

  return {
    snapshot: null,
    targetAsOf: target.toISOString(),
    status: noCandidates
      ? 'no_candidate'
      : 'no_eligible_candidate',
    gapHours: null,
    reason: noCandidates
      ? 'No verified current-contract snapshot exists within the T-24h plus/minus 6 hour window.'
      : 'Snapshots exist within the T-24h window, but none satisfy the complete current provenance contract.',
  };
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
    story_canonical_label: r.story_canonical_label,
    story_assignment_decision: r.story_assignment_decision,
    story_match_confidence: r.story_match_confidence,
    story_decision_rationale: r.story_decision_rationale,
    story_clustering_provider: r.story_clustering_provider,
    story_clustering_model: r.story_clustering_model,
    story_clustering_version: r.story_clustering_version,
    story_clustering_prompt_version:
      r.story_clustering_prompt_version,
    story_clustering_scored_at: r.story_clustering_scored_at,
    story_clustering_input_hash: r.story_clustering_input_hash,
    classification_provider: r.classification_provider,
    classification_model: r.classification_model,
    classification_version: r.classification_version,
    classification_prompt_version: r.classification_prompt_version,
    classification_scored_at: r.classification_scored_at,
    classification_input_hash: r.classification_input_hash,
  }));
}

function storedCalculation(snapshot, rows) {
  return {
    snapshotId: snapshot.id,
    methodologyVersion: snapshot.methodology_version,
    asOf: snapshot.as_of,
    rawScore: snapshot.raw_score === null ? null : Number(snapshot.raw_score),
    displayScore: snapshot.display_score,
    coverage: Number(snapshot.coverage),
    activeCategories: snapshot.active_categories ?? [],
    eventCount: snapshot.event_count,
    sourceCount: snapshot.source_count,
    independentStoryCount: snapshot.independent_story_count,
    weightedConfidence: snapshot.weighted_confidence === null ? null : Number(snapshot.weighted_confidence),
    categories: Array.isArray(snapshot.category_breakdown) ? snapshot.category_breakdown : [],
    contributions: rows.map((r) => ({
      eventId: r.event_id,
      category: r.category,
      sourceKey: r.source_key,
      sourceName: r.source_name,
      sourceDomain: r.source_domain,
      sourceUrl: r.source_url,
      sourceTitle: r.source_title,
      summary: r.summary,
      storyClusterId: r.story_cluster_id,
      storyCanonicalLabel: r.story_canonical_label,
      storyAssignmentDecision: r.story_assignment_decision,
      storyMatchConfidence:
        r.story_match_confidence === null
          ? null
          : Number(r.story_match_confidence),
      storyDecisionRationale: r.story_decision_rationale,
      storyClusteringProvider: r.story_clustering_provider,
      storyClusteringModel: r.story_clustering_model,
      storyClusteringVersion: r.story_clustering_version,
      storyClusteringPromptVersion:
        r.story_clustering_prompt_version,
      storyClusteringScoredAt: r.story_clustering_scored_at,
      storyClusteringInputHash: r.story_clustering_input_hash,
      severity: Number(r.severity),
      confidence: Number(r.confidence),
      observedAt: r.observed_at,
      publishedAt: r.published_at,
      ageHours: Number(r.age_hours),
      confidenceWeight: Number(r.confidence_weight),
      decayWeight: Number(r.decay_weight),
      rawWeight: Number(r.raw_weight),
      sourceEffectiveWeight: Number(r.source_effective_weight),
      preStoryEventWeight: Number(r.pre_story_event_weight),
      storyRawWeight: Number(r.story_raw_weight),
      storyStrongestSourceWeight:
        Number(r.story_strongest_source_weight),
      storyEffectiveWeight: Number(r.story_effective_weight),
      withinStoryShare: Number(r.within_story_share),
      effectiveEventWeight: Number(r.effective_event_weight),
      categoryEffectiveWeight: Number(r.category_effective_weight),
      normalizedCategoryWeight: Number(r.normalized_category_weight),
      withinCategoryShare: Number(r.within_category_share),
      globalShare: Number(r.global_share),
      contributionPoints: Number(r.contribution_points),
      classificationProvider: r.classification_provider,
      classificationModel: r.classification_model,
      classificationVersion: r.classification_version,
      classificationPromptVersion: r.classification_prompt_version,
      classificationScoredAt: r.classification_scored_at,
      classificationInputHash: r.classification_input_hash,
    })),
    inputRows: [],
  };
}

async function main() {
  const snapshot = await loadSnapshot(snapshotId);
  const rows = await loadContributions(snapshot.id);

  const classificationProvenance =
    rows.length > 0 &&
    rows.every(contributionHasCanonicalProvenance);

  const storyProvenance =
    rows.length > 0 &&
    rows.every(contributionHasCanonicalStoryProvenance);

  const recalculated = calculateGri(
    contributionRowsToInput(rows),
    new Date(snapshot.as_of)
  );

  const expectedPreviousPublication =
    await loadExpectedPreviousPublication(snapshot);

  const expectedComparison =
    await loadExpectedComparison(snapshot);

  const expectedTargetMs =
    new Date(snapshot.as_of).getTime() - 24 * 3_600_000;

  const storedTargetMs =
    Date.parse(String(snapshot.comparison_target_as_of || ''));

  const previousPublicationContinuity =
    expectedPreviousPublication
      ? snapshot.previous_publication_snapshot_id ===
          expectedPreviousPublication.id &&
        snapshot.previous_publication_as_of ===
          expectedPreviousPublication.as_of &&
        Number(snapshot.previous_publication_display_score) ===
          Number(expectedPreviousPublication.display_score)
      : snapshot.previous_publication_snapshot_id === null &&
        snapshot.previous_publication_as_of === null &&
        snapshot.previous_publication_display_score === null;

  const comparisonTarget =
    Number.isFinite(storedTargetMs) &&
    Math.abs(storedTargetMs - expectedTargetMs) <= 1_000;

  const comparisonStatus =
    snapshot.comparison_status === expectedComparison.status;

  const comparisonSelection =
    expectedComparison.snapshot
      ? snapshot.previous_snapshot_id === expectedComparison.snapshot.id
      : snapshot.previous_snapshot_id === null;

  const comparisonGap =
    expectedComparison.snapshot
      ? Number.isFinite(Number(snapshot.comparison_gap_hours)) &&
        Math.abs(
          Number(snapshot.comparison_gap_hours) -
            expectedComparison.gapHours
        ) <= 0.00001
      : snapshot.comparison_gap_hours === null;

  const comparisonReason =
    snapshot.comparison_reason === expectedComparison.reason;

  let previous = null;
  let previousClassificationProvenance = true;
  let previousStoryProvenance = true;

  if (snapshot.previous_snapshot_id) {
    const prevSnapshot = await loadSnapshot(snapshot.previous_snapshot_id);
    const prevRows = await loadContributions(prevSnapshot.id);

    previousClassificationProvenance =
      prevRows.length > 0 &&
      prevRows.every(contributionHasCanonicalProvenance);

    previousStoryProvenance =
      prevRows.length > 0 &&
      prevRows.every(contributionHasCanonicalStoryProvenance);

    previous = storedCalculation(prevSnapshot, prevRows);
  }

  const attribution = previous
    ? attributeGriChange(previous, recalculated)
    : null;
  const proof = buildProofArtifacts(recalculated, attribution);

  const checks = {
    classificationProvenance,
    storyProvenance,
    previousClassificationProvenance,
    previousStoryProvenance,
    previousPublicationContinuity,
    comparisonTarget,
    comparisonStatus,
    comparisonSelection,
    comparisonGap,
    comparisonReason,
    methodologyVersion:
      recalculated.methodologyVersion === snapshot.methodology_version,
    proofVersion:
      snapshot.proof_version === GRI_PROOF_VERSION,
    storyCorrelationVersion:
      snapshot.story_correlation_version ===
        GRI_STORY_CORRELATION_VERSION,
    storyCorrelationPromptVersion:
      snapshot.story_correlation_prompt_version ===
        GRI_STORY_CORRELATION_PROMPT_VERSION,
    independentStoryCount:
      Number(snapshot.independent_story_count) ===
        recalculated.independentStoryCount,
    displayScore: recalculated.displayScore === snapshot.display_score,
    rawScore: snapshot.raw_score === null
      ? recalculated.rawScore === null
      : Math.abs(Number(snapshot.raw_score) - Number(recalculated.rawScore)) <= 0.00001,
    methodologyHash: proof.methodologyHash === snapshot.methodology_hash,
    inputHash: proof.inputHash === snapshot.input_hash,
    evidenceHash: proof.evidenceHash === snapshot.evidence_hash,
    calculationHash: proof.calculationHash === snapshot.calculation_hash,
    changeHash: (proof.changeHash ?? null) === (snapshot.change_hash ?? null),
    proofHash: proof.proofHash === snapshot.proof_hash,
    scoreReconciles: proof.reconciliationResidual === null || Math.abs(proof.reconciliationResidual) <= 1e-7,
    changeReconciles: proof.changeResidual === null || Math.abs(proof.changeResidual) <= 1e-7,
  };
  const verified = Object.values(checks).every(Boolean);

  console.log(JSON.stringify({
    snapshotId: snapshot.id,
    asOf: snapshot.as_of,
    methodologyVersion: snapshot.methodology_version,
    storedScore: snapshot.display_score,
    recalculatedScore: recalculated.displayScore,
    storedRawScore: snapshot.raw_score === null ? null : Number(snapshot.raw_score),
    recalculatedRawScore: roundNumber(recalculated.rawScore, 8),
    checks,
    verified,
  }, null, 2));

  if (!verified) process.exitCode = 1;
}

main().catch((error) => {
  console.error('❌ GRI verification failed:', error?.stack || error?.message || error);
  process.exit(1);
});
