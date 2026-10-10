import { describe,expect,it } from "vitest";
import { mkdtempSync,rmSync,readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const read=(p:string)=>readFileSync(p,"utf8");
const scheduler=read("scripts/intelligence-orchestrator.mjs");
const workflow=read(".github/workflows/intelligence-orchestrator.yml");
const phaseA=read("scripts/ops/phase-a-runtime-freshness-repair.mjs");
const gal=read("scripts/run-gdelt-gal-cycle.mjs");

describe("#1827 frozen-Supabase hard boundary, derived-only 90-minute operation",()=>{
  it("recognizes SQL mutations in the old heartbeat and Supabase SDK in GAL",()=>{
    expect(phaseA).toContain("const targetRowsWritten = await refreshTargets(observed)");
    expect(phaseA).toContain("insert into public.live_raw_source_targets");
    expect(gal).toContain('import("@supabase/supabase-js")');
    expect(gal).toContain('scripts/sync-gdelt-gal-production.mjs');
    expect(scheduler).toContain('key: "phase_a_heartbeat",');
    expect(scheduler).toContain('key: "gdelt_gal",');
    for(const key of ["phase_a_heartbeat","gdelt_gal"]){
      const pos=scheduler.indexOf('key: "'+key+'",');
      expect(scheduler.slice(pos,pos+430)).toContain("restrictedDirectPostgresSafe: false");
    }
    const native=scheduler.indexOf('key: "official_native_rss",');
    expect(scheduler.slice(native,native+175)).toContain("restrictedDirectPostgresSafe: true");
    expect(scheduler).toContain('task.requiredEnv?.some((name) => /SUPABASE|POSTGRES|PGHOST|PGUSER|PGPASSWORD/i.test(name))');
    expect(scheduler).toContain('if (restrictedDataPlane &&');
  });

  it.each([
    ["scripts/ops/phase-a-runtime-freshness-repair.mjs",
      "PHASE_A_SUPABASE_FREE_TIER_RESTRICTED_NO_WRITES"],
    ["scripts/run-gdelt-gal-cycle.mjs",
      "GDELT_GAL_SUPABASE_FREE_TIER_RESTRICTED_NO_WRITES"],
  ])("refuses %s before DB/B2/HTTP when free quota is exhausted", (script,reason)=>{
    const dir=mkdtempSync(join(tmpdir(),"geomacro-frozen-no-write-"));
    try{
      const result=spawnSync(process.execPath,[script],{
        cwd:process.cwd(),encoding:"utf8",timeout:12000,
        env:{
          PATH:process.env.PATH??"",
          GEOMACRO_SUPABASE_RESTRICTED_MODE:"true",
          SUPABASE_DB_URL:"postgres://user:secret@db.test.invalid/main",
          B2_KEY_ID:"test-secret-never-send",
          B2_APPLICATION_KEY:"test-secret-never-send",
          GDELT_GAL_CYCLE_OUTPUT_DIR:dir,
        },
      });
      expect(result.status,result.stderr||result.stdout).not.toBe(0);
      expect(result.stderr).toContain(reason);
      expect(result.stderr).not.toContain("test-secret-never-send");
      expect(result.stdout).not.toContain("test-secret-never-send");
      expect(result.stdout).not.toContain("FRESH CYCLE COMPLETE");
    }finally{rmSync(dir,{recursive:true,force:true});}
  });

  it("provides exactly 16 90-minute slots without overlapping the official source monitor",()=>{
    expect(workflow).toContain('cron: "47 0,3,6,9,12,15,18,21 * * *"');
    expect(workflow).toContain('cron: "17 2,5,8,11,14,17,20,23 * * *"');
    expect(workflow).not.toContain('cron: "7,22,37,52 * * * *"');
    const slots=[
      ...[0,3,6,9,12,15,18,21].map(h=>h*60+47),
      ...[2,5,8,11,14,17,20,23].map(h=>h*60+17),
    ].sort((a,b)=>a-b);
    expect(slots).toHaveLength(16);
    expect(slots.slice(1).map((n,i)=>n-slots[i])).toEqual(Array(15).fill(90));
    expect(1440-slots.at(-1)!+slots[0]).toBe(90);
    const official=read(".github/workflows/expanded-official-source-observation.yml");
    expect(official).toContain('cron: "17 0,3,6,9,12,15,18,21 * * *"');
    expect(official).toContain('cron: "47 1,4,7,10,13,16,19,22 * * *"');
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(workflow).toContain('GEOMACRO_SUPABASE_RESTRICTED_MODE=true');
  });
});