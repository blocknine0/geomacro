import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("#1827 Risk Indices production publisher cannot be marked green by tee", () => {
  const workflow = readFileSync(".github/workflows/risk-indices-realtime-direct-postgres.yml", "utf8");
  const publish = workflow.split("      - name: Publish verified Risk Indices package to isolated B2 namespace")[1]
    ?.split("      - name: Require verified dedicated Risk Indices edge")[0] ?? "";

  it("enforces bash pipefail on the actual pipeline, not the surrounding metadata", () => {
    expect(publish).toContain("shell: bash");
    expect(publish).toContain("set -euo pipefail");
    expect(publish).toContain("bun scripts/ops/publish-b2-risk-indices-direct-postgres.mjs | tee /tmp/risk-indices-publish.json");
    expect(publish.indexOf("set -euo pipefail")).toBeLessThan(publish.indexOf("bun scripts/ops/"));
  });

  it("refuses to treat an old edge cache as proof of a successful D1 publication", () => {
    expect(publish).toContain('grep -q \'"d1_hot_snapshot_published":true\' /tmp/risk-indices-publish.json');
    expect(publish).not.toContain("|| true");
    expect(workflow.indexOf("Require verified dedicated Risk Indices edge"))
      .toBeGreaterThan(workflow.indexOf("set -euo pipefail"));
  });
});
