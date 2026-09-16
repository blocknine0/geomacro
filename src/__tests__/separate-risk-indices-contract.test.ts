import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("separate public risk indices contract", () => {
  it("publishes exactly three stable public index identities", () => {
    const types = read("src/lib/risk-indices.types.ts");
    const edge = read("supabase/functions/public-risk-indices/index.ts");

    expect(types).toContain('"geopolitics"');
    expect(types).toContain('"macro"');
    expect(types).toContain('"critical_minerals"');
    expect(edge).toContain('name: "Geopolitical Risk Index"');
    expect(edge).toContain('name: "Macroeconomic Risk Index"');
    expect(edge).toContain('name: "Critical Minerals Risk Index"');
    expect(edge).toContain('sourceCategory: "rare_earth"');
  });

  it("keeps the v1.2 proof lineage instead of inventing a new historical calculation", () => {
    const edge = read("supabase/functions/public-risk-indices/index.ts");
    const types = read("src/lib/risk-indices.types.ts");

    expect(edge).toContain('const METHOD_VERSION = "gri-v1.2.0"');
    expect(edge).toContain('const PROOF_VERSION = "gri-proof-v1.2.0"');
    expect(edge).toContain('proofScope: "verified-category-projection"');
    expect(types).toContain('proofScope: "verified-category-projection"');
    expect(edge).toContain('snapshot.verification_status !== "verified"');
    expect(edge).toContain("reconciliation_residual_invalid");
    expect(edge).toContain("change_residual_invalid");
  });

  it("uses score-to-score change for standalone indices, not old combined contribution-point change", () => {
    const edge = read("supabase/functions/public-risk-indices/index.ts");

    expect(edge).toContain("currentForChange - previousScore");
    expect(edge).toContain("A standalone index delta is score-to-score");
  });

  it("never creates a synthetic or zero fallback for an unavailable domain", () => {
    const edge = read("supabase/functions/public-risk-indices/index.ts");
    const workspace = read("src/components/risk-indices/risk-indices-workspace.tsx");

    expect(edge).toContain('status: rawScore === null ? "unavailable" : "available"');
    expect(edge).toContain("score: rawScore === null ? null : Math.round(rawScore)");
    expect(workspace).toContain("Missing evidence is never displayed as zero risk");
    expect(workspace).toContain("does not substitute zero or a synthetic estimate");
  });

  it("keeps the Supabase Edge Function read-only and public-data bounded", () => {
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

  it("removes Lovable runtime database bindings as the sole public-read dependency", () => {
    const publicRisk = read("src/lib/public-risk.functions.ts");
    const edgeReader = read("src/lib/public-risk-edge.server.ts");

    expect(publicRisk).toContain("readPublicGlobalRiskFromEdge");
    expect(publicRisk).toContain("hosted canonical read unavailable; trying authoritative edge");
    expect(edgeReader).toContain("ldpwajisioljyjtojvfx");
    expect(edgeReader).toContain("/functions/v1/public-risk-indices");
    expect(edgeReader).not.toContain("APP_SUPABASE_URL");
    expect(edgeReader).not.toContain("VITE_SUPABASE_URL");
  });

  it("switches the public /global-risk workspace away from a combined headline GRI", () => {
    const route = read("src/routes/global-risk.tsx");
    const workspace = read("src/components/risk-indices/risk-indices-workspace.tsx");

    expect(route).toContain("RiskIndicesWorkspace");
    expect(route).toContain("Geopolitical, Macro & Critical Minerals");
    expect(workspace).toContain("Three risks. Three separate indices.");
    expect(workspace).toContain("instead of being compressed into one combined headline score");
  });
});
