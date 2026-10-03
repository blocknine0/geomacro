import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("separate public risk indices contract", () => {
  it("publishes exactly three stable public index identities", () => {
    const types = read("src/lib/risk-indices.types.ts");
    const edge = read("supabase/functions/public-risk-indices/index.ts");
    const projection = read("src/lib/risk-indices-from-global-risk.ts");

    expect(types).toContain('"geopolitics"');
    expect(types).toContain('"macro"');
    expect(types).toContain('"critical_minerals"');
    expect(edge).toContain('name: "Geopolitical Risk Index"');
    expect(edge).toContain('name: "Macroeconomic Risk Index"');
    expect(edge).toContain('name: "Critical Minerals Risk Index"');
    expect(projection).toContain('name: "Geopolitical Risk Index"');
    expect(projection).toContain('name: "Macroeconomic Risk Index"');
    expect(projection).toContain('name: "Critical Minerals Risk Index"');
    expect(projection).toContain('sourceCategory: "rare_earth"');
  });

  it("keeps the v1.2 proof lineage instead of inventing a new historical calculation", () => {
    const edge = read("supabase/functions/public-risk-indices/index.ts");
    const types = read("src/lib/risk-indices.types.ts");
    const projection = read("src/lib/risk-indices-from-global-risk.ts");
    const assembler = read("src/lib/global-risk-assemble.ts");

    expect(edge).toContain('const METHOD_VERSION = "gri-v1.2.0"');
    expect(edge).toContain('const PROOF_VERSION = "gri-proof-v1.2.0"');
    expect(edge).toContain('proofScope: "verified-category-projection"');
    expect(types).toContain('proofScope: "verified-category-projection"');
    expect(projection).toContain('proofScope: "verified-category-projection"');
    expect(projection).toContain("risk.proofHash");
    expect(projection).toContain("risk.calculationHash");
    expect(assembler).toContain("category_breakdown");
    expect(assembler).toContain("seriesForDomain");
  });

  it("derives standalone index deltas score-to-score without reusing combined contribution deltas", () => {
    const edge = read("supabase/functions/public-risk-indices/index.ts");
    const assembler = read("src/lib/global-risk-assemble.ts");
    const projection = read("src/lib/risk-indices-from-global-risk.ts");

    expect(edge).toContain("currentForChange - previousScore");
    expect(edge).toContain("A standalone index delta is score-to-score");
    expect(assembler).toContain("current.score - previousEntry.reading.score");
    expect(projection).toContain("previousScore: domain.previousScore");
    expect(projection).toContain("changePoints: domain.changePoints");
    expect(projection).not.toContain("driver.change");
  });

  it("never creates a synthetic or zero fallback for an unavailable domain", () => {
    const edge = read("supabase/functions/public-risk-indices/index.ts");
    const projection = read("src/lib/risk-indices-from-global-risk.ts");
    const workspace = read("src/components/risk-indices/risk-indices-workspace.tsx");

    expect(edge).toContain('status: rawScore === null ? "unavailable" : "available"');
    expect(projection).toContain('status: "unavailable"');
    expect(projection).toContain("score: null");
    expect(workspace).toContain("does not substitute zero or a synthetic estimate");
    expect(workspace).toContain("No zero-risk or synthetic substitute");
  });

  it("keeps the legacy Supabase Edge Function read-only and bounded for explicit recovery only", () => {
    const edge = read("supabase/functions/public-risk-indices/index.ts");

    expect(edge).toContain('request.method !== "GET"');
    expect(edge).toContain('.from("gri_snapshots")');
    expect(edge).toContain('.from("events")');
    expect(edge).not.toMatch(/\.(insert|upsert|update|delete)\(/);
    expect(edge).not.toContain("source_url,source_name,source_domain");
    expect(edge).toContain("source_name: null");
    expect(edge).toContain("source_domain: null");
    expect(edge).toContain("source_url: null");
  });

  it("gives Risk Indices a dedicated B2/Cloudflare serving authority independent from Global Risk", () => {
    const publicIndices = read("server/api/public/risk-indices.get.ts");
    const indicesEdgeReader = read("src/lib/risk-indices-edge.server.ts");
    const globalEdgeReader = read("src/lib/global-risk-edge.server.ts");
    const indicesHook = read("src/lib/use-risk-indices.ts");
    const globalRiskHook = read("src/lib/use-global-risk.ts");
    const publisher = read("scripts/ops/publish-b2-risk-indices-direct-postgres.mjs");

    expect(indicesEdgeReader).toContain("geomacro-risk-indices.daspallab202391.workers.dev/risk-indices");
    expect(indicesEdgeReader).toContain("backblaze-b2-risk-indices-edge");
    expect(publicIndices).toContain("readRiskIndicesEdge");
    expect(publicIndices).not.toContain("readGlobalRiskEdge");
    expect(publicIndices).not.toContain("riskIndicesFromGlobalRisk");
    expect(indicesHook).toContain("RISK_INDICES_EDGE_URL");
    expect(indicesHook).toContain('const RISK_INDICES_APP_URL = "/api/public/risk-indices"');
    expect(indicesHook).not.toContain("GLOBAL_RISK_EDGE_URL");
    expect(globalRiskHook).toContain("GLOBAL_RISK_EDGE_URL");
    expect(globalRiskHook).not.toContain("RISK_INDICES_EDGE_URL");
    expect(globalEdgeReader).toContain("backblaze-b2-verified-edge");
    expect(publisher).toContain("risk-indices-independent/latest.json.gz");
    expect(publisher).not.toContain('const LIVE_KEY = "geomacro-evidence/v1/live/global-risk/');
  });

  it("keeps the legacy Supabase edge manual recovery only", () => {
    const workflow = read(".github/workflows/deploy-public-risk-indices-edge.yml");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("\n  push:\n");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("supabase functions deploy public-risk-indices");
    expect(workflow).toContain("manual recovery only");
    expect(workflow).toContain("ldpwajisioljyjtojvfx");
    expect(workflow).not.toContain("supabase db push");
    expect(workflow).not.toContain("supabase migration");
  });

  it("keeps /global-risk and /risk-indices on separate workspaces and read paths", () => {
    const globalRiskRoute = read("src/routes/global-risk.tsx");
    const riskIndicesRoute = read("src/routes/risk-indices.tsx");
    const globalRiskWorkspace = read("src/components/gri/global-risk-workspace.tsx");
    const riskIndicesWorkspace = read("src/components/risk-indices/risk-indices-workspace.tsx");
    const continuity = read("src/lib/global-risk-continuity.ts");

    expect(globalRiskRoute).toContain("GlobalRiskWorkspace");
    expect(globalRiskRoute).not.toContain("RiskIndicesWorkspace");
    expect(riskIndicesRoute).toContain("RiskIndicesWorkspace");
    expect(riskIndicesRoute).not.toContain("GlobalRiskWorkspace");
    expect(globalRiskWorkspace).toContain("useGlobalRisk");
    expect(riskIndicesWorkspace).toContain("useRiskIndices");
    expect(riskIndicesWorkspace).toContain("Three risks. Three separate indices.");
    expect(continuity).toContain("RISK_DOMAIN_HISTORY_CONTAINER_MISSING");
    expect(continuity).toContain("RISK_DOMAIN_${domain.toUpperCase()}_HISTORY_MISSING");
  });

  it("keeps public surfaces fail-closed without synthetic risk values", () => {
    const publicSurfaces = [
      read("src/components/home/risk-indices-preview.tsx"),
      read("src/components/risk-indices/risk-indices-workspace.tsx"),
      read("src/routes/intelligence.tsx"),
      read("src/routes/institutional.tsx"),
    ];

    for (const surface of publicSurfaces) {
      expect(surface).not.toContain("Verified GRI snapshot unavailable");
      expect(surface).not.toContain("Risk index store unavailable");
    }

    expect(read("src/routes/intelligence.tsx")).toContain("useRiskIndices");
    expect(read("src/routes/institutional.tsx")).toContain("Separate Geopolitical, Macroeconomic and Critical Minerals Risk Indices");
  });
});
