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

  it("keeps Risk Indices on its own proof-validated edge without Global Risk or Lovable private B2 coupling", () => {
    const hook = read("src/lib/use-risk-indices.ts");
    const api = read("server/api/public/risk-indices.get.ts");
    const edgeReader = read("src/lib/risk-indices-edge.server.ts");
    expect(hook).toContain('/api/public/risk-indices');
    expect(hook).toContain("RISK_INDICES_EDGE_URL");
    expect(hook).toContain("AbortSignal.timeout(REQUEST_TIMEOUT_MS)");
    expect(hook).not.toContain("useServerFn");
    expect(hook).not.toContain("supabase.co");
    expect(hook).not.toContain("GLOBAL_RISK_EDGE_URL");
    expect(edgeReader).toContain("backblaze-b2-risk-indices-edge");
    expect(edgeReader).toContain("geomacro-risk-indices.daspallab202391.workers.dev/risk-indices");
    expect(api).toContain("readRiskIndicesEdge");
    expect(api).not.toContain("readGlobalRiskEdge");
    expect(api).not.toContain("riskIndicesFromGlobalRisk");
    expect(api).not.toContain("readB2PublicRisk");
    expect(api).not.toContain("b2-live.server");
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

  it("keeps current observations public only as certified, derived and explicitly unscored evidence", () => {
    const reader = read("src/lib/public-intelligence-production.server.ts");
    const hook = read("src/lib/use-intelligence.ts");
    const publisher = read("scripts/ops/publish-b2-public-intelligence-direct-postgres.mjs");

    expect(reader).toContain('public_status: "verified_b2" | "live_observed"');
    expect(reader).toContain('SCORED_TITLE_PREFIX = "Geomacro finds "');
    expect(reader).toContain('LIVE_TITLE_PREFIX = "Geomacro observes "');
    expect(reader).toContain("normalizedLiveObservedRow");
    expect(reader).not.toContain("fetchUsgsMacro");
    expect(reader).not.toContain("LIVE_OVERLAY_TRIGGER_AGE_MS");
    expect(hook).toContain('r.public_status === "live_observed"');
    expect(hook).toContain('payload.mode === "verified_b2_plus_live_observed"');
    expect(hook).toContain('hasLiveObserved: liveRows.length > 0');
    expect(hook).toContain('r.publicStatus === "verified_b2"');
    expect(publisher).toContain("PUBLIC_INTELLIGENCE_LIVE_OBSERVED_ROW_INVALID");
    expect(publisher).toContain('title.startsWith("Geomacro finds ")');
    expect(publisher).toContain('title.startsWith("Geomacro observes ")');
    expect(publisher).toContain('live_observed_unscored: true');
    expect(publisher).toContain('synthetic_score: false');
    expect(publisher).toContain("guardian_commercial_dependency: false");
    expect(publisher).toContain("raw_source_headlines_exposed: false");
    expect(publisher).toContain("provider_identity_exposed: false");
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
    for (const surface of [intelligence, ask, event]) {
      expect(surface).toContain("withPublicRuntimeTimeout");
    }
    expect(risk).toContain("AbortSignal.timeout(REQUEST_TIMEOUT_MS)");
    expect(risk).toContain("const REQUEST_TIMEOUT_MS = 8_000");
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

  it("binds final website acceptance to exact-source lock, evidence time and mirror parity", () => {
    const workflow = read(".github/workflows/production-website-health.yml");
    const intelligenceCard = read("src/components/intelligence/card.tsx");
    const intelligenceHook = read("src/lib/use-intelligence.ts");
    const intelligenceRoute = read("src/routes/intelligence.tsx");
    const pricing = read("src/routes/pricing.tsx");
    const institutional = read("src/routes/institutional.tsx");

    expect(workflow).toContain("Verify checked-out website lock on exact candidate SHA");
    expect(workflow).toContain("node scripts/ops/verify-website-lock.mjs");
    expect(workflow).toContain("Verify Lovable mirror source parity");
    expect(workflow).toContain("LOVABLE_MIRROR_TOKEN");
    expect(workflow).toContain("geomacro-160c8e56/contents/.geomacro-canonical-main");
    expect(workflow).toContain("Verify Ask Geomacro desktop and mobile rendering contract");
    expect(workflow).toContain(`Verify Ask Geomacro desktop and mobile rendering contract
        # Website rendering is independent evidence. A B2/data-plane failure
        # above must not suppress desktop/mobile acceptance diagnostics.
        if: always()`);
    expect(workflow).toContain("Windows NT 10.0; Win64; x64");
    expect(workflow).toContain("iPhone; CPU iPhone OS 18_0");

    expect(intelligenceCard).toContain("event.publishedAt ?? event.createdAt");
    expect(intelligenceHook).toContain("function latestEvidenceAt(rows: IntelEvent[]): number | null");
    expect(intelligenceHook).toContain("initialData ? latestEvidenceAt(initialData.all) : null");
    expect(intelligenceHook).toContain("setUpdatedAt(latestEvidenceAt(next.all))");
    expect(intelligenceHook).not.toContain("setUpdatedAt(Date.now())");
    expect(intelligenceRoute).toContain("Score dates remain the original verified evidence times.");
    expect(pricing).toContain("Free to explore. Pay only for successful commercial machine delivery.");
    expect(pricing).toContain("Commercial revenue begins only after production settlement is explicitly authorized and verified.");
    expect(institutional).toContain("Institutional delivery is limited to governed Geomacro risk intelligence");
  });

  it("checks rendered route content plus functional public APIs", () => {
    const workflow = read(".github/workflows/production-website-health.yml");
    expect(workflow).toContain("Verify public production APIs and current Intelligence contract");
    expect(workflow).toContain("Verify live build marker matches canonical main");
    expect(workflow).toContain("/.well-known/geomacro-build.json");
    expect(workflow).toContain("LIVE_DEPLOYMENT_SHA_MISMATCH");
    expect(workflow).toContain("Verify Ask Geomacro desktop and mobile rendering contract");
    expect(workflow).toContain("iPhone; CPU iPhone OS 18_0");
    expect(workflow).toContain("scoredCurrentAcrossAllDomains");
    expect(workflow).toContain("body?.mode !== 'verified_b2' || live !== 0");
    expect(workflow).toContain("body?.mode !== 'verified_b2_plus_live_observed' || live < 1");
    expect(workflow).toContain('/api/public/intelligence');
    expect(workflow).toContain('/api/public/risk-indices');
    expect(workflow).toContain('/api/public-ask');
    expect(workflow).toContain("This page didn't load");
    expect(workflow).toContain("/intelligence|Risk Intelligence");
    expect(workflow).toContain("/global-risk|");
    expect(workflow).toContain("/ask-geomacro|Ask Geomacro");
    expect(workflow).toContain("/pricing|Access & pricing");
    expect(workflow).toContain("/docs|Geomacro public documentation");
    expect(workflow).toContain(`Verify rendered production page markers
        # Keep route/UI evidence observable even when an upstream data-plane
        # gate fails. The overall workflow still fails closed on that gate.
        if: always()`);
    expect(workflow).toContain("production-website-surfaces-${{ github.run_id }}");
    expect(workflow).toContain("Verify live D1 control plane and fail-closed auth");
    expect(workflow).toContain("geomacro-control-plane.daspallab202391.workers.dev");
    expect(workflow).toContain("d1_unauthenticated_write_rejected");
    expect(workflow).toContain("geomacro.section11-production-deployment-acceptance.v1");
    expect(workflow).toContain("published_site_matches_canonical_main");
    expect(workflow).toContain("lovable_mirror_matches_canonical_main");
  });

  it("documents that hosted B2 secrets are separate from GitHub Actions secrets", () => {
    const contract = read("docs/PRODUCTION_WEBSITE_RUNTIME.md");
    expect(contract).toContain("B2_KEY_ID");
    expect(contract).toContain("B2_APPLICATION_KEY");
    expect(contract).toContain("GitHub Actions secrets do not automatically configure Lovable runtime secrets");
  });
});
