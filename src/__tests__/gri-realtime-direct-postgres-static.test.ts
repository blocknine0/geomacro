import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/gri-realtime-direct-postgres.yml", "utf8");
const shim = readFileSync("scripts/lib/gri-db-client.mjs", "utf8");
const loader = readFileSync("scripts/lib/direct-postgres-supabase-loader.mjs", "utf8");
const cluster = readFileSync("scripts/cluster-gri-stories-v12.js", "utf8");
const compute = readFileSync("scripts/compute-gri-v12.js", "utf8");
const verify = readFileSync("scripts/verify-gri-snapshot-v12.js", "utf8");

describe("GRI realtime direct Postgres freshness", () => {
  it("runs a bounded verified refresh every hour from canonical evidence without re-owning source ingestion", () => {
    expect(workflow).not.toContain('cron: "23 * * * *"');
    expect(workflow).not.toContain("\n  schedule:\n");
    expect(workflow).not.toContain("\n  push:\n");
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
    expect(workflow).toContain("SUPABASE_DB_URL");
    expect(workflow).not.toContain("node scripts/ingest-news.js");
    expect(workflow).not.toContain("GUARDIAN_QUERY_BUDGET_PER_CATEGORY");
    expect(workflow).not.toContain("GDACS_ENABLED");
    expect(workflow).not.toContain("RELIEFWEB_ENABLED");
    expect(workflow).toContain("node scripts/cluster-gri-stories-v12.js");
    expect(workflow).toContain("node scripts/compute-gri-v12.js");
    expect(workflow).toContain("node scripts/verify-gri-snapshot-v12.js");
    expect(workflow).toContain("bun scripts/ops/publish-b2-global-risk-direct-postgres.mjs");
  });

  it("runs correlation, compute and verification natively through the canonical direct-Postgres client", () => {
    for (const source of [cluster, compute, verify]) {
      expect(source).toContain("createGriDbClient");
      expect(source).not.toContain("@supabase/supabase-js");
    }
    expect(cluster).toContain("const supabase = createGriDbClient();");
    expect(compute).toContain("const supabase = createGriDbClient();");
    expect(verify).toContain("const supabase = createGriDbClient();");
    expect(workflow).not.toContain("NODE_OPTIONS: --experimental-loader=./scripts/lib/direct-postgres-supabase-loader.mjs");
  });

  it("keeps the compatibility shim fail-closed for any remaining legacy direct-mode caller", () => {
    expect(loader).toContain('specifier === "@supabase/supabase-js"');
    expect(loader).toContain('=== "direct_postgres"');
    expect(loader).toContain("createGriDbClient");
    expect(loader).toContain("nextResolve(specifier, context)");
    expect(loader).toContain("withPrefixLikeCompat(createGriDbClient())");
    expect(loader).toContain("DIRECT_POSTGRES_LIKE_SUPPORTS_PREFIX_ONLY");
    expect(shim).toContain("new DirectPostgresClient(process.env.SUPABASE_DB_URL)");
  });

  it("fails closed to the authoritative production database and does not invent index data", () => {
    expect(shim).toContain("Refusing direct GRI access outside the authoritative Supabase project");
    expect(shim).toContain("UNSUPPORTED_DIRECT_POSTGRES_OPERATION");
    expect(shim).toContain("jsonb_populate_recordset");
    expect(workflow).toContain("MISSING_GRI_DOMAIN");
    expect(workflow).toContain("LATEST_GRI_NOT_FRESH");
    expect(workflow).not.toContain("synthetic score");
  });

  it("requires all three verified customer-facing indices and their real history through the browser edge", () => {
    expect(workflow).toContain(
      "GLOBAL_RISK_EDGE_URL: https://geomacro-global-risk.daspallab202391.workers.dev/global-risk",
    );
    expect(workflow).toContain('const required = ["geopolitics", "macro", "rare_earth"]');
    expect(workflow).toContain('domains[key]?.series?.["7D"]?.buckets');
    expect(workflow).toContain('domains[key]?.series?.["30D"]?.buckets');
    expect(workflow).toContain('d?.series?.["7D"]?.buckets');
    expect(workflow).toContain('d?.series?.["30D"]?.buckets');
    expect(workflow).toContain("x-geomacro-authority: backblaze-b2-verified-edge");
    expect(workflow).toContain("Observe geomacro.live API compatibility");
  });
});
