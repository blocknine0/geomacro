import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("B2 request budget governor", () => {
  it("fails closed before starting requests beyond the per-process budget", () => {
    const client = read("scripts/ops/b2-s3-client.mjs");
    expect(client).toContain('process.env.B2_REQUEST_BUDGET');
    expect(client).toContain('B2_REQUEST_BUDGET_EXHAUSTED');
    expect(client).toContain('requestsStarted >= requestBudget');
    expect(client).toContain('requestsStarted += 1');
    expect(client).toContain('message === "B2_REQUEST_BUDGET_EXHAUSTED"');
  });

  it("keeps cleanup workflows manual and gives each run a small hard request ceiling", () => {
    const structured = read(".github/workflows/structured-event-b2-verified-compaction.yml");
    const evidence = read(".github/workflows/structured-evidence-b2-delete-batch.yml");
    for (const workflow of [structured, evidence]) {
      expect(workflow).toContain("workflow_dispatch:");
      expect(workflow).not.toContain("schedule:");
      expect(workflow).toContain("B2_REQUEST_BUDGET:");
    }
    expect(structured).toContain('B2_REQUEST_BUDGET: "40"');
    expect(evidence).toContain('B2_REQUEST_BUDGET: "30"');
  });
});
