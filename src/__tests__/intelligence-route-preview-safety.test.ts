import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public intelligence preview route failure boundary", () => {
  const route = readFileSync("server/api/public/intelligence.get.ts", "utf8");

  it("defers the server-only reader import until inside the guarded handler", () => {
    expect(route).not.toMatch(/^import\s+\{\s*readProductionPublicIntelligence\s*\}/m);
    expect(route).toContain("const verified = await fetchVerifiedIntelligenceEdge()");
    expect(route).toContain("buildVerifiedIntelligenceApiPayload(verified)");
    expect(route.indexOf("fetchVerifiedIntelligenceEdge()")).toBeLessThan(route.indexOf("await import("));
    expect(route).toContain('await import(\n      "../../../src/lib/public-intelligence-production.server"');
  });

  it("fails closed on import/read failures, never returns fabricated intelligence", () => {
    expect(route).toContain('setResponseStatus(event, 503)');
    expect(route).toContain('error: "INTELLIGENCE_UNAVAILABLE"');
    expect(route).toContain("rows: []");
    expect(route).toContain('"Cache-Control": "no-store, max-age=0"');
  });
});
