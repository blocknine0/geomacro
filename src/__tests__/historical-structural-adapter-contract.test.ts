import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("historical structural edge adapter contract", () => {
  const source = read("supabase/functions/historical-structural-context/index.ts");

  it("keeps warehouse credentials server-only", () => {
    expect(source).toContain("HISTORICAL_SUPABASE_URL");
    expect(source).toContain("HISTORICAL_SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toMatch(/VITE_HISTORICAL_|window\.(?:localStorage|sessionStorage).*HISTORICAL/);
  });

  it("requires a service-role JWT before reading the historical warehouse", () => {
    expect(source).toContain('payload?.role === "service_role"');
    expect(source).toContain('if (!authIsServiceRole(request))');
    expect(source).toContain('return response({ ok: false, error: "UNAUTHORIZED" }, 401)');
  });

  it("preserves the evidence-only methodology boundary", () => {
    expect(source).toContain("EVIDENCE_ONLY_NOT_IN_GRI_V1_2");
    expect(source).toContain("EVIDENCE_ONLY_NOT_IN_GRO_V02");
    expect(source).toContain("Missing data is disclosed and is never interpreted as zero risk.");
    expect(source).not.toContain("risk_score");
    expect(source).not.toContain("weight");
  });

  it("does not expose raw warehouse tables as an unrestricted public route", () => {
    expect(source).toContain('request.method !== "POST"');
    expect(source).toContain('"cache-control": "no-store"');
    expect(source).not.toContain("Access-Control-Allow-Origin");
    expect(source).not.toContain("Deno.env.get("VITE_");
  });
});
