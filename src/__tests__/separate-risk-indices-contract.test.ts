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

    expect(edge).toContain('const METHOD_VERSION = "gri-v1.2.0"');
    expect(edge).toContain('const PROOF_VERSION = "gri-proof-v1.2.0"');
    expect(edge).toContain('proofScope: "verified-category-projection"');
    expect(types).toContain('proofScope: "verified-category-projection"');
    expect(projection).toContain('proofScope: "verified-category-projection"');
    expect(projection).toContain("risk.proofHash");
    expect(projection).toContain("risk.calculationHash");
  });

  it("never reuses the old combined contribution-point change as a standalone index delta", () => {
    const edge = read("supabase/functions/public-risk-indices/index.ts");
    const projection = read("src/lib/risk-indices-from-global-risk.ts");

    expect(edge).toContain("currentForChange - previousScore");
    expect(edge).toContain("A standalone index delta is score-to-score");
    expect(projection).toContain("changePoints: null");
    expect(projection).toContain("previousScore: null");
  });

  it("never creates a synthetic or zero fallback for an unavailable domain", () => {
    const edge = read("supabase/functions/public-risk-indices/index.ts");
    const projection = read("src/lib/risk-indices-from-global-risk.ts");
    const workspace = read("src/components/risk-indices/risk-indices-workspace.tsx");

    expect(edge).toContain('status: rawScore === null ? "unavailable" : "available"');
    expect(projection).toContain('status: score === null ? "unavailable" : "available"');
    expect(projection).toContain("score: score === null ? null : Math.round(score)");
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

  it("uses B2 as the customer-facing production authority through an explicit public API", () => {
    const publicRisk = read("src/lib/public-risk.functions.ts");
    const publicIndices = read("server/api/public/risk-indices.get.ts");
    const hook = read("src/lib/use-risk-indices.ts");

    expect(publicRisk).toContain("readB2PublicRisk");
    expect(publicRisk).not.toContain("readPublicGlobalRiskFromEdge");
    expect(publicIndices).toContain("readB2PublicRisk");
    expect(publicIndices).toContain("riskIndicesFromGlobalRisk");
    expect(hook).toContain('/api/public/risk-indices');
    expect(hook).not.toContain("useServerFn");
    expect(hook).not.toContain("supabase.co");
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

  it("keeps /global-risk as the detailed three-index workspace while the homepage links to it without rendering live index data", () => {
    const route = read("src/routes/global-risk.tsx");
    const workspace = read("src/components/risk-indices/risk-indices-workspace.tsx");
    const commercialHome = read("src/components/home/commercial-home.tsx");
    const homeSection = read("src/components/home/gri-section.tsx");

    expect(route).toContain("RiskIndicesWorkspace");
    expect(route).toContain("Geopolitical, Macro & Critical Minerals");
    expect(workspace).toContain("Three risks. Three separate indices.");
    expect(workspace).toContain("instead of being compressed into one combined headline score");
    expect(commercialHome).toContain('to="/global-risk"');
    expect(commercialHome).toContain("View Risk Indices");
    expect(commercialHome).toContain("Critical minerals & rare earths");
    expect(commercialHome).not.toContain("View Global Risk Index");
    expect(commercialHome).not.toContain("useGlobalRisk");
    expect(commercialHome).not.toContain("RiskIndicesSection");
    expect(homeSection).toContain("RiskIndicesSection");
    expect(homeSection).not.toContain("GlobalRiskIndexSection");
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
