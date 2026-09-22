import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read=(path:string)=>readFileSync(join(process.cwd(),path),"utf8");

describe("global raw realtime acquisition",()=>{
  it("covers the three raw categories and non-Telegram transports",()=>{
    const migration=read("supabase/migrations/967_global_raw_source_coverage_mesh.sql");
    expect(migration).toContain("GEOPOLITICS");
    expect(migration).toContain("MACRO");
    expect(migration).toContain("CRITICAL_MINERALS");
    expect(migration).toContain("'RSS','API','TELEGRAM_DISCOVERY','GLOBAL_FALLBACK'");
  });

  it("actually fetches API and RSS targets instead of silently ignoring them",()=>{
    const worker=read("scripts/sync-country-raw-source-mesh.mjs");
    expect(worker).toContain('.not("transport", "eq", "TELEGRAM_DISCOVERY")');
    expect(worker).toContain("function rssItems");
    expect(worker).toContain("const fetched = await fetchUrl(targetUrl);");
  });

  it("refreshes stale three-category cells through independent non-GDELT candidates",()=>{
    const worker=read("scripts/sync-country-raw-source-mesh.mjs");
    expect(worker).toContain("const categories = [\"GEOPOLITICS\", \"MACRO\", \"CRITICAL_MINERALS\"];");
    expect(worker).toContain("const windows = { GEOPOLITICS: 1800, MACRO: 7200, CRITICAL_MINERALS: 14400 };");
    expect(worker).toContain("alreadyFreshNonGdelt");
    expect(worker).toContain("freshNonGdelt");
    expect(worker).toContain("const nonGdeltCandidates = candidates");
    expect(worker).toContain("NO_FRESH_NON_GDELT_TARGET_SUCCEEDED");
    expect(worker).toContain("RAW_SOURCE_CELL_MAX_ATTEMPTS");
    expect(worker).toContain("await Promise.all(");
    expect(worker).toContain("processed_cells: successfulCells");
  });

  it("keeps GDELT country fallback as a fallback, not the global first-break backbone",()=>{
    const migration=read("supabase/migrations/967_global_raw_source_coverage_mesh.sql");
    expect(migration).toContain("'GEO:GLOBAL:GDELT:'");
    expect(migration).toContain("true,false,300,20");
    const workflow=read(".github/workflows/gdelt-gal-live-sync.yml");
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).not.toContain("schedule:");
    const orchestrator=read("scripts/intelligence-orchestrator.mjs");
    expect(orchestrator).toContain('key: "gdelt_gal"');
  });
});
