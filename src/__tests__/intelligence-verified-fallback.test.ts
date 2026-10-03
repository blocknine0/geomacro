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

  it("keeps customer-facing Intelligence scored-only and preserves last verified B2 continuity", () => {
    const productionReader = read("src/lib/public-intelligence-production.server.ts");
    const recoveryReader = read("src/lib/public-intelligence.functions.ts");
    const api = read("server/api/public/intelligence.get.ts");
    const hook = read("src/lib/use-intelligence.ts");
    const publisher = read("scripts/ops/publish-b2-live-snapshots.ts");
    const directPublisher = read("scripts/ops/publish-b2-public-intelligence-direct-postgres.mjs");

    expect(productionReader).toContain("readB2PublicIntelligence");
    expect(productionReader).not.toContain("getAppSupabase");
    expect(productionReader).toContain('public_status: "verified_b2"');
    expect(productionReader).toContain("INTELLIGENCE_SCORED_PACKAGE_EMPTY");
    expect(productionReader).toContain("assertThreeDomainCoverage");
    expect(productionReader).not.toContain('public_status: "live_observed"');

    expect(recoveryReader).toContain("normalizeScoredRow");
    expect(recoveryReader).toContain('.not("severity", "is", null)');
    expect(recoveryReader).toContain("can never enter the B2 public package");

    expect(api).toContain("readProductionPublicIntelligence");
    expect(hook).toContain('/api/public/intelligence');
    expect(hook).not.toContain("useServerFn");

    expect(publisher).toContain("readPublicIntelligenceRowsFromSupabase");
    expect(directPublisher).toContain("PUBLIC_INTELLIGENCE_UNSCORED_ROW_REJECTED");
    expect(directPublisher).toContain('scoring_policy: "canonical-classifier-scored-only"');
  });
});
