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
    expect(worker).toContain('.in("transport",["WEB","GLOBAL_FALLBACK","API","RSS"])');
    expect(worker).toContain("function rssItems");
  });

  it("cannot starve lower-priority countries by stopping at the first 600 rows",()=>{
    const worker=read("scripts/sync-country-raw-source-mesh.mjs");
    expect(worker).toContain("RAW_SOURCE_SYNC_MAX_TARGETS??5000");
    expect(worker).toContain('.order("last_attempt_at",{ascending:true,nullsFirst:true}).order("priority",{ascending:true})');
  });

  it("keeps GDELT country fallback as a fallback, not the global first-break backbone",()=>{
    const migration=read("supabase/migrations/967_global_raw_source_coverage_mesh.sql");
    expect(migration).toContain("'GEO:GLOBAL:GDELT:'");
    expect(migration).toContain("true,false,300,20");
    const workflow=read(".github/workflows/gdelt-gal-live-sync.yml");
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).not.toContain("schedule:");
    const orchestrator=read(".github/workflows/intelligence-orchestrator.yml");
    expect(orchestrator).toContain('key: "gdelt_gal"');
  });
});
