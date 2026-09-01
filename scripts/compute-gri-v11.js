#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  GRI_LOOKBACK_HOURS,
  GRI_METHOD_VERSION,
  GRI_STORY_CORRELATION_VERSION,
  GRI_STORY_CORRELATION_PROMPT_VERSION,
  attributeGriChange,
  calculateGri,
} from './lib/gri-engine-v11.js';
import {
  GRI_PROOF_VERSION,
  buildProofArtifacts,
  roundNumber,
} from './lib/gri-proof-v11.js';

dotenv.config();

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const audit = args.includes('--audit');
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

const CANONICAL_CLASSIFICATION_VERSION = 'event-severity-v1.0.4';
const CANONICAL_CLASSIFICATION_PROMPT_VERSION = 'risk-desk-filter-v1.0.4';

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

async function fetchAllEvents() {
  const cutoff = new Date(
    asOf.getTime() - GRI_LOOKBACK_HOURS * 3_600_000
  ).toISOString();

  const pageSize = 1000;
  const parentEvents = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('events')
      .select(
        [
          'id',
          'category',
          'severity',
          'confidence',
          'created_at',
          'published_at',
          'source_name',
          'source_domain',
          'source_url',
          'source_title',
          'summary',
          'classification_provider',
          'classification_model',
          'classification_version',
          'classification_prompt_version',
          'classification_scored_at',
          'classification_input_hash',
        ].join(',')
      )
      .gt('created_at', cutoff)
      .lte('created_at', asOf.toISOString())
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`events query failed: ${error.message}`);
    }

    const rows = data ?? [];
    parentEvents.push(...rows);

    if (rows.length < pageSize) break;
  }

  const parentById = new Map(
    parentEvents.map((row) => [row.id, row])
  );

  const canonicalByEventId = new Map();

  let directCanonicalCount = 0;

  for (const row of parentEvents) {
    if (!hasCanonicalClassificationProvenance(row)) continue;

    canonicalByEventId.set(row.id, row);
    directCanonicalCount++;
  }

  const eventIds = parentEvents.map((row) => row.id);
  let reassessmentCount = 0;

  // Query reassessments only for events already inside the canonical
  // observation window. This preserves the existing time semantics.
  const idBatchSize = 250;

  for (let i = 0; i < eventIds.length; i += idBatchSize) {
    const ids = eventIds.slice(i, i + idBatchSize);

    if (ids.length === 0) continue;

    const { data, error } = await supabase
      .from('gri_event_assessments')
      .select(
        [
          'event_id',
          'category',
          'severity',
          'confidence',
          'summary',
          'classification_provider',
          'classification_model',
          'classification_version',
          'classification_prompt_version',
          'classification_scored_at',
          'classification_input_hash',
        ].join(',')
      )
      .in('event_id', ids)
      .eq(
        'classification_version',
        CANONICAL_CLASSIFICATION_VERSION
      )
      .eq(
        'classification_prompt_version',
        CANONICAL_CLASSIFICATION_PROMPT_VERSION
      );

    if (error) {
      throw new Error(
        `GRI reassessment query failed: ${error.message}`
      );
    }

    for (const assessment of data ?? []) {
      const parent = parentById.get(assessment.event_id);

      if (!parent) continue;

      const merged = {
        ...parent,

        category: assessment.category,
        severity: assessment.severity,
        confidence: assessment.confidence,
        summary: assessment.summary,

        classification_provider:
          assessment.classification_provider,
        classification_model:
          assessment.classification_model,
        classification_version:
          assessment.classification_version,
        classification_prompt_version:
          assessment.classification_prompt_version,
        classification_scored_at:
          assessment.classification_scored_at,
        classification_input_hash:
          assessment.classification_input_hash,
      };

      if (!hasCanonicalClassificationProvenance(merged)) {
        continue;
      }

      // Immutable current-contract reassessment supersedes the old
      // classifier fields for GRI calculation only. The source event
      // itself remains untouched.
      canonicalByEventId.set(parent.id, merged);
      reassessmentCount++;
    }
  }

  const eligible = [...canonicalByEventId.values()].sort(
    (a, b) =>
      new Date(a.created_at).getTime() -
      new Date(b.created_at).getTime()
  );

  const excluded = parentEvents.length - eligible.length;

  console.log(
    `GRI input eligibility: using ${eligible.length} canonical event(s) ` +
      `(${directCanonicalCount} direct, ${reassessmentCount} reassessed); ` +
      `excluding ${excluded} non-canonical event(s).`
  );

  return attachCurrentStoryProvenance(eligible);
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
    storyClusterId: row.story_cluster_id,
    storyCanonicalLabel: row.story_canonical_label,
    storyAssignmentDecision: row.story_assignment_decision,
    storyMatchConfidence:
      row.story_match_confidence === null
        ? null
        : Number(row.story_match_confidence),
    storyDecisionRationale: row.story_decision_rationale,
    storyClusteringProvider: row.story_clustering_provider,
    storyClusteringModel: row.story_clustering_model,
    storyClusteringVersion: row.story_clustering_version,
    storyClusteringPromptVersion:
      row.story_clustering_prompt_version,
    storyClusteringScoredAt: row.story_clustering_scored_at,
    storyClusteringInputHash: row.story_clustering_input_hash,
    severity: Number(row.severity),
    confidence: Number(row.confidence),
    observedAt: row.observed_at,
    publishedAt: row.published_at,
    ageHours: Number(row.age_hours),
    confidenceWeight: Number(row.confidence_weight),
    decayWeight: Number(row.decay_weight),
    rawWeight: Number(row.raw_weight),
    sourceEffectiveWeight: Number(row.source_effective_weight),
    preStoryEventWeight: Number(row.pre_story_event_weight),
    storyRawWeight: Number(row.story_raw_weight),
    storyStrongestSourceWeight:
      Number(row.story_strongest_source_weight),
    storyEffectiveWeight: Number(row.story_effective_weight),
    withinStoryShare: Number(row.within_story_share),
    effectiveEventWeight: Number(row.effective_event_weight),
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

async function loadPreviousPublicationSnapshot() {
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
    .lt('as_of', asOf.toISOString())
    .order('as_of', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `previous publication snapshot query failed: ${error.message}`
    );
  }

  if (!data) return null;

  if (!Number.isInteger(Number(data.display_score))) {
    throw new Error(
      `previous publication snapshot ${data.id} has invalid display_score`
    );
  }

  return {
    snapshotId: data.id,
    asOf: data.as_of,
    displayScore: Number(data.display_score),
  };
}

async function loadComparisonContext() {
  // Change attribution is anchored to the closest verified snapshot around
  // T-24h, not simply the latest previous publication.
  //
  // The immediately preceding publication is loaded separately by
  // loadPreviousPublicationSnapshot().
  const target = new Date(asOf.getTime() - 24 * 3_600_000);
  const earliest = new Date(target.getTime() - 6 * 3_600_000);
  const latest = new Date(target.getTime() + 6 * 3_600_000);

  const { data: candidates, error } = await supabase
    .from('gri_snapshots')
    .select(
      'id,as_of,methodology_version,proof_version,raw_score,display_score,coverage,weighted_confidence,active_categories,event_count,source_count,independent_story_count,story_correlation_version,story_correlation_prompt_version,category_breakdown,verification_status'
    )
    .eq('status', 'published')
    .eq('verification_status', 'verified')
    .eq('methodology_version', GRI_METHOD_VERSION)
    .eq('proof_version', GRI_PROOF_VERSION)
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
      rows.length > 0 &&
      rows.every(hasCanonicalClassificationProvenance) &&
      rows.every(hasCanonicalStoryProvenance);

    if (!canonicalComparison) {
      console.log(
        `Skipping comparison snapshot ${data.id}: contribution ledger contains ` +
          `legacy/incomplete classification provenance.`
      );
      continue;
    }

    if (
      data.story_correlation_version !== GRI_STORY_CORRELATION_VERSION ||
      data.story_correlation_prompt_version !==
        GRI_STORY_CORRELATION_PROMPT_VERSION
    ) {
      console.log(
        `Skipping comparison snapshot ${data.id}: story-correlation contract mismatch.`
      );
      continue;
    }

    const storedStoryCount = new Set(
      rows.map((row) => row.story_cluster_id).filter(Boolean)
    ).size;

    if (
      Number(data.independent_story_count) !== storedStoryCount
    ) {
      console.log(
        `Skipping comparison snapshot ${data.id}: stored independent_story_count ` +
          `${data.independent_story_count} does not match ${storedStoryCount}.`
      );
      continue;
    }

    const storedEventCount = Number(data.event_count);

    if (
      !Number.isInteger(storedEventCount) ||
      storedEventCount <= 0 ||
      storedEventCount !== rows.length
    ) {
      console.log(
        `Skipping comparison snapshot ${data.id}: stored event_count ` +
          `${data.event_count} does not match ${rows.length} contribution row(s).`
      );
      continue;
    }

    const gapHours =
      Math.abs(new Date(data.as_of).getTime() - target.getTime()) /
      3_600_000;

    return {
      snapshot: {
        snapshotId: data.id,
        methodologyVersion: data.methodology_version,
        asOf: data.as_of,
        rawScore: Number(data.raw_score),
        displayScore: Number(data.display_score),
        coverage: Number(data.coverage),
        activeCategories: data.active_categories ?? [],
        eventCount: data.event_count,
        sourceCount: data.source_count,
        independentStoryCount: data.independent_story_count,
        weightedConfidence:
          data.weighted_confidence === null
            ? null
            : Number(data.weighted_confidence),
        categories: Array.isArray(data.category_breakdown)
          ? data.category_breakdown
          : [],
        contributions: rows.map(storedContributionToEngine),
        inputRows: [],
      },
      targetAsOf: target.toISOString(),
      status: 'matched',
      gapHours,
      reason: null,
    };
  }

  const noCandidates = orderedCandidates.length === 0;

  return {
    snapshot: null,
    targetAsOf: target.toISOString(),
    status: noCandidates ? 'no_candidate' : 'no_eligible_candidate',
    gapHours: null,
    reason: noCandidates
      ? 'No verified current-contract snapshot exists within the T-24h plus/minus 6 hour window.'
      : 'Snapshots exist within the T-24h window, but none satisfy the complete current provenance contract.',
  };
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
    story_cluster_id: c.storyClusterId,
    story_canonical_label: c.storyCanonicalLabel,
    story_assignment_decision: c.storyAssignmentDecision,
    story_match_confidence: roundNumber(c.storyMatchConfidence, 6),
    story_decision_rationale: c.storyDecisionRationale,
    story_clustering_provider: c.storyClusteringProvider,
    story_clustering_model: c.storyClusteringModel,
    story_clustering_version: c.storyClusteringVersion,
    story_clustering_prompt_version:
      c.storyClusteringPromptVersion,
    story_clustering_scored_at: c.storyClusteringScoredAt,
    story_clustering_input_hash: c.storyClusteringInputHash,
    severity: roundNumber(c.severity, 6),
    confidence: roundNumber(c.confidence, 6),
    observed_at: c.observedAt,
    published_at: c.publishedAt,
    age_hours: roundNumber(c.ageHours, 6),
    confidence_weight: roundNumber(c.confidenceWeight, 10),
    decay_weight: roundNumber(c.decayWeight, 10),
    raw_weight: roundNumber(c.rawWeight, 10),
    source_effective_weight: roundNumber(c.sourceEffectiveWeight, 10),
    pre_story_event_weight: roundNumber(c.preStoryEventWeight, 10),
    story_raw_weight: roundNumber(c.storyRawWeight, 10),
    story_strongest_source_weight:
      roundNumber(c.storyStrongestSourceWeight, 10),
    story_effective_weight: roundNumber(c.storyEffectiveWeight, 10),
    within_story_share: roundNumber(c.withinStoryShare, 10),
    effective_event_weight: roundNumber(c.effectiveEventWeight, 10),
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

async function verifyStoredLedger(
  snapshotId,
  expectedRawScore,
  expectedStoryCount
) {
  const { data, error } = await supabase
    .from('gri_contributions')
    .select(
      'event_id,story_cluster_id,story_clustering_version,story_clustering_prompt_version,contribution_points'
    )
    .eq('snapshot_id', snapshotId);

  if (error) {
    throw new Error(
      `stored contribution verification failed: ${error.message}`
    );
  }

  const rows = data ?? [];
  const ids = new Set(rows.map((row) => row.event_id));

  if (ids.size !== rows.length) {
    throw new Error(
      'stored contribution verification failed: duplicate event_id'
    );
  }

  if (
    rows.some(
      (row) =>
        !row.story_cluster_id ||
        row.story_clustering_version !==
          GRI_STORY_CORRELATION_VERSION ||
        row.story_clustering_prompt_version !==
          GRI_STORY_CORRELATION_PROMPT_VERSION
    )
  ) {
    throw new Error(
      'stored contribution verification failed: incomplete/current story provenance'
    );
  }

  const storedStoryCount = new Set(
    rows.map((row) => row.story_cluster_id)
  ).size;

  if (storedStoryCount !== expectedStoryCount) {
    throw new Error(
      `stored story-count reconciliation failed: ` +
      `expected=${expectedStoryCount}, stored=${storedStoryCount}`
    );
  }

  const storedSum = rows.reduce(
    (sum, row) => sum + Number(row.contribution_points),
    0
  );

  const expected =
    expectedRawScore === null
      ? null
      : Number(expectedRawScore);

  const residual =
    expected === null
      ? null
      : expected - storedSum;

  if (
    residual !== null &&
    Math.abs(residual) > 0.00001
  ) {
    throw new Error(
      `stored contribution reconciliation failed: residual=${residual}`
    );
  }

  return {
    storedContributionCount: rows.length,
    storedStoryCount,
    storedSum,
    residual,
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

  // Pre-migration/operator dry-run deliberately behaves as a methodology
  // baseline and performs no historical snapshot query. This allows the
  // complete v1.1 input/story/weight/proof path to be audited without any
  // database mutation or dependency on migration 009 having been applied.
  const previousPublication = dryRun
    ? null
    : await loadPreviousPublicationSnapshot();

  const comparison = dryRun
    ? null
    : await loadComparisonContext();

  const previous = comparison?.snapshot ?? null;
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
    independentStories: calculation.independentStoryCount,
    activeCategories: calculation.activeCategories,
    previousPublicationDisplayScore:
      previousPublication?.displayScore ?? null,
    comparisonStatus: comparison?.status ?? null,
    comparisonTargetAsOf: comparison?.targetAsOf ?? null,
    comparisonGapHours:
      comparison?.gapHours === null || comparison?.gapHours === undefined
        ? null
        : roundNumber(comparison.gapHours, 6),
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

  if (audit) {
    const auditPayload = {
      categoryAudit: calculation.categories.map((c) => ({
        category: c.category,
        score: roundNumber(c.score, 6),
        confidence: roundNumber(c.confidence, 6),
        eventCount: c.eventCount,
        sourceCount: c.sourceCount,
        independentStoryCount: c.storyCount,
        effectiveWeight: roundNumber(c.effectiveWeight, 10),
        normalizedWeight: roundNumber(c.normalizedWeight, 10),
        contributionPoints: roundNumber(c.contributionPoints, 8),
      })),

      contributionAudit: calculation.contributions.map((c) => ({
        eventId: c.eventId,
        category: c.category,
        title: c.sourceTitle,
        source: c.sourceDomain ?? c.sourceName ?? c.sourceKey,
        severity: roundNumber(c.severity, 6),
        confidence: roundNumber(c.confidence, 6),

        storyClusterId: c.storyClusterId,
        storyLabel: c.storyCanonicalLabel,
        storyDecision: c.storyAssignmentDecision,
        storyMatchConfidence: roundNumber(c.storyMatchConfidence, 6),

        rawWeight: roundNumber(c.rawWeight, 10),
        sourceEffectiveWeight: roundNumber(c.sourceEffectiveWeight, 10),
        preStoryEventWeight: roundNumber(c.preStoryEventWeight, 10),
        storyRawWeight: roundNumber(c.storyRawWeight, 10),
        storyStrongestSourceWeight:
          roundNumber(c.storyStrongestSourceWeight, 10),
        storyEffectiveWeight: roundNumber(c.storyEffectiveWeight, 10),
        withinStoryShare: roundNumber(c.withinStoryShare, 10),

        effectiveEventWeight: roundNumber(c.effectiveEventWeight, 10),
        withinCategoryShare: roundNumber(c.withinCategoryShare, 10),
        globalShare: roundNumber(c.globalShare, 10),
        contributionPoints: roundNumber(c.contributionPoints, 8),

        classificationProvider: c.classificationProvider,
        classificationModel: c.classificationModel,
        classificationScoredAt: c.classificationScoredAt,
      })),
    };

    console.log("\n===== GRI v1.1 CONTRIBUTION AUDIT =====");
    console.log(JSON.stringify(auditPayload, null, 2));
  }

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
    independent_story_count: calculation.independentStoryCount,
    story_correlation_version: GRI_STORY_CORRELATION_VERSION,
    story_correlation_prompt_version:
      GRI_STORY_CORRELATION_PROMPT_VERSION,
    category_breakdown: calculation.categories,

    previous_publication_snapshot_id:
      previousPublication?.snapshotId ?? null,
    previous_publication_as_of:
      previousPublication?.asOf ?? null,
    previous_publication_display_score:
      previousPublication?.displayScore ?? null,

    comparison_target_as_of:
      comparison?.targetAsOf ?? null,
    comparison_status:
      comparison?.status ?? null,
    comparison_gap_hours:
      comparison?.gapHours === null || comparison?.gapHours === undefined
        ? null
        : roundNumber(comparison.gapHours, 6),
    comparison_reason:
      comparison?.reason ?? null,

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
    const ledger = await verifyStoredLedger(
      inserted.id,
      snapshotRow.raw_score,
      calculation.independentStoryCount
    );
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
