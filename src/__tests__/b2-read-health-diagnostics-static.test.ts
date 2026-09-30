import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("scripts/ops/b2-s3-client.mjs", "utf8");
const canary = readFileSync("scripts/ops/b2-read-health-canary.mjs", "utf8");
const workflow = readFileSync(".github/workflows/b2-read-health-canary-once.yml", "utf8");

describe("B2 read health diagnostics", () => {
  it("extracts only a bounded safe error code and never logs raw response or credentials", () => {
    expect(client).toContain("safeB2ErrorCode");
    expect(client).toContain("<Code>([^<]{1,80})");
    expect(client).toContain("B2_${method}_FAILED_${result.status}_${errorCode}");
    expect(client).not.toContain("console.log(responseText)");
    expect(client).not.toContain("console.error(responseText)");
  });

  it("health canary is GET-only and verifies the stored archive hash", () => {
    expect(canary).toContain("await b2.get(pointer.k)");
    expect(canary).toContain("sha256(body) !== pointer.a");
    expect(canary).toContain("mutation_performed: false");
    expect(canary).not.toContain("b2.put(");
    expect(canary).not.toMatch(/\.update\s*\(/);
    expect(canary).not.toMatch(/\.delete\s*\(/);
  });

  it("runs exactly once from its own main-branch workflow change", () => {
    expect(workflow).toContain("B2 Read Health Canary Once");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain('".github/workflows/b2-read-health-canary-once.yml"');
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("environment: production");
  });
});
