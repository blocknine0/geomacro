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

  it("handles a controlled unavailable response in the client instead of exposing a server runtime exception", () => {
    const hook = read("src/lib/use-global-risk.ts");

    expect(hook).toContain("if (!response.ok)");
    expect(hook).toContain("throw new Error(response.message)");
    expect(hook).toContain('setStatus("error")');
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
