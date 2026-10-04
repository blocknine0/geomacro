import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("B2 public data parity", () => {
  it("keeps verified scores and current unscored observations explicitly separate", () => {
    const source = read("src/lib/use-intelligence.ts");
    expect(source).toContain('r.public_status === "live_observed"');
    expect(source).toContain('payload.mode === "verified_b2"');
    expect(source).toContain('payload.mode === "verified_b2_plus_live_observed"');
    expect(source).toContain("modeCountsAgree");
    expect(source).toContain("verifiedRiskContext");
    expect(source).toContain('r.publicStatus === "verified_b2"');
    expect(source).toContain("hasLiveObserved: liveRows.length > 0");
    expect(source).not.toContain("publishedAt: new Date().toISOString()");
  });

  it("does not present stale verified rows as current or promote live observations into scoring", () => {
    const source = read("src/lib/use-intelligence.ts");
    expect(source).toContain("isCurrent: timeOf(row) >= now - DAY && timeOf(row) <= now + 5 * 60_000");
    expect(source).toContain("usedFallbackWindow = currentRows.length === 0");
    expect(source).toContain("currentScored");
    expect(source).toContain("verifiedRiskContext");
    expect(source).toContain("topRisks");
    expect(source).toContain('r.publicStatus === "live_observed" && r.severity === null');
  });
});
