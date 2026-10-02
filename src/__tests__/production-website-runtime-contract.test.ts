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

  it("keeps Risk Indices on an explicit B2-backed public API boundary", () => {
    const hook = read("src/lib/use-risk-indices.ts");
    const api = read("server/api/public/risk-indices.get.ts");
    expect(hook).toContain('/api/public/risk-indices');
    expect(hook).not.toContain("useServerFn");
    expect(hook).toContain("withPublicRuntimeTimeout");
    expect(hook).toContain("PUBLIC_DATA_REQUEST_TIMEOUT_MS");
    expect(hook).not.toContain("supabase.co");
    expect(api).toContain("readB2PublicRisk");
    expect(api).toContain("riskIndicesFromGlobalRisk");
    expect(api).not.toContain("Supabase");
  });

  it("keeps Intelligence and Ask customer reads independent of Supabase serving", () => {
    const intelligenceHook = read("src/lib/use-intelligence.ts");
    const intelligenceApi = read("server/api/public/intelligence.get.ts");
    const productionReader = read("src/lib/public-intelligence-production.server.ts");
    const askUi = read("src/components/ask/ask-workspace.tsx");
    const askApi = read("server/api/public-ask.get.ts");
    const askCore = read("src/lib/ask-geomacro-core.server.ts");
    const askEngine = read("src/lib/hybrid-ask-intelligence.server.ts");

    expect(intelligenceHook).toContain('/api/public/intelligence');
    expect(intelligenceHook).not.toContain("useServerFn");
    expect(intelligenceApi).toContain("readProductionPublicIntelligence");
    expect(productionReader).toContain("readB2PublicIntelligence");
    expect(productionReader).not.toContain("getAppSupabase");

    expect(askUi).toContain('/api/public-ask');
    expect(askUi).toContain('"X-Geomacro-Question"');
    expect(askUi).not.toContain("useServerFn");
    expect(askApi).toContain("executeAskGeomacro");
    expect(askCore).toContain("checkAskRateLimit(clientKey)");
    expect(askEngine).toContain("readB2PublicIntelligence");
    expect(askEngine).not.toContain("getAppSupabase");
  });

  it("keeps live freshness explicitly observed and unscored", () => {
    const reader = read("src/lib/public-intelligence-production.server.ts");
    const hook = read("src/lib/use-intelligence.ts");
    const route = read("src/routes/intelligence.tsx");

    expect(reader).toContain('public_status: "verified_b2" | "live_observed"');
    expect(reader).toContain('sort", "DateDesc"');
    expect(reader).toContain("severity: null");
    expect(reader).toContain("delta: null");
    expect(reader).toContain("LIVE_OVERLAY_TRIGGER_AGE_MS");
    expect(reader).toContain("LIVE_MAX_AGE_MS");
    expect(hook).toContain('publicStatus: "verified_b2" | "live_observed"');
    expect(route).toContain("Live observed · unscored");
    expect(route).toContain("live observations are shown unscored");
  });

  it("bounds every interactive public wait so loading cannot hang forever", () => {
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

  it("checks rendered route content plus functional public APIs", () => {
    const workflow = read(".github/workflows/production-website-health.yml");
    expect(workflow).toContain("Verify public production APIs and freshness");
    expect(workflow).toContain('/api/public/intelligence');
    expect(workflow).toContain('"current_within_24h":true');
    expect(workflow).toContain('/api/public/risk-indices');
    expect(workflow).toContain('/api/public-ask');
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
