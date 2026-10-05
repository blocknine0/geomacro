import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("GRI freshness publication boundary", () => {
  it("keeps the bounded hourly freshness cadence and only publishes after proof verification", () => {
    const workflow = read(".github/workflows/gri-realtime-direct-postgres.yml");
    const verify = workflow.indexOf("Independently verify current GRI proof package");
    const publish = workflow.indexOf("Publish verified Global Risk continuity package to B2");

    expect(workflow).toContain('cron: "23 * * * *"');
    expect(workflow).toContain("node scripts/verify-gri-snapshot-v12.js");
    expect(workflow).toContain("bun scripts/ops/publish-b2-global-risk-direct-postgres.mjs");
    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).toContain("B2_KEY_ID: ${{ secrets.B2_KEY_ID }}");
    expect(workflow).toContain("B2_APPLICATION_KEY: ${{ secrets.B2_APPLICATION_KEY }}");
    expect(verify).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(verify);
  });

  it("keeps manual news recovery from becoming an unverified GRI writer", () => {
    const recovery = read(".github/workflows/auto-ingest-news.yml");
    const globalRisk = read(".github/workflows/gri-realtime-direct-postgres.yml");

    expect(recovery).toContain("workflow_dispatch");
    expect(recovery).not.toContain("schedule:");
    expect(recovery).not.toContain("compute-gri-v12.js");
    expect(recovery).not.toContain("publish-b2-global-risk-direct-postgres.mjs");

    expect(globalRisk).toContain("compute-gri-v12.js");
    expect(globalRisk).toContain("verify-gri-snapshot-v12.js");
    expect(globalRisk).toContain("publish-b2-global-risk-direct-postgres.mjs");
  });
});
