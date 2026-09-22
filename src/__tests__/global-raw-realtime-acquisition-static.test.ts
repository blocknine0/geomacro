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

  it("prioritizes due targets without letting not-due rows consume the bounded batch",()=>{
    const worker=read("scripts/sync-country-raw-source-mesh.mjs");
    expect(worker).toContain("RAW_SOURCE_SYNC_MAX_TARGETS??5000");
    expect(worker).toContain("for(let from=0;;from+=1000)");
    expect(worker).toContain('.order("priority",{ascending:true,nullsFirst:true}).order("last_attempt_at",{ascending:true,nullsFirst:true}).order("target_id",{ascending:true}).range(from,from+999)');
    expect(worker).toContain("if(due.length>=LIMIT||page.length<1000)break;");
    expect(worker).toContain("due.splice(LIMIT);");
    expect(worker).not.toContain('.order("last_attempt_at",{ascending:true,nullsFirst:true}).order("priority",{ascending:true})');
    expect(worker).not.toContain(".limit(LIMIT);if(q.error)throw q.error;const due=");
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
