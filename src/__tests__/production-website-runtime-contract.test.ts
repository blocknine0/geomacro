import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("production website runtime contract", () => {
  it("keeps canonical health deep readiness B2 authoritative", () => {
    const health = read("src/routes/api.health.ts");
    expect(health).toContain('searchParams.get("deep") === "1"');
    expect(health).toContain('serving_authority: "backblaze-b2"');
    expect(health).toContain("supabase_required_for_serving: false");
    expect(health).toContain("b2PublicRuntimeConfigured");
    expect(health).toContain("readB2PublicIntelligence");
    expect(health).toContain("readB2PublicRisk");
    expect(health).toContain("status: deepReady ? 200 : 503");
    expect(health).not.toContain("getAppSupabase");
    expect(health).not.toContain("supabase.co/functions");
  });

  it("keeps Risk Indices on the framework-safe B2 server boundary", () => {
    const hook = read("src/lib/use-risk-indices.ts");
    const server = read("src/lib/public-risk-indices.functions.ts");
    expect(hook).toContain("useServerFn(getPublicRiskIndices)");
    expect(hook).toContain("withPublicRuntimeTimeout");
    expect(hook).toContain("PUBLIC_DATA_REQUEST_TIMEOUT_MS");
    expect(hook).not.toContain("supabase.co");
    expect(server).toContain("readB2PublicRisk");
    expect(server).toContain("assertPublicReadOrigin");
    expect(server).not.toContain("readPublicRiskIndicesFromEdge");
    expect(server).not.toContain("supabase.co");
  });

  it("keeps Intelligence and Ask production reads independent of Supabase", () => {
    const intel = read("src/lib/public-intelligence-b2.functions.ts");
    const ask = read("src/lib/hybrid-ask-intelligence.server.ts");
    expect(intel).toContain("readB2PublicIntelligence");
    expect(intel).toContain("assertPublicReadOrigin");
    expect(intel).not.toContain("getAppSupabase");
    expect(ask).toContain("readB2PublicIntelligence");
    expect(ask).not.toContain("getAppSupabase");
  });

  it("bounds every interactive public server-function wait so loading cannot hang forever", () => {
    const timeout = read("src/lib/public-runtime-timeout.ts");
    const intelligence = read("src/lib/use-intelligence.ts");
    const risk = read("src/lib/use-risk-indices.ts");
    const ask = read("src/components/ask/ask-workspace.tsx");
    const event = read("src/components/intelligence/event-detail-workspace.tsx");

    expect(timeout).toContain("PUBLIC_DATA_REQUEST_TIMEOUT_MS = 10_000");
    expect(timeout).toContain("PUBLIC_ASK_REQUEST_TIMEOUT_MS = 25_000");
    expect(timeout).toContain("Promise.race");
    for (const surface of [intelligence, risk, ask, event]) {
      expect(surface).toContain("withPublicRuntimeTimeout");
    }
  });

  it("keeps route loaders fail-closed without collapsing the whole page", () => {
    const intelligence = read("src/routes/intelligence.tsx");
    const event = read("src/routes/event.$eventId.tsx");

    expect(intelligence).toContain("[intelligence-route] preload failed; rendering fail-closed workspace");
    expect(intelligence).toContain("return { rows: [], now }");
    expect(event).toContain("[event-route] preload failed; rendering unavailable state");
    expect(event).toContain("return null");
    expect(intelligence).toContain("Risk Indices temporarily unavailable");
  });

  it("checks rendered route content rather than accepting HTTP 200 alone", () => {
    const workflow = read(".github/workflows/production-website-health.yml");
    expect(workflow).toContain("Verify rendered production page markers");
    expect(workflow).toContain("This page didn't load");
    expect(workflow).toContain("/intelligence|Risk Intelligence");
    expect(workflow).toContain("/global-risk|Geomacro Risk Indices");
    expect(workflow).toContain("/ask-geomacro|Ask Geomacro");
    expect(workflow).toContain("/pricing|Access & pricing");
    expect(workflow).toContain("/docs|Geomacro public documentation");
  });

  it("documents that hosted B2 secrets are separate from GitHub Actions secrets", () => {
    const contract = read("docs/PRODUCTION_WEBSITE_RUNTIME.md");
    expect(contract).toContain("B2_KEY_ID");
    expect(contract).toContain("B2_APPLICATION_KEY");
    expect(contract).toContain("GitHub Actions secrets do not automatically configure Lovable runtime secrets");
  });
});
