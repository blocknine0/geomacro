import { describe, expect, it } from "vitest";

import {
  GRI_PROOF_VERSION,
  LEGACY_GRI_PROOF_VERSION,
  buildDeterministicExplanation,
  buildProofArtifacts,
  calculationManifest,
  evidenceManifest,
  inputManifest,
  sha256,
} from "../../scripts/lib/gri-proof-v11.js";

import {
  canonicalJson,
  methodologyManifest,
} from "../../scripts/lib/gri-engine-v11.js";

const calculation = {
  methodologyVersion: "gri-v1.1.0",
  asOf: "2026-09-06T12:00:00.000Z",
  rawScore: 50,
  displayScore: 50,
  coverage: 0.5,
  weightedConfidence: 80,
  eventCount: 1,
  sourceCount: 1,
  independentStoryCount: 1,
  activeCategories: ["geopolitics"],
  categories: [
    {
      category: "geopolitics",
      baseWeight: 0.5,
      normalizedWeight: 1,
      score: 50,
      contributionPoints: 50,
      confidence: 80,
      eventCount: 1,
      sourceCount: 1,
      storyCount: 1,
      effectiveWeight: 0.5,
    },
  ],
  contributions: [
    {
      eventId: "event-a",
      category: "geopolitics",
      sourceKey: "example.com",
      sourceName: "Example",
      sourceDomain: "example.com",
      sourceUrl: "https://example.com/a",
      sourceTitle: "Example",
      summary: "Example",
      storyClusterId: "story-a",
      storyCanonicalLabel: "Example story",
      storyAssignmentDecision: "anchor",
      storyMatchConfidence: 100,
      storyDecisionRationale: "Anchor",
      storyClusteringProvider: "groq",
      storyClusteringModel: "openai/gpt-oss-20b",
      storyClusteringVersion: "story-correlation-v1.0.0",
      storyClusteringPromptVersion: "story-match-title-v1.0.0",
      storyClusteringScoredAt: "2026-09-06T12:00:00.000Z",
      storyClusteringInputHash: "b".repeat(64),
      severity: 50,
      confidence: 80,
      observedAt: "2026-09-06T11:00:00.000Z",
      publishedAt: "2026-09-06T10:55:00.000Z",
      ageHours: 1,
      confidenceWeight: 0.8,
      decayWeight: 0.9,
      rawWeight: 0.72,
      sourceEffectiveWeight: 0.72,
      preStoryEventWeight: 0.72,
      storyRawWeight: 0.72,
      storyStrongestSourceWeight: 0.72,
      storyEffectiveWeight: 0.72,
      withinStoryShare: 1,
      effectiveEventWeight: 0.72,
      categoryEffectiveWeight: 0.72,
      normalizedCategoryWeight: 1,
      withinCategoryShare: 1,
      globalShare: 1,
      contributionPoints: 50,
      classificationProvider: "groq",
      classificationModel: "openai/gpt-oss-20b",
      classificationVersion: "event-severity-v1.0.4",
      classificationPromptVersion: "risk-desk-filter-v1.0.4",
      classificationScoredAt: "2026-09-06T11:01:00.000Z",
      classificationInputHash: "a".repeat(64),
    },
  ],
  inputRows: [
    {
      eventId: "event-a",
      category: "geopolitics",
      sourceKey: "example.com",
      storyClusterId: "story-a",
      storyCanonicalLabel: "Example story",
      storyAssignmentDecision: "anchor",
      storyMatchConfidence: 100,
      storyDecisionRationale: "Anchor",
      storyClusteringProvider: "groq",
      storyClusteringModel: "openai/gpt-oss-20b",
      storyClusteringVersion: "story-correlation-v1.0.0",
      storyClusteringPromptVersion: "story-match-title-v1.0.0",
      storyClusteringScoredAt: "2026-09-06T12:00:00.000Z",
      storyClusteringInputHash: "b".repeat(64),
      severity: 50,
      confidence: 80,
      observedAt: "2026-09-06T11:00:00.000Z",
      publishedAt: "2026-09-06T10:55:00.000Z",
      classificationProvider: "groq",
      classificationModel: "openai/gpt-oss-20b",
      classificationVersion: "event-severity-v1.0.4",
      classificationPromptVersion: "risk-desk-filter-v1.0.4",
      classificationScoredAt: "2026-09-06T11:01:00.000Z",
      classificationInputHash: "a".repeat(64),
    },
  ],
};

describe("GRI proof envelope compatibility", () => {
  it("reproduces the legacy v1.1 payload exactly without dispositionHash", () => {
    const proof = buildProofArtifacts(
      calculation,
      null,
      { proofVersion: LEGACY_GRI_PROOF_VERSION },
    );

    const methodologyHash = sha256(
      canonicalJson(methodologyManifest()),
    );
    const inputHash = sha256(
      canonicalJson(inputManifest(calculation)),
    );
    const evidenceHash = sha256(
      canonicalJson(evidenceManifest(calculation)),
    );
    const calculationHash = sha256(
      canonicalJson(calculationManifest(calculation)),
    );

    const explanation =
      buildDeterministicExplanation(
        calculation,
        null,
        LEGACY_GRI_PROOF_VERSION,
      );

    const legacyPayload = {
      proofVersion: LEGACY_GRI_PROOF_VERSION,
      methodologyVersion: calculation.methodologyVersion,
      asOf: calculation.asOf,
      methodologyHash,
      inputHash,
      evidenceHash,
      calculationHash,
      changeHash: null,
      reconciliationResidual: 0,
      changeResidual: null,
      explanation,
    };

    expect(proof.proofHash).toBe(
      sha256(canonicalJson(legacyPayload)),
    );

    expect(proof).not.toHaveProperty("dispositionHash");
  });

  it("binds dispositionHash into the v1.2 proof envelope", () => {
    const dispositionHash = "c".repeat(64);

    const proof = buildProofArtifacts(
      calculation,
      null,
      {
        proofVersion: GRI_PROOF_VERSION,
        dispositionHash,
      },
    );

    expect(GRI_PROOF_VERSION).toBe(
      "gri-proof-v1.2.0",
    );
    expect(proof.dispositionHash).toBe(
      dispositionHash,
    );
    expect(proof.explanation.explanationVersion).toBe(
      "gri-proof-v1.2.0",
    );
  });

  it("fails closed when v1.2 has no dispositionHash", () => {
    expect(() =>
      buildProofArtifacts(calculation, null),
    ).toThrow(
      "gri-proof-v1.2.0 requires a valid disposition hash",
    );
  });

  it("does not allow dispositionHash inside legacy v1.1", () => {
    expect(() =>
      buildProofArtifacts(
        calculation,
        null,
        {
          proofVersion: LEGACY_GRI_PROOF_VERSION,
          dispositionHash: "d".repeat(64),
        },
      ),
    ).toThrow(
      "gri-proof-v1.1.0 must not include a disposition hash",
    );
  });
});
