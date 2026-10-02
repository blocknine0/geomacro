import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("production website runtime contract", () => {
  it("keeps the public production health route B2 authoritative", () => {
    const health = read("src/routes/api.public-production-health.ts");
    expect(health).toContain('serving_authority: "backblaze-b2"');
    expect(health).toContain("supabase_required_for_serving: false");
    expect(health).toContain("b2_runtime_configured: configured");
    expect(health).toContain("readB2PublicIntelligence");
    expect(health).toContain("readB2PublicRisk");
    expect(health).not.toContain("getAppSupabase");
    expect(health).not.toContain("supabase.co/functions");
  });

  it("keeps Risk Indices on the same-origin B2 server boundary", () => {
    const hook = read("src/lib/use-risk-indices.ts");
    const server = read("src/lib/public-risk-indices.functions.ts");
    expect(hook).toContain("useServerFn(getPublicRiskIndices)");
    expect(hook).not.toContain("supabase.co");
    expect(server).toContain("readB2PublicRisk");
    expect(server).not.toContain("readPublicRiskIndicesFromEdge");
    expect(server).not.toContain("supabase.co");
  });

  it("keeps Intelligence and Ask production reads independent of Supabase", () => {
    const intel = read("src/lib/public-intelligence-b2.functions.ts");
    const ask = read("src/lib/hybrid-ask-intelligence.server.ts");
    expect(intel).toContain("readB2PublicIntelligence");
    expect(intel).not.toContain("getAppSupabase");
    expect(ask).toContain("readB2PublicIntelligence");
    expect(ask).not.toContain("getAppSupabase");
  });

  it("documents that hosted B2 secrets are separate from GitHub Actions secrets", () => {
    const contract = read("docs/PRODUCTION_WEBSITE_RUNTIME.md");
    expect(contract).toContain("B2_KEY_ID");
    expect(contract).toContain("B2_APPLICATION_KEY");
    expect(contract).toContain("GitHub Actions secrets do not automatically configure Lovable runtime secrets");
  });
});
