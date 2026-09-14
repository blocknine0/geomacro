import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/ops/live-performance-slo.mjs", "utf8");
const workflow = readFileSync(".github/workflows/live-performance-slo.yml", "utf8");

describe("live performance SLO guard", () => {
  it("measures the main commercial and Testnet surfaces over the real network", () => {
    for (const route of [
      'path: "/"',
      'path: "/intelligence"',
      'path: "/global-risk"',
      'path: "/risk-gate"',
      'path: "/data-api"',
      'path: "/testnet-access"',
      'path: "/testnet-console"',
      'path: "/api/health"',
      'path: "/api/testnet/manifest"',
    ]) {
      expect(script).toContain(route);
    }
    expect(script).toContain("p95_ms");
    expect(script).toContain("real_network_requests: true");
    expect(script).toContain("production_capacity_claim: false");
  });

  it("runs continuously and preserves evidence", () => {
    expect(workflow).toContain("cron: '17 */3 * * *'");
    expect(workflow).toContain("live-performance-slo.mjs");
    expect(workflow).toMatch(/actions\/upload-artifact@v[4-9]/);
  });
});
