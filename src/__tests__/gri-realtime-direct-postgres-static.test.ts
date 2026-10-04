import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/gri-realtime-direct-postgres.yml", "utf8");
const shim = readFileSync("scripts/lib/gri-db-client.mjs", "utf8");
const loader = readFileSync("scripts/lib/direct-postgres-supabase-loader.mjs", "utf8");
const cluster = readFileSync("scripts/cluster-gri-stories-v12.js", "utf8");

describe("GRI realtime direct Postgres freshness", () => {
  it("runs a bounded verified refresh every hour from canonical evidence without re-owning source ingestion", () => {
    expect(workflow).toContain('cron: "23 * * * *"');
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).not.toContain("node scripts/ingest-news.js");
    expect(workflow).not.toContain("GUARDIAN_QUERY_BUDGET_PER_CATEGORY");
    expect(workflow).not.toContain("GDACS_ENABLED");
    expect(workflow).not.toContain("RELIEFWEB_ENABLED");
    expect(workflow).toContain("node scripts/cluster-gri-stories-v12.js");
    expect(workflow).toContain("node scripts/compute-gri-v12.js");
    expect(workflow).toContain("node scripts/verify-gri-snapshot-v12.js");
    expect(workflow).toContain("bun scripts/ops/publish-b2-global-risk-direct-postgres.mjs");
  });

  it("keeps the exact canonical scripts and scopes the compatibility shim to direct mode", () => {
    expect(loader).toContain('specifier === "@supabase/supabase-js"');
    expect(loader).toContain('=== "direct_postgres"');
    expect(loader).toContain("createGriDbClient");
    expect(loader).toContain("nextResolve(specifier, context)");
  });

  it("lets legacy REST preflights pass only inside the direct-Postgres virtual shim", () => {
    expect(cluster).toContain('throw new Error("Supabase URL and service-role key are required")');
    expect(loader).toContain('process.env.SUPABASE_URL ||= "https://direct-postgres.invalid"');
    expect(loader).toContain('process.env.SUPABASE_SERVICE_ROLE_KEY ||= "direct-postgres-no-rest"');
    expect(loader).toContain("createClient() { return createGriDbClient(); }");
    expect(shim).toContain("new DirectPostgresClient(process.env.SUPABASE_DB_URL)");
    expect(shim).toContain("Refusing direct GRI access outside the authoritative Supabase project");
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
    expect(workflow).toContain(
      "::warning::geomacro.live same-origin Global Risk API compatibility path returned HTTP",
    );
  });
});