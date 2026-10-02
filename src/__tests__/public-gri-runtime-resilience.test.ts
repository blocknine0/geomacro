import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("public risk runtime resilience", () => {
  it("keeps customer-facing risk serving on verified B2 without automatic Supabase recovery", () => {
    const server = read("src/lib/public-risk.functions.ts");
    const b2 = read("src/lib/b2-live.server.ts");

    expect(server).toContain("readB2PublicRisk");
    expect(server).toContain('code: "RISK_INDEX_UNAVAILABLE"');
    expect(server).toContain("assertSameOrigin();");
    expect(server).toContain("verified B2 public risk snapshot unavailable");
    expect(server).not.toContain("readPublicGlobalRiskFromEdge");
    expect(server).not.toContain("readPublicGlobalRisk()");
    expect(server).not.toContain("supabase.co");
    expect(b2).toContain("B2_PUBLIC_RISK_KEY");
    expect(b2).toContain("PUBLIC_RISK_FALLBACK_MAX_AGE_MS");
  });

  it("returns an explicit retryable unavailable result only when verified B2 has no usable package", () => {
    const server = read("src/lib/public-risk.functions.ts");

    expect(server).toContain("const data = await readB2PublicRisk()");
    expect(server).toContain("if (data) return { ok: true, data }");
    expect(server).toContain("The latest verified risk package is temporarily unavailable. Please retry.");
    expect(server).toContain("retryable: true");
    expect(server).not.toContain("synthetic");
  });

  it("preserves last verified data on refresh failure and exposes a cold-start error instead of loading forever", () => {
    const legacyHook = read("src/lib/use-global-risk.ts");
    const indicesHook = read("src/lib/use-risk-indices.ts");

    expect(legacyHook).toContain("if (!response.ok)");
    expect(legacyHook).toContain("throw new Error(response.message)");
    expect(indicesHook).toContain('setStatus(hasData.current ? "ready" : "error")');
    expect(indicesHook).toContain('RiskIndicesStatus = "loading" | "ready" | "updating" | "error"');
  });

  it("never discards a previously verified reading because a refresh failed", () => {
    const legacyHook = read("src/lib/use-global-risk.ts");
    const indicesHook = read("src/lib/use-risk-indices.ts");

    const legacyCatch = legacyHook.split("} catch (err) {")[1] ?? "";
    const indicesCatch = indicesHook.split("} catch (caught) {")[1] ?? "";
    expect(legacyCatch).not.toContain("setData(null)");
    expect(indicesCatch).not.toContain("setData(null)");
  });

  it("does not add a synthetic score or browser database fallback", () => {
    const server = read("src/lib/public-risk.functions.ts");
    const hook = read("src/lib/use-risk-indices.ts");
    const resolver = read("src/lib/supabase-app.server.ts");

    expect(server).not.toContain("synthetic");
    expect(hook).not.toContain("supabase.co");
    expect(hook).not.toContain("VITE_SUPABASE_URL");
    expect(resolver).not.toContain("import.meta.env");
  });
});
