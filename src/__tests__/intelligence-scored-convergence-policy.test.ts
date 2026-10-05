import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/intelligence-scored-refresh.yml", "utf8");
const health = readFileSync(".github/workflows/production-website-health.yml", "utf8");
const reader = readFileSync("src/lib/public-intelligence-production.server.ts", "utf8");

describe("Intelligence scored/current convergence policy", () => {
  it("keeps the scheduled publisher aligned with canonical production serving semantics", () => {
    expect(workflow).toContain("scoredCurrentAcrossAllDomains");
    expect(workflow).toContain("body?.mode !== 'verified_b2'");
    expect(workflow).toContain("body?.mode !== 'verified_b2_plus_live_observed'");
    expect(workflow).toContain("proof.b2_readback_verified !== true");
    expect(workflow).toContain("proof.live_observed_unscored !== true");
  });

  it("matches outside-in website health policy", () => {
    expect(health).toContain("scoredCurrentAcrossAllDomains");
    expect(health).toContain("body?.mode !== 'verified_b2' || live !== 0");
    expect(health).toContain("body?.mode !== 'verified_b2_plus_live_observed' || live < 1");
  });

  it("keeps live observations unscored and only exposes them when scored freshness is incomplete", () => {
    expect(reader).toContain("const scoredCurrentAcrossAllDomains = hasCurrentScoredCoverage(verifiedRows)");
    expect(reader).toContain("const liveRows = scoredCurrentAcrossAllDomains ? [] : observedRows");
    expect(reader).toContain('row.public_status !== "live_observed"');
    expect(reader).toContain("row.severity !== null");
    expect(reader).toContain("row.delta !== null");
  });
});
