import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => fs.readFileSync(path, "utf8");

const smoke = read("scripts/ops/live-launch-surface-smoke.mjs");
const workflow = read(".github/workflows/p0-live-alignment-diagnostic.yml");

describe("P0 live deployment alignment contract", () => {
  it("checks every launch-critical public surface outside-in", () => {
    for (const route of [
      '"/institutional"',
      '"/global-risk"',
      '"/intelligence"',
      '"/risk-gate"',
      '"/data-api"',
      '"/.well-known/x402.json"',
      '"/.well-known/geomacro-build.json"',
    ]) {
      expect(smoke).toContain(route);
    }
    expect(smoke).toContain('"/api/early-warning?limit=1"');
    expect(smoke).toContain('geomacro.public-early-warning-feed.v1');
  });

  it("requires the exact published canonical SHA", () => {
    expect(smoke).toContain("GEOMACRO_EXPECTED_DEPLOYED_SHA");
    expect(smoke).toContain("deployedSha === expectedDeployedSha");
    expect(workflow).toContain("github.event.pull_request.base.sha");
    expect(workflow).toContain("expected_sha");
    expect(workflow).toContain("^[0-9a-fA-F]{40}$");
  });

  it("keeps the diagnostic read-only and non-activating", () => {
    expect(workflow).toContain("Read-only outside-in requests only: true");
    expect(workflow).toContain("Production mutation performed: false");
    expect(workflow).toContain("Payment or settlement performed: false");
    expect(workflow).toContain("Mainnet activation performed: false");
    expect(workflow).toContain("Load/capacity test performed: false");
    expect(workflow).not.toContain("curl -X POST");
    expect(workflow).not.toContain("supabase db push");
  });
});
