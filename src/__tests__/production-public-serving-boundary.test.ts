import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const PUBLIC_SERVING_FILES = [
  "src/lib/public-intelligence-b2.functions.ts",
  "src/lib/public-intelligence-seo.functions.ts",
  "src/lib/public-risk.functions.ts",
  "src/lib/public-risk-indices.functions.ts",
  "src/lib/use-risk-indices.ts",
  "src/lib/public-event.functions.ts",
  "src/lib/public-event-seo.functions.ts",
  "src/lib/hybrid-ask-intelligence.server.ts",
] as const;

describe("production public serving boundary", () => {
  it("keeps customer-facing production reads independent of Supabase", () => {
    for (const path of PUBLIC_SERVING_FILES) {
      const source = read(path);
      expect(source, path).not.toContain("supabase.co");
      expect(source, path).not.toContain("getAppSupabase");
      expect(source, path).not.toContain("readPublicGlobalRiskFromEdge");
    }
  });

  it("keeps B2 as the explicit production data authority", () => {
    const health = read("src/routes/api.health.ts");
    const productionHealth = read("src/routes/api.public-production-health.ts");

    expect(health).toContain('alignment_contract: "github-main-b2-primary-supabase-standby-lovable-v2"');
    expect(health).toContain('production_data_authority: "backblaze-b2"');
    expect(health).toContain('supabase_role: "ingestion-recovery-standby"');
    expect(health).toContain("supabase_recovery_project_ref");
    expect(productionHealth).toContain('serving_authority: "backblaze-b2"');
    expect(productionHealth).toContain("supabase_required_for_serving: false");
  });

  it("continuously monitors the core production website", () => {
    const workflow = read(".github/workflows/production-website-health.yml");
    expect(workflow).toContain("/api/public-production-health");
    expect(workflow).toContain("/intelligence");
    expect(workflow).toContain("/global-risk");
    expect(workflow).toContain("/ask-geomacro");
    expect(workflow).toContain('"serving_authority":"backblaze-b2"');
  });
});
