import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public intelligence preview route failure boundary", () => {
  const route = readFileSync("server/api/public/intelligence.get.ts", "utf8");

  it("defers the server-only reader import until inside the guarded handler", () => {
    expect(route).not.toMatch(/^import\s+\{\s*readProductionPublicIntelligence\s*\}/m);
    expect(route).toContain("const verified = await fetchVerifiedIntelligenceEdge()");
    expect(route).toContain("buildVerifiedIntelligenceApiPayload(verified)");
    expect(route.indexOf("fetchVerifiedIntelligenceEdge()")).toBeLessThan(route.indexOf("await import("));
    expect(route).toMatch(/await import\([\s\S]*?public-intelligence-production\.server/u);
  });

  it("fails closed without validated signals and never caches an error envelope", () => {
    expect(route).toContain('error:"INTELLIGENCE_UNAVAILABLE"');
    expect(route).toContain("rows:[]");
    expect(route).toContain("readWebsiteDerivedNews()");
    expect(route).toContain("derived_signals");
    expect(readFileSync("server/api/public/public-response-cache.server.ts","utf8"))
      .toContain('"Cache-Control":"no-store"');
  });

  it("exposes fresh derived-feed coverage separately from signed/scored row counts",()=>{
    expect(route).toContain("derived_rows:derived_signals.length");
    expect(route).toContain("derived_category_counts:derived_counts");
    expect(route).toContain("derived_latest_by_category");
    expect(route).toContain("derived_current_within_24h");
    expect(route).toContain("live_observed_rows:0");
    expect(route).not.toContain("live_observed_rows:derived_signals.length");
  });

  it("renders an institutional pending hero before the bounded source loaders finish",()=>{
    const page=readFileSync("src/routes/intelligence.tsx","utf8");
    expect(page).toContain("pendingMs: 0");
    expect(page).toContain("pendingComponent:");
    expect(page).toContain("Real-Time Geopolitical, Macro/FX &amp; Critical Minerals Risk Gates");
  });
});
