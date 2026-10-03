import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("GRI freshness publication boundary", () => {
  it("keeps the bounded six-hour freshness cadence and only publishes after proof verification", () => {
    const workflow = read(".github/workflows/auto-ingest-news.yml");
    const verify = workflow.indexOf("Verify changed GRI proof package");
    const publish = workflow.indexOf("Publish verified GRI continuity package to B2");

    expect(workflow).toContain('cron: "17 */6 * * *"');
    expect(workflow).toContain("node scripts/verify-gri-snapshot-v12.js");
    expect(workflow).toContain("bun scripts/ops/publish-b2-global-risk-direct-postgres.mjs");
    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).toContain("B2_KEY_ID: ${{ secrets.B2_KEY_ID }}");
    expect(workflow).toContain("B2_APPLICATION_KEY: ${{ secrets.B2_APPLICATION_KEY }}");
    expect(verify).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(verify);
  });

  it("does not turn the quota fallback into an unverified GRI writer", () => {
    const workflow = read(".github/workflows/auto-ingest-news.yml");
    const fallback = workflow.slice(workflow.indexOf("public-live-freshness-fallback:"));

    expect(fallback).toContain("probe-public-intelligence-live-fallback.ts");
    expect(fallback).not.toContain("compute-gri-v12.js");
    expect(fallback).not.toContain("publish-b2-global-risk-direct-postgres.mjs");
  });
});
