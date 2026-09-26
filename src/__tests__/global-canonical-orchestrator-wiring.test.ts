import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("global CANONICAL refresh orchestrator wiring", () => {
  it("runs only inside the existing Geomacro Intelligence Orchestrator path", () => {
    const refresh = read("scripts/refresh-public-demo-risk-objects.ts");
    const orchestrator = read("scripts/intelligence-orchestrator.mjs");

    expect(orchestrator).toContain('key: "public_demo_refresh"');
    expect(orchestrator).toContain("cadenceSeconds: 3600");
    expect(orchestrator).toContain('["bun", ["scripts/refresh-public-demo-risk-objects.ts"], "."]');
    expect(refresh).toContain('GITHUB_WORKFLOW ?? ""');
    expect(refresh).toContain('"Geomacro Intelligence Orchestrator"');
    expect(refresh).toContain('"scripts/refresh-global-canonical-risk-objects.ts"');
  });

  it("keeps the standalone public demo path unchanged and global failures fail closed", () => {
    const refresh = read("scripts/refresh-public-demo-risk-objects.ts");

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
