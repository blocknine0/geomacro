import { describe, expect, it } from "vitest";
import {
  GRI_METHOD_VERSION,
  GRI_PROOF_VERSION,
  GRI_STORY_CORRELATION_PROMPT_VERSION,
  GRI_STORY_CORRELATION_VERSION,
} from "../lib/gri-current-contract";
import {
  assemblePublicGlobalRisk,
  type SnapshotRow,
} from "../lib/global-risk-assemble";
import { validateGlobalRiskContinuity } from "../lib/global-risk-continuity";
import { riskIndicesFromGlobalRisk } from "../lib/risk-indices-from-global-risk";

const H = "a".repeat(64);

function snapshot(
  id: string,
  asOf: string,
  scores: { geopolitics: number; macro: number; rare_earth: number },
): SnapshotRow {
  return {
    id,
    as_of: asOf,
    methodology_version: GRI_METHOD_VERSION,
    methodology_hash: H,
    input_hash: H,
    evidence_hash: H,
    calculation_hash: H,
    disposition_hash: H,
    candidate_event_count: 12,
    proof_version: GRI_PROOF_VERSION,
    proof_hash: H,
    verification_status: "verified",
    reconciliation_residual: 0,
    change_residual: 0,
    raw_score: 67,
    display_score: 67,
    coverage: 1,
    weighted_confidence: 80,
    active_categories: ["geopolitics", "macro", "rare_earth"],
    event_count: 9,
    source_count: 6,
    independent_story_count: 8,
    story_correlation_version: GRI_STORY_CORRELATION_VERSION,
    story_correlation_prompt_version: GRI_STORY_CORRELATION_PROMPT_VERSION,
    category_breakdown: [
      {
        category: "geopolitics",
        score: scores.geopolitics,
        confidence: 82,
        eventCount: 3,
        sourceCount: 2,
        storyCount: 3,
        normalizedWeight: 1 / 3,
      },
      {
        category: "macro",
        score: scores.macro,
        confidence: 78,
        eventCount: 4,
        sourceCount: 3,
        storyCount: 3,
        normalizedWeight: 1 / 3,
      },
      {
        category: "rare_earth",
        score: scores.rare_earth,
        confidence: 76,
        eventCount: 2,
        sourceCount: 2,
        storyCount: 2,
        normalizedWeight: 1 / 3,
      },
    ],
    previous_as_of: null,
    previous_raw_score: null,
    previous_display_score: null,
    change_points: null,
    change_hash: null,
    change_attribution: { categoryChanges: [] },
    explanation: { how: { topCurrentEvents: [] } },
    status: "published",
  };
}

describe("verified Global Risk domain history", () => {
  it("derives three separate histories from stored category_breakdown snapshots", () => {
    const previousAt = "2026-10-01T11:00:00.000Z";
    const latestAt = "2026-10-01T12:00:00.000Z";
    const risk = assemblePublicGlobalRisk(
      [
        snapshot("latest", latestAt, { geopolitics: 72, macro: 64, rare_earth: 68 }),
        snapshot("previous", previousAt, { geopolitics: 70, macro: 65, rare_earth: 66 }),
      ],
      [],
      Date.parse(latestAt) + 10 * 60 * 1000,
    );

    expect(risk.domainIndices.geopolitics?.rawScore).toBe(72);
    expect(risk.domainIndices.macro?.rawScore).toBe(64);
    expect(risk.domainIndices.rare_earth?.rawScore).toBe(68);
    expect(risk.domainIndices.geopolitics?.previousScore).toBe(70);
    expect(risk.domainIndices.geopolitics?.changePoints).toBe(2);
    expect(risk.domainIndices.macro?.series["24H"].buckets?.map((b) => b.avg)).toEqual([65, 64]);
    expect(risk.domainIndices.rare_earth?.series["30D"].buckets?.map((b) => b.avg)).toEqual([66, 68]);

    const indices = riskIndicesFromGlobalRisk(risk, Date.parse(latestAt) + 10 * 60 * 1000);
    expect(indices.indices).toHaveLength(3);
    expect(indices.indices.every((index) => index.status === "available")).toBe(true);
    expect(indices.indices.every((index) => (index.series["7D"].buckets?.length ?? 0) === 2)).toBe(true);
    expect(validateGlobalRiskContinuity(risk, Date.parse(latestAt) + 10 * 60 * 1000)).toEqual({ ok: true });
  });

  it("retains a category omitted by the newest snapshot with its original timestamp", () => {
    const previousAt = "2026-10-01T11:00:00.000Z";
    const latestAt = "2026-10-01T12:00:00.000Z";
    const latest = snapshot("latest", latestAt, { geopolitics: 72, macro: 64, rare_earth: 68 });
    latest.category_breakdown = (latest.category_breakdown as Array<Record<string, unknown>>)
      .filter((row) => row.category !== "macro");
    const risk = assemblePublicGlobalRisk(
      [
        latest,
        snapshot("previous", previousAt, { geopolitics: 70, macro: 65, rare_earth: 66 }),
      ],
      [],
      Date.parse(latestAt) + 10 * 60 * 1000,
    );
    const macro = risk.domainIndices.macro;
    expect(macro?.rawScore).toBe(65);
    expect(macro?.readingStatus).toBe("last_verified");
    expect(macro?.readingAsOf).toBe(previousAt);
    expect(riskIndicesFromGlobalRisk(risk, Date.parse(latestAt) + 10 * 60 * 1000).indices
      .find((index) => index.key === "macro")?.readingAsOf).toBe(previousAt);
  });

  it("labels a wall-clock-old verified snapshot as last verified without changing as-of", () => {
    const latestAt = "2026-10-01T12:00:00.000Z";
    const now = Date.parse(latestAt) + 7 * 60 * 60 * 1000;
    const risk = assemblePublicGlobalRisk(
      [
        snapshot("latest", latestAt, { geopolitics: 72, macro: 64, rare_earth: 68 }),
        snapshot("previous", "2026-10-01T11:00:00.000Z", { geopolitics: 70, macro: 65, rare_earth: 66 }),
      ],
      [],
      now,
    );
    expect(risk.domainIndices.geopolitics?.readingStatus).toBe("last_verified");
    expect(risk.domainIndices.geopolitics?.readingAsOf).toBe(latestAt);
    expect(riskIndicesFromGlobalRisk(risk, now).indices[0]).toMatchObject({
      readingStatus: "last_verified",
      readingAsOf: latestAt,
      readingAgeHours: 7,
    });
    expect(validateGlobalRiskContinuity(risk, now)).toEqual({ ok: true });

    const historicalRisk = assemblePublicGlobalRisk(
      [
        snapshot("latest", latestAt, { geopolitics: 72, macro: 64, rare_earth: 68 }),
        snapshot("previous", "2026-10-01T11:00:00.000Z", {
          geopolitics: 70,
          macro: 65,
          rare_earth: 66,
        }),
      ],
      [],
      Date.parse(latestAt),
    );
    expect(historicalRisk.domainIndices.geopolitics?.readingStatus).toBe("current");
    expect(riskIndicesFromGlobalRisk(historicalRisk, Date.parse(latestAt)).indices[0])
      .toMatchObject({ readingStatus: "current", readingAsOf: latestAt });
  });

  it("projects a category with no verified history as unavailable with a null as-of", () => {
    const latestAt = "2026-10-01T12:00:00.000Z";
    const latest = snapshot("latest", latestAt, { geopolitics: 72, macro: 64, rare_earth: 68 });
    const previous = snapshot("previous", "2026-10-01T11:00:00.000Z", {
      geopolitics: 70,
      macro: 65,
      rare_earth: 66,
    });
    for (const row of [latest, previous]) {
      row.category_breakdown = (row.category_breakdown as Array<Record<string, unknown>>)
        .filter((category) => category.category !== "macro");
    }
    const risk = assemblePublicGlobalRisk([latest, previous], [], Date.parse(latestAt) + 10 * 60 * 1000);
    const indices = riskIndicesFromGlobalRisk(risk, Date.parse(latestAt) + 10 * 60 * 1000);
    const macro = indices.indices.find((index) => index.key === "macro");
    expect(risk.domainIndices.macro).toBeNull();
    expect(macro).toMatchObject({
      status: "unavailable",
      readingAsOf: null,
      readingSnapshotId: null,
      rawScore: null,
      score: null,
    });
    expect(validateGlobalRiskContinuity(risk, Date.parse(latestAt) + 10 * 60 * 1000)).toEqual({ ok: true });
  });

  it("fails closed if a current domain still exists but its verified history is stripped", () => {
    const latestAt = "2026-10-01T12:00:00.000Z";
    const risk = assemblePublicGlobalRisk(
      [
        snapshot("latest", latestAt, { geopolitics: 72, macro: 64, rare_earth: 68 }),
        snapshot("previous", "2026-10-01T11:00:00.000Z", { geopolitics: 70, macro: 65, rare_earth: 66 }),
      ],
      [],
      Date.parse(latestAt) + 10 * 60 * 1000,
    );
    const broken = structuredClone(risk);
    broken.domainIndices.macro = null;

    expect(validateGlobalRiskContinuity(broken, Date.parse(latestAt) + 10 * 60 * 1000)).toEqual({
      ok: false,
      code: "RISK_DOMAIN_MACRO_HISTORY_MISSING",
    });
  });
});
