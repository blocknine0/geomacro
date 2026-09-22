import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("live flash ingest GitHub OIDC authorization", () => {
  it("authorizes the intelligence orchestrator workflow for governed RSS ingest", () => {
    const functionSource = readFileSync(
      "supabase/functions/live-flash-ingest/index.ts",
      "utf8",
    );

    expect(functionSource).toContain(
      "blocknine0/geomacro/.github/workflows/intelligence-orchestrator.yml@refs/heads/main",
    );
    expect(functionSource).toContain(
      '"intelligence-orchestrator.yml"',
    );
  });
});
