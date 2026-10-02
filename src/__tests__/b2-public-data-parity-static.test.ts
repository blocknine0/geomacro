import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("B2 public data parity", () => {
  it("keeps fresh observations and latest verified scored context visible together", () => {
    const source = read("src/lib/use-intelligence.ts");
    expect(source).toContain("usesVerifiedContext");
    expect(source).toContain('r.publicStatus === "verified_b2" && !r.isCurrent');
    expect(source).toContain("verifiedRiskContext");
    expect(source).toContain("const topRisks = [...currentScored]");
    expect(source).toContain("[...current, ...latestVerifiedContext]");
    expect(source).not.toContain("publishedAt: new Date().toISOString()");
  });

  it("labels mixed freshness truthfully instead of presenting stale verified rows as current", () => {
    const route = read("src/routes/intelligence.tsx");
    expect(route).toContain("Fresh live observations + latest verified scored B2 context");
    expect(route).toContain("Current + latest verified intelligence");
  });
});
