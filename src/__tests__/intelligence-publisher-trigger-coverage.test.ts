import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("#1414 Intelligence publisher trigger coverage", () => {
  it("reruns publication when shared B2 or source-rights dependencies change", () => {
    const workflow = readFileSync(".github/workflows/intelligence-scored-refresh.yml", "utf8");
    for (const required of [
      '"scripts/ops/b2-s3-client.mjs"',
      '"scripts/ops/b2-archive-contract.mjs"',
      '"scripts/source-endpoint-manifest.mjs"',
      '"supabase/migrations/*commercial*.sql"',
      '"supabase/migrations/*source*.sql"',
      '"supabase/migrations/*rights*.sql"',
    ]) {
      expect(workflow).toContain(required);
    }
    expect(workflow).toContain('cron: "8,28,48 * * * *"');
    expect(workflow).toContain("run-b2-public-intelligence-publisher.mjs");
  });
});
