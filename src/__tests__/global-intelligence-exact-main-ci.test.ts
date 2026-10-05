import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/global-intelligence-v1.yml", "utf8");

describe("Global Intelligence exact-main CI contract", () => {
  it("runs structural/unit Global Intelligence CI after merges to main", () => {
    expect(workflow).toContain("name: Global Intelligence V1 CI");
    expect(workflow).toMatch(/push:\s*\n\s*branches:\s*\n(?:\s*- .*\n)*\s*- main\b/);
    expect(workflow).toContain("npm run gate:source-policy");
    expect(workflow).toContain("npm run test:all");
  });

  it("keeps canonical coverage an explicit fail-closed dispatch gate", () => {
    expect(workflow).toContain("if: github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("npm run generate:coverage");
    expect(workflow).toContain("npm run gate:coverage");
    expect(workflow).toContain("country-coverage-certification.mjs");
  });
});
