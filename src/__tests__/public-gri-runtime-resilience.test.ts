import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("public GRI runtime resilience", () => {
  it("keeps the canonical database read but converts availability failures to a controlled response", () => {
    const server = read("src/lib/public-risk.functions.ts");
    const canonical = read("src/lib/global-risk-read.server.ts");

    expect(server).toContain("readPublicGlobalRisk");
    expect(server).toContain('code: "RISK_INDEX_UNAVAILABLE"');
    expect(server).toContain("try {");
    expect(server).toContain("catch (error)");
    expect(server).toContain("assertSameOrigin();");
    expect(canonical).toContain('throw new Error("Risk index store unavailable")');
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

    expect(server).not.toContain("synthetic");
    expect(hook).not.toContain("VITE_SUPABASE_URL");
    expect(resolver).not.toContain("import.meta.env");
  });
});
