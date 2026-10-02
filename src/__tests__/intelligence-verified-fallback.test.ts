import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("Intelligence verified fallback contract", () => {
  it("keeps bounded verified B2 public snapshots readable during upstream outages", () => {
    const source = read("src/lib/b2-live.server.ts");

    expect(source).toContain("PUBLIC_INTELLIGENCE_FALLBACK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000");
    expect(source).toContain("PUBLIC_RISK_FALLBACK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000");
    expect(source).toContain("recentEnough(payload.generated_at, PUBLIC_INTELLIGENCE_FALLBACK_MAX_AGE_MS)");
    expect(source).toContain("recentEnough(payload.generated_at, PUBLIC_RISK_FALLBACK_MAX_AGE_MS)");
    expect(source).toContain('["geopolitics", "macro", "rare_earth"]');
  });

  it("keeps durable customer-facing Intelligence B2 authoritative while allowing an unscored ephemeral freshness overlay", () => {
    const productionReader = read("src/lib/public-intelligence-production.server.ts");
    const api = read("server/api/public/intelligence.get.ts");
    const hook = read("src/lib/use-intelligence.ts");
    const publisher = read("scripts/ops/publish-b2-live-snapshots.ts");

    expect(productionReader).toContain("readB2PublicIntelligence");
    expect(productionReader).not.toContain("getAppSupabase");
    expect(productionReader).toContain('public_status: "verified_b2" | "live_observed"');
    expect(productionReader).toContain("severity: null");
    expect(productionReader).toContain("delta: null");
    expect(api).toContain("readProductionPublicIntelligence");
    expect(hook).toContain('/api/public/intelligence');
    expect(hook).not.toContain("useServerFn");
    expect(publisher).toContain("readPublicIntelligenceRowsFromSupabase");
  });
});
