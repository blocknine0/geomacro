import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/public-intelligence-production.server.ts", "utf8");
const sanitizer = readFileSync("src/lib/public-intelligence-gist.ts", "utf8");

describe("#1414 scored-first public Intelligence", () => {
  it("requires current canonical scored coverage across all three launch domains", () => {
    expect(source).toContain('const REQUIRED_CATEGORIES = ["geopolitics", "macro", "rare_earth"] as const');
    expect(source).toContain("function hasCurrentScoredCoverage");
    expect(source).toContain("now - timestamp <= DAY_MS");
  });

  it("suppresses unscored discovery rows only after all-domain scored coverage is current", () => {
    expect(source).toContain("const scoredCurrentAcrossAllDomains = hasCurrentScoredCoverage(verifiedRows)");
    expect(source).toContain("const liveRows = scoredCurrentAcrossAllDomains ? [] : observedRows");
    expect(source).toContain("const rows = scoredCurrentAcrossAllDomains ? verifiedRows : normalized");
  });

  it("keeps live observations unscored and geopolitical-only as a fail-closed fallback", () => {
    expect(source).toContain('category !== "geopolitics"');
    expect(source).toContain("row.severity !== null");
    expect(source).toContain("row.delta !== null");
    expect(source).toContain("sanitizePublicIntelligenceRow(row)");
    expect(sanitizer).toContain('const status = observed ? "live_observed" as const : "verified_b2" as const;');
    expect(sanitizer).toContain("severity !== null || input.delta !== null");
  });
});
