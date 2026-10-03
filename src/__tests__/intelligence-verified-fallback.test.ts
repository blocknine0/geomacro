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

  it("keeps customer-facing Intelligence scored-only, derived-only and three-domain", () => {
    const productionReader = read("src/lib/public-intelligence-production.server.ts");
    const recoveryReader = read("src/lib/public-intelligence.functions.ts");
    const api = read("server/api/public/intelligence.get.ts");
    const hook = read("src/lib/use-intelligence.ts");
    const directPublisher = read("scripts/ops/publish-b2-public-intelligence-direct-postgres.mjs");

    expect(productionReader).toContain("readB2PublicIntelligence");
    expect(productionReader).not.toContain("getAppSupabase");
    expect(productionReader).toContain('public_status: "verified_b2"');
    expect(productionReader).toContain('DERIVED_TITLE_PREFIX = "Geomacro finds "');
    expect(productionReader).toContain("INTELLIGENCE_SCORED_PACKAGE_EMPTY");
    expect(productionReader).toContain("assertThreeDomainCoverage");
    expect(productionReader).not.toContain("fetchUsgsMacro");

    expect(recoveryReader).toContain("normalizeScoredRow");
    expect(recoveryReader).toContain('.not("severity", "is", null)');
    expect(recoveryReader).toContain("isGuardian");
    expect(recoveryReader).toContain("derivedEnglishTitle");
    expect(recoveryReader).toContain("Raw upstream");

    expect(api).toContain("readProductionPublicIntelligence");
    expect(hook).toContain('/api/public/intelligence');
    expect(hook).not.toContain("useServerFn");
    expect(hook).toContain('r.public_status === "live_observed"');
    expect(hook).toContain('hasLiveObserved: false');

    expect(directPublisher).toContain("PUBLIC_INTELLIGENCE_UNSCORED_ROW_REJECTED");
    expect(directPublisher).toContain('scoring_policy: "canonical-classifier-scored-only-derived-english"');
    expect(directPublisher).toContain('public_language: "en"');
    expect(directPublisher).toContain('guardian_commercial_dependency: false');
    expect(directPublisher).toContain("lower(coalesce(source_name, '')) not like '%guardian%'");
    expect(directPublisher).toContain('title.startsWith("Geomacro finds ")');
  });
});
