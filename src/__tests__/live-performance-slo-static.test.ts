import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/ops/live-performance-slo.mjs", "utf8");
const workflow = readFileSync(".github/workflows/live-performance-slo.yml", "utf8");

describe("live performance SLO guard", () => {
  it("measures current commercial surfaces over the real network", () => {
    for (const route of [
      'path: "/"',
      'path: "/intelligence"',
      'path: "/global-risk"',
      'path: "/ask-geomacro"',
      'path: "/risk-gate"',
      'path: "/data-api"',
      'path: "/pricing"',
      'path: "/institutional"',
      'path: "/docs"',
      'path: "/api/health"',
    ]) expect(script).toContain(route);
    expect(script.toLowerCase()).not.toContain("testnet");
    expect(script).toContain("p95_ms");
    expect(script).toContain("real_network_requests: true");
  });

  it("keeps recurring probes quota-held", () => {
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("live-performance-slo.mjs");
  });
});
