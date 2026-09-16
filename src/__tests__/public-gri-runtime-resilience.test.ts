import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("public GRI runtime resilience", () => {
  it("keeps the canonical direct read and recovers through the authoritative Supabase edge", () => {
    const server = read("src/lib/public-risk.functions.ts");
    const canonical = read("src/lib/global-risk-read.server.ts");
    const edge = read("src/lib/public-risk-edge.server.ts");

    expect(server).toContain("readPublicGlobalRisk");
    expect(server).toContain("readPublicGlobalRiskFromEdge");
    expect(server).toContain('code: "RISK_INDEX_UNAVAILABLE"');
    expect(server).toContain("assertSameOrigin();");
    expect(server).toContain("hosted canonical read unavailable; trying authoritative edge");
    expect(canonical).toContain('throw new Error("Risk index store unavailable")');
    expect(edge).toContain("ldpwajisioljyjtojvfx");
    expect(edge).toContain("/functions/v1/public-risk-indices");
  });

  it("only returns unavailable after both verified read paths fail", () => {
    const server = read("src/lib/public-risk.functions.ts");

    expect(server).toContain("catch (directError)");
    expect(server).toContain("catch (edgeError)");
    expect(server).toContain("authoritative edge fallback unavailable");
    expect(server).toContain("The verified risk indices are temporarily unavailable. Please retry.");
  });

  it("keeps website risk surfaces fail-soft instead of showing an error state", () => {
    const legacyHook = read("src/lib/use-global-risk.ts");
    const indicesHook = read("src/lib/use-risk-indices.ts");

    expect(legacyHook).toContain("if (!response.ok)");
    expect(legacyHook).toContain("throw new Error(response.message)");
    expect(legacyHook).toContain('setStatus(hasData.current ? "ready" : "loading")');
    expect(legacyHook).not.toContain('setStatus("error")');
    expect(indicesHook).toContain('setStatus(hasData.current ? "ready" : "loading")');
    expect(indicesHook).not.toContain('setStatus("error")');
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
    const hook = read("src/lib/use-global-risk.ts");
    const resolver = read("src/lib/supabase-app.server.ts");
    const edge = read("src/lib/public-risk-edge.server.ts");

    expect(server).not.toContain("synthetic");
    expect(hook).not.toContain("VITE_SUPABASE_URL");
    expect(resolver).not.toContain("import.meta.env");
    expect(edge).not.toContain("APP_SUPABASE_URL");
    expect(edge).not.toContain("VITE_SUPABASE_URL");
  });
});
