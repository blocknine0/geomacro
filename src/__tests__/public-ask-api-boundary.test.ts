import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { classifyCentralSecurityRoute } from "../lib/central-security.server";

const read = (path: string) => readFileSync(path, "utf8");

describe("Ask Geomacro public API boundary", () => {
  it("uses the public-read central-security class without weakening writes or server functions", () => {
    expect(classifyCentralSecurityRoute("/api/public-ask", "GET")).toBe("public_api");
    expect(classifyCentralSecurityRoute("/api/public-ask", "POST")).toBe("api_write");
    expect(classifyCentralSecurityRoute("/_serverFn/sensitive", "POST")).toBe("server_function");
  });

  it("keeps the browser transport off the hashed server-function path", () => {
    const workspace = read("src/components/ask/ask-workspace.tsx");
    expect(workspace).toContain('fetch("/api/public-ask"');
    expect(workspace).toContain('method: "GET"');
    expect(workspace).toContain('"X-Geomacro-Question"');
    expect(workspace).toContain('cache: "no-store"');
    expect(workspace).toContain('credentials: "same-origin"');
    expect(workspace).not.toContain("useServerFn(askGeomacro)");
  });

  it("keeps question text out of the URL and preserves origin, validation and rate-limit controls", () => {
    const api = read("server/api/public-ask.get.ts");
    const core = read("src/lib/ask-geomacro-core.server.ts");

    expect(api).toContain('const QUESTION_HEADER = "x-geomacro-question"');
    expect(api).toContain('getRequestHeader(event, "origin")');
    expect(api).toContain('getRequestHeader(event, "referer")');
    expect(api).toContain("executeAskGeomacro({ question }");
    expect(api).not.toContain("searchParams");
    expect(api).not.toContain("readBody");

    expect(core).toContain("INJECTION_RE");
    expect(core).toContain("ASK_GEOMACRO_MAX_LENGTH = 300");
    expect(core).toContain("checkAskRateLimit(clientKey)");
    expect(core).toContain("toCommercialAskBrief");
  });
});
