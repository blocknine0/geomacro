import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("global CANONICAL refresh governed wiring", () => {
  it("runs from the master orchestrator and the proven hourly public-demo scheduler", () => {
    const refresh = read("scripts/refresh-public-demo-risk-objects.ts");
    const orchestrator = read("scripts/intelligence-orchestrator.mjs");
    const publicDemoWorkflow = read(".github/workflows/public-demo-risk-refresh.yml");

    expect(orchestrator).toContain('key: "public_demo_refresh"');
    expect(orchestrator).toContain("cadenceSeconds: 3600");
    expect(orchestrator).toContain('["bun", ["scripts/refresh-public-demo-risk-objects.ts"], "."]');
    expect(publicDemoWorkflow).toContain('cron: "0 * * * *"');
    expect(refresh).toContain('GITHUB_WORKFLOW ?? ""');
    expect(refresh).toContain('"Geomacro Intelligence Orchestrator"');
    expect(refresh).toContain('"Public Demo Risk Refresh"');
    expect(refresh).toContain('"scripts/refresh-global-canonical-risk-objects.ts"');
  });

  it("keeps ungoverned invocation unchanged and global failures fail closed", () => {
    const refresh = read("scripts/refresh-public-demo-risk-objects.ts");

    expect(refresh).toContain("GLOBAL_REFRESH_WORKFLOWS.has(workflow)");
    expect(refresh).toContain("if (exitCode !== 0)");
    expect(refresh).toContain("GLOBAL_CANONICAL_REFRESH_FAILED");
    expect(refresh).toContain("GLOBAL_CANONICAL_REFRESH_BOUNDARY_INVALID");
    expect(refresh).toContain("payment_not_performed_by_refresh");
    expect(refresh).toContain("raw_source_material_emitted");
    expect(refresh).toContain("execution_authorized");
    expect(refresh).toContain('stdout: "pipe"');
    expect(refresh).toContain('console.error("GLOBAL_CANONICAL_REFRESH_STATUS "');
  });
});
