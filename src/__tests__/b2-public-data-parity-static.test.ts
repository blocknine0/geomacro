import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("B2 public data parity", () => {
  it("keeps only verified scored Intelligence visible while preserving last-verified context", () => {
    const source = read("src/lib/use-intelligence.ts");
    expect(source).toContain('r.public_status === "live_observed"');
    expect(source).toContain('payload.mode !== "verified_b2"');
    expect(source).toContain('Number(payload.live_observed_rows ?? 0) !== 0');
    expect(source).toContain("verifiedRiskContext");
    expect(source).toContain("current.length > 0");
    expect(source).toContain("hasLiveObserved: false");
    expect(source).not.toContain("publishedAt: new Date().toISOString()");
  });

  it("does not present stale verified rows as current", () => {
    const source = read("src/lib/use-intelligence.ts");
    expect(source).toContain("isCurrent: timeOf(row) >= now - DAY && timeOf(row) <= now");
    expect(source).toContain("usedFallbackWindow = in24h.length === 0");
    expect(source).toContain("verifiedRiskContext");
    expect(source).toContain("topRisks");
  });
});
