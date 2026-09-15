import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  calculateGri,
} from "../../scripts/lib/gri-engine-v12.js";
import {
  GRI_SENSITIVITY_SCENARIOS,
  calculateGriCounterfactual,
  resolveSensitivityParameters,
} from "../../scripts/lib/gri-sensitivity-v12.js";

const AS_OF = "2026-09-15T12:00:00.000Z";

function event({
  id,
  category,
  source,
  story,
  severity,
  confidence,
  hoursAgo,
  decision = "anchor",
}) {
  const observed = new Date(
    Date.parse(AS_OF) - hoursAgo * 3_600_000,
  ).toISOString();

  return {
    id,
    category,
    source_domain: source,
    source_name: source,
    source_url: `https://${source}/item/${id}`,
    source_title: id,
    summary: `Synthetic ${id}`,
    severity,
    confidence,
    created_at: observed,
    published_at: observed,
    story_cluster_id: story,
    story_canonical_label: `Story ${story}`,
    story_assignment_decision: decision,
    story_match_confidence: 95,
    story_decision_rationale: "Deterministic synthetic fixture",
    story_clustering_provider: "fixture",
    story_clustering_model: "fixture-v1",
    story_clustering_version: "story-correlation-v1.0.0",
    story_clustering_prompt_version: "story-match-title-v1.0.0",
    story_clustering_scored_at: observed,
    story_clustering_input_hash: "a".repeat(64),
  };
}

const rows = [
  event({
    id: "g1a",
    category: "geopolitics",
    source: "source-a.example",
    story: "geo-story-1",
    severity: 80,
    confidence: 90,
    hoursAgo: 2,
  }),
  event({
    id: "g1b",
    category: "geopolitics",
    source: "source-b.example",
    story: "geo-story-1",
    severity: 75,
    confidence: 80,
    hoursAgo: 4,
    decision: "matched",
  }),
  event({
    id: "m1",
    category: "macro",
    source: "source-c.example",
    story: "macro-story-1",
    severity: 40,
    confidence: 90,
    hoursAgo: 8,
  }),
  event({
    id: "m2",
    category: "macro",
    source: "source-c.example",
    story: "macro-story-2",
    severity: 60,
    confidence: 70,
    hoursAgo: 20,
  }),
  event({
    id: "r1",
    category: "rare_earth",
    source: "source-d.example",
    story: "rare-story-1",
    severity: 55,
    confidence: 85,
    hoursAgo: 10,
  }),
  event({
    id: "r2",
    category: "rare_earth",
    source: "source-e.example",
    story: "rare-story-2",
    severity: 65,
    confidence: 75,
    hoursAgo: 30,
  }),
];

describe("GRI v1.2 sensitivity contract", () => {
  it("reproduces the canonical v1.2 baseline before any counterfactual perturbation", () => {
    const canonical = calculateGri(rows, AS_OF);
    const counterfactual = calculateGriCounterfactual(rows, AS_OF);

    expect(counterfactual.rawScore).not.toBeNull();
    expect(canonical.rawScore).not.toBeNull();
    expect(
      Math.abs(counterfactual.rawScore - canonical.rawScore),
    ).toBeLessThan(1e-10);
    expect(counterfactual.displayScore).toBe(canonical.displayScore);
    expect(counterfactual.coverage).toBeCloseTo(canonical.coverage, 12);
    expect(counterfactual.eventCount).toBe(canonical.eventCount);
    expect(counterfactual.sourceCount).toBe(canonical.sourceCount);
    expect(counterfactual.independentStoryCount).toBe(
      canonical.independentStoryCount,
    );
  });

  it("keeps the predeclared scenario set deterministic and analysis-only", () => {
    expect(GRI_SENSITIVITY_SCENARIOS.length).toBeGreaterThanOrEqual(10);
    expect(
      new Set(GRI_SENSITIVITY_SCENARIOS.map((scenario) => scenario.id)).size,
    ).toBe(GRI_SENSITIVITY_SCENARIOS.length);

    for (const scenario of GRI_SENSITIVITY_SCENARIOS) {
      const first = calculateGriCounterfactual(
        rows,
        AS_OF,
        scenario.overrides,
      );
      const second = calculateGriCounterfactual(
        rows,
        AS_OF,
        scenario.overrides,
      );
      expect(second).toEqual(first);
      expect(first.rawScore).not.toBeNull();
      expect(Number.isFinite(first.rawScore)).toBe(true);
    }
  });

  it("supports shorter lookback sensitivity but refuses an incomplete longer-lookback inference", () => {
    const canonical = calculateGriCounterfactual(rows, AS_OF);
    const shorter = calculateGriCounterfactual(rows, AS_OF, {
      lookbackHours: 24,
    });

    expect(shorter.eventCount).toBeLessThan(canonical.eventCount);
    expect(() =>
      resolveSensitivityParameters({
        lookbackHours: 96,
      }),
    ).toThrow(/current published eligible universe remains complete/i);
  });

  it("keeps live evidence read-only and blocks predictive or institutional-grade claim upgrades", () => {
    const workflow = readFileSync(
      ".github/workflows/gri-calibration-sensitivity-evidence.yml",
      "utf8",
    );
    const sensitivityAudit = readFileSync(
      "scripts/audit-gri-v12-sensitivity.mjs",
      "utf8",
    );
    const validationAudit = readFileSync(
      "scripts/audit-gri-validation-evidence.mjs",
      "utf8",
    );

    expect(workflow).toContain("APP_SUPABASE_ANON_KEY");
    expect(workflow).not.toContain("SERVICE_ROLE");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sensitivityAudit).toContain(
      "predictiveAccuracyClaimAuthorized: false",
    );
    expect(sensitivityAudit).toContain(
      "institutionalGradeAccuracyClaimAuthorized: false",
    );
    expect(validationAudit).toContain(
      "predictiveAccuracyClaimAuthorized: false",
    );
    expect(validationAudit).toContain("causalityClaimAuthorized: false");
  });
});
