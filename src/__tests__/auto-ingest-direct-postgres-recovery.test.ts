import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/auto-ingest-news.yml", "utf8");
const loader = readFileSync("scripts/lib/direct-postgres-supabase-loader.mjs", "utf8");
const db = readFileSync("scripts/lib/gri-db-client.mjs", "utf8");

describe("canonical Auto Ingest News recovery", () => {
  it("keeps one ingestion owner and switches transport when Supabase REST egress is restricted", () => {
    expect(workflow).toContain("group: geomacro-intelligence-orchestrator");
    expect(workflow).toContain("mode=egress_restricted");
    expect(workflow).toContain("needs.supabase-preflight.outputs.mode == 'egress_restricted'");
    expect(workflow).toContain("GRI_DB_MODE: ${{ needs.supabase-preflight.outputs.mode == 'egress_restricted' && 'direct_postgres' || '' }}");
    expect(workflow).toContain("--experimental-loader=./scripts/lib/direct-postgres-supabase-loader.mjs");
    expect(workflow).toContain("run: node scripts/ingest-news.js");
    expect(workflow).toContain("source_discovery_owner: 'auto-ingest-news'");
  });

  it("does not downgrade unknown failures and keeps REST-only maintenance isolated from direct recovery", () => {
    expect(workflow).toContain("Refusing to downgrade an unknown control-plane failure");
    expect(workflow).toContain("if: ${{ needs.supabase-preflight.outputs.available == 'true' }}");
    expect(workflow).toContain("Recover B2-backed headroom before recurring writes when needed");
    expect(workflow).toContain("Export admitted events for structured intelligence");
    expect(workflow).toContain("Offload settled recent raw ingest buffer to verified B2");
  });

  it("publishes scored Intelligence and verified Global Risk from the same canonical truth in recovery mode", () => {
    expect(workflow).toContain("bun scripts/ops/publish-b2-public-intelligence-direct-postgres.mjs");
    expect(workflow).toContain("node scripts/cluster-gri-stories-v12.js");
    expect(workflow).toContain("node scripts/compute-gri-v12.js");
    expect(workflow).toContain("node scripts/verify-gri-snapshot-v12.js");
    expect(workflow).toContain("bun scripts/ops/publish-b2-global-risk-direct-postgres.mjs");
  });

  it("keeps the direct database path production-bound and synthetic-free", () => {
    expect(loader).toContain('specifier === "@supabase/supabase-js"');
    expect(loader).toContain('=== "direct_postgres"');
    expect(db).toContain("Refusing direct GRI access outside the authoritative Supabase project");
    expect(workflow).toContain("no synthetic score or fabricated event is allowed");
    expect(workflow).not.toContain("Intelligence Scored Freshness Recovery");
  });
});
