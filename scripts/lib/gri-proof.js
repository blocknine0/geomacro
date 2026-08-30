import { createHash } from 'node:crypto';
import { canonicalJson, methodologyManifest } from '../../src/lib/gri-engine.js';

export const GRI_PROOF_VERSION = 'gri-proof-v1.0.0';
export const GRI_RECONCILIATION_TOLERANCE = 1e-7;

export function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function roundNumber(value, digits = 8) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

export function calculationManifest(calculation) {
  return {
    methodologyVersion: calculation.methodologyVersion,
    asOf: calculation.asOf,
    rawScore: roundNumber(calculation.rawScore, 10),
    displayScore: calculation.displayScore,
    coverage: roundNumber(calculation.coverage, 10),
    weightedConfidence: roundNumber(calculation.weightedConfidence, 10),
    categories: calculation.categories.map((c) => ({
      category: c.category,
      baseWeight: roundNumber(c.baseWeight, 10),
      normalizedWeight: roundNumber(c.normalizedWeight, 10),
      score: roundNumber(c.score, 10),
      contributionPoints: roundNumber(c.contributionPoints, 10),
      confidence: roundNumber(c.confidence, 10),
      eventCount: c.eventCount,
      sourceCount: c.sourceCount,
      effectiveWeight: roundNumber(c.effectiveWeight, 10),
    })),
    contributions: calculation.contributions.map((c) => ({
      eventId: c.eventId,
      category: c.category,
      sourceKey: c.sourceKey,
      severity: roundNumber(c.severity, 10),
      confidence: roundNumber(c.confidence, 10),
      observedAt: c.observedAt,
      ageHours: roundNumber(c.ageHours, 10),
      confidenceWeight: roundNumber(c.confidenceWeight, 10),
      decayWeight: roundNumber(c.decayWeight, 10),
      rawWeight: roundNumber(c.rawWeight, 10),
      effectiveEventWeight: roundNumber(c.effectiveEventWeight, 10),
      sourceEffectiveWeight: roundNumber(c.sourceEffectiveWeight, 10),
      categoryEffectiveWeight: roundNumber(c.categoryEffectiveWeight, 10),
      normalizedCategoryWeight: roundNumber(c.normalizedCategoryWeight, 10),
      withinCategoryShare: roundNumber(c.withinCategoryShare, 10),
      globalShare: roundNumber(c.globalShare, 10),
      contributionPoints: roundNumber(c.contributionPoints, 10),
    })),
  };
}

export function evidenceManifest(calculation) {
  return calculation.contributions
    .map((c) => ({
      eventId: c.eventId,
      category: c.category,
      sourceKey: c.sourceKey,
      sourceName: c.sourceName,
      sourceDomain: c.sourceDomain,
      sourceUrl: c.sourceUrl,
      sourceTitle: c.sourceTitle,
      summary: c.summary,
      severity: roundNumber(c.severity, 10),
      confidence: roundNumber(c.confidence, 10),
      observedAt: c.observedAt,
      publishedAt: c.publishedAt,
      classificationProvider: c.classificationProvider,
      classificationModel: c.classificationModel,
      classificationVersion: c.classificationVersion,
      classificationPromptVersion: c.classificationPromptVersion,
      classificationScoredAt: c.classificationScoredAt,
      classificationInputHash: c.classificationInputHash,
    }))
    .sort((a, b) => a.eventId.localeCompare(b.eventId));
}

export function inputManifest(calculation) {
  return [...calculation.inputRows].sort((a, b) => a.eventId.localeCompare(b.eventId));
}

function topAbsolute(rows, key, limit = 8) {
  return [...rows]
    .sort((a, b) => Math.abs(Number(b[key] ?? 0)) - Math.abs(Number(a[key] ?? 0)))
    .slice(0, limit);
}

export function buildDeterministicExplanation(calculation, attribution) {
  const topCurrentEvents = [...calculation.contributions]
    .sort((a, b) => Math.abs(b.contributionPoints) - Math.abs(a.contributionPoints))
    .slice(0, 10)
    .map((c) => ({
      eventId: c.eventId,
      category: c.category,
      sourceTitle: c.sourceTitle,
      sourceUrl: c.sourceUrl,
      severity: roundNumber(c.severity, 6),
      confidence: roundNumber(c.confidence, 6),
      contributionPoints: roundNumber(c.contributionPoints, 8),
    }));

  const topCurrentCategories = [...calculation.categories]
    .sort((a, b) => Math.abs(b.contributionPoints) - Math.abs(a.contributionPoints))
    .map((c) => ({
      category: c.category,
      score: roundNumber(c.score, 6),
      normalizedWeight: roundNumber(c.normalizedWeight, 8),
      contributionPoints: roundNumber(c.contributionPoints, 8),
      eventCount: c.eventCount,
      sourceCount: c.sourceCount,
    }));

  if (!attribution) {
    return {
      explanationVersion: GRI_PROOF_VERSION,
      baseline: true,
      why: {
        direction: 'baseline',
        exactChangePoints: null,
        topCategoryChanges: [],
        topEventChanges: [],
      },
      how: { topCurrentCategories, topCurrentEvents },
    };
  }

  const direction = attribution.rawDelta > 0 ? 'increased' : attribution.rawDelta < 0 ? 'decreased' : 'unchanged';
  return {
    explanationVersion: GRI_PROOF_VERSION,
    baseline: false,
    why: {
      direction,
      exactChangePoints: roundNumber(attribution.rawDelta, 8),
      displayChangePoints: attribution.displayDelta,
      previousRawScore: roundNumber(attribution.previousRawScore, 8),
      currentRawScore: roundNumber(attribution.currentRawScore, 8),
      previousDisplayScore: attribution.previousDisplayScore,
      currentDisplayScore: attribution.currentDisplayScore,
      coverageDelta: roundNumber(attribution.coverageDelta, 8),
      eventCountDelta: attribution.eventCountDelta,
      sourceCountDelta: attribution.sourceCountDelta,
      topCategoryChanges: topAbsolute(attribution.categoryChanges, 'deltaPoints', 4).map((c) => ({
        category: c.category,
        previousScore: roundNumber(c.previousScore, 6),
        currentScore: roundNumber(c.currentScore, 6),
        previousContribution: roundNumber(c.previousContribution, 8),
        currentContribution: roundNumber(c.currentContribution, 8),
        deltaPoints: roundNumber(c.deltaPoints, 8),
      })),
      topEventChanges: topAbsolute(attribution.eventChanges, 'deltaPoints', 12).map((e) => ({
        eventId: e.eventId,
        kind: e.kind,
        category: e.category,
        sourceTitle: e.sourceTitle,
        sourceUrl: e.sourceUrl,
        previousSeverity: roundNumber(e.previousSeverity, 6),
        currentSeverity: roundNumber(e.currentSeverity, 6),
        previousContribution: roundNumber(e.previousContribution, 8),
        currentContribution: roundNumber(e.currentContribution, 8),
        deltaPoints: roundNumber(e.deltaPoints, 8),
      })),
    },
    how: { topCurrentCategories, topCurrentEvents },
  };
}

export function buildProofArtifacts(calculation, attribution) {
  const methodologyHash = sha256(canonicalJson(methodologyManifest()));
  const inputHash = sha256(canonicalJson(inputManifest(calculation)));
  const evidenceHash = sha256(canonicalJson(evidenceManifest(calculation)));
  const calculationHash = sha256(canonicalJson(calculationManifest(calculation)));
  const changeHash = attribution ? sha256(canonicalJson(attribution)) : null;
  const explanation = buildDeterministicExplanation(calculation, attribution);
  const contributionSum = calculation.contributions.reduce((sum, c) => sum + c.contributionPoints, 0);
  const reconciliationResidual = calculation.rawScore === null ? null : calculation.rawScore - contributionSum;
  const changeResidual = attribution?.residual ?? null;

  const proofPayload = {
    proofVersion: GRI_PROOF_VERSION,
    methodologyVersion: calculation.methodologyVersion,
    asOf: calculation.asOf,
    methodologyHash,
    inputHash,
    evidenceHash,
    calculationHash,
    changeHash,
    reconciliationResidual: roundNumber(reconciliationResidual, 12),
    changeResidual: roundNumber(changeResidual, 12),
    explanation,
  };
  const proofHash = sha256(canonicalJson(proofPayload));

  return {
    ...proofPayload,
    proofHash,
    verified:
      (reconciliationResidual === null || Math.abs(reconciliationResidual) <= GRI_RECONCILIATION_TOLERANCE) &&
      (changeResidual === null || Math.abs(changeResidual) <= GRI_RECONCILIATION_TOLERANCE),
  };
}
