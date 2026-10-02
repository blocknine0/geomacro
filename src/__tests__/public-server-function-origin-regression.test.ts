import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("public server-function origin transport contract", () => {
  it("keeps a separate framework-safe public read guard", () => {
    const guard = read("src/lib/origin-guard.ts");
    expect(guard).toContain("export function assertSameOrigin()");
    expect(guard).toContain("export function assertPublicReadOrigin()");
    expect(guard).toContain('getRequestHeader("x-forwarded-host")');
    expect(guard).toContain("new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured])");
    expect(guard).toContain("allowMissingOrigin: true");
    expect(guard).toContain("allowMissingOrigin: false");
  });

  it("uses the public guard only on read-only/rate-limited customer surfaces", () => {
    for (const path of [
      "src/lib/public-risk-indices.functions.ts",
      "src/lib/public-risk.functions.ts",
      "src/lib/public-intelligence-b2.functions.ts",
      "src/lib/public-event.functions.ts",
      "src/lib/ask-geomacro.functions.ts",
    ]) {
      const source = read(path);
      expect(source, `${path} must use the framework-safe public guard`).toContain(
        "assertPublicReadOrigin();",
      );
      expect(source, `${path} must not use the strict browser-header-only guard`).not.toContain(
        "assertSameOrigin();",
      );
    }
  });

  it("keeps sensitive/authenticated and quota-bearing operations strict", () => {
    for (const path of ["src/lib/siwe.functions.ts", "src/lib/agents.functions.ts"]) {
      const source = read(path);
      expect(source, `${path} must remain strict`).toContain("assertSameOrigin();");
      expect(source).not.toContain("assertPublicReadOrigin();");
    }
  });

  it("preserves Ask Geomacro abuse controls while allowing framework transport", () => {
    const ask = read("src/lib/ask-geomacro.functions.ts");
    expect(ask).toContain("checkAskRateLimit(ip)");
    expect(ask).toContain("getRequestIP({ xForwardedFor: true })");
    expect(ask).toContain("INJECTION_RE");
    expect(ask).toContain(".max(300)");
  });
});
