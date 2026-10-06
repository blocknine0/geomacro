import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const helper = readFileSync("scripts/lib-live-source-utils.mjs", "utf8");
const dbClient = readFileSync("scripts/lib/gri-db-client.mjs", "utf8");
const orchestrator = readFileSync("scripts/intelligence-orchestrator.mjs", "utf8");

describe("#1414 governed live-source database transport", () => {
  it("delegates the shared live-source DB factory to the canonical transport selector", () => {
    expect(helper).toContain('from "./lib/gri-db-client.mjs"');
    expect(helper).toContain("return createGriDbClient()");
    expect(helper).not.toContain('from "@supabase/supabase-js"');
  });

  it("keeps direct PostgreSQL transport bound to the authoritative production database", () => {
    expect(dbClient).toContain('String(process.env.GRI_DB_MODE ?? "").trim().toLowerCase() === "direct_postgres"');
    expect(dbClient).toContain("Refusing direct GRI access outside the authoritative Supabase project");
    expect(dbClient).toContain("new DirectPostgresClient(process.env.SUPABASE_DB_URL)");
    expect(dbClient).toContain("value !== undefined");
    expect(dbClient).toContain("const normalizedRows = rows.map");
    expect(dbClient).toContain("delete() {");
    expect(dbClient).toContain("DIRECT_POSTGRES_DELETE_REQUIRES_FILTER");
    expect(dbClient).toContain('this.operation === "delete"');
    expect(dbClient).toContain("live_flash_event_countries");
    expect(dbClient).toContain("UNSUPPORTED_DIRECT_POSTGRES_RELATIONSHIP");
    expect(dbClient).toContain("parseSelectProjection");
    expect(dbClient).toContain("parseFilterTarget");
    expect(dbClient).toContain("EXISTS (SELECT 1 FROM public.");
    expect(dbClient).toContain("jsonb_agg(jsonb_build_object");
  });

  it("runs GDELT v2 under the same direct-Postgres production mode rather than requiring Edge/Data API availability", () => {
    expect(orchestrator).toContain('key: "gdelt_v2"');
    expect(orchestrator).toContain('["bun", ["scripts/ingest-gdelt-v2-events-live.mjs", "--write"], "."]');
    expect(orchestrator).not.toMatch(/key: "gdelt_v2"[\s\S]{0,300}enabled:\s*edgeServiceAvailable/);
  });
});
