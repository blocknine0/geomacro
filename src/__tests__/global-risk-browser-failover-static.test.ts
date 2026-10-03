import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hook = readFileSync("src/lib/use-global-risk.ts", "utf8");
const worker = readFileSync("workers/global-risk-edge/src/index.mjs", "utf8");
const workflow = readFileSync(".github/workflows/gri-realtime-direct-postgres.yml", "utf8");

const edgeUrl = "https://geomacro-global-risk.daspallab202391.workers.dev/global-risk";

describe("Global Risk browser failover contract", () => {
  it("keeps the verified B2 edge primary and preserves Lovable same-origin fallback", () => {
    expect(hook).toContain(edgeUrl);
    expect(hook).toContain('const GLOBAL_RISK_APP_URL = "/api/public/global-risk"');
    expect(hook).toContain('{ kind: "edge", url: GLOBAL_RISK_EDGE_URL }');
    expect(hook).toContain('{ kind: "app", url: GLOBAL_RISK_APP_URL }');
    expect(hook.indexOf('{ kind: "edge", url: GLOBAL_RISK_EDGE_URL }')).toBeLessThan(
      hook.indexOf('{ kind: "app", url: GLOBAL_RISK_APP_URL }'),
    );
  });

  it("accepts no browser package without verified-edge identity and continuity validation", () => {
    expect(hook).toContain('const EDGE_AUTHORITY = "backblaze-b2-verified-edge"');
    expect(hook).toContain('response.headers.get("x-geomacro-authority") !== EDGE_AUTHORITY');
    expect(hook).toContain("body.meta?.authority !== EDGE_AUTHORITY");
    expect(hook).toContain('body.schema !== EDGE_SCHEMA || body.source_project !== EDGE_PROJECT');
    expect(hook).toContain("validateGlobalRiskContinuity(next)");
    expect(hook).toContain("Global Risk continuity rejected");
  });

  it("makes the verified authority header readable cross-origin without exposing writes", () => {
    expect(worker).toContain('"access-control-allow-origin": "*"');
    expect(worker).toContain('"access-control-expose-headers": "x-geomacro-authority"');
    expect(worker).toContain('request.method !== "GET"');
    expect(worker).not.toContain("request.json()");
    expect(worker).not.toContain('method: "PUT"');
    expect(worker).not.toContain('method: "DELETE"');
  });

  it("fails production on the real browser edge while retaining Lovable API compatibility observation", () => {
    expect(workflow).toContain(`GLOBAL_RISK_EDGE_URL: ${edgeUrl}`);
    expect(workflow).toContain("browser serving edge");
    expect(workflow).toContain("Observe geomacro.live API compatibility");
    expect(workflow).toContain("::warning::geomacro.live same-origin Global Risk API compatibility path");
  });
});