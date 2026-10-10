import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const read=(p:string)=>readFileSync(p,"utf8");
const workflows=[
  {file:".github/workflows/phase-a-runtime-freshness-repair.yml",
   input:"permit_legacy_supabase_repair",writer:"bun scripts/ops/phase-a-runtime-freshness-repair.mjs"},
  {file:".github/workflows/gdelt-gal-live-sync.yml",
   input:"permit_legacy_supabase_gal",writer:"node scripts/run-gdelt-gal-cycle.mjs"},
];
describe("#1827 Supabase-free hard stop: no automatic legacy recovery SQL writes",()=>{
  it.each(workflows)("$file is gated by explicit owner action and current live bulk-write free headroom",
  ({file,input,writer})=>{
    const s=read(file);
    expect(s).toContain("workflow_dispatch:");
    expect(s).toContain(input+":");
    expect(s).toContain("default: false");
    expect(s).toContain("type: boolean");
    expect(s).toContain("github.event_name == 'workflow_dispatch'");
    expect(s).toContain("inputs."+input+" == true");
    expect(s).toContain("github.ref == 'refs/heads/main'");
    expect(s).not.toContain("\n  push:\n");
    expect(s).not.toContain("\n  schedule:\n");
    expect(s).not.toContain("\n  workflow_run:\n");
    expect(s).toContain("Require current Supabase free-tier budget before any recovery SQL writer");
    expect(s).toContain("supabase-free-tier-budget.mjs --require-bulk-write --require-normal");
    expect(s).toContain(".policy.recurring_ingest_allowed == true");
    expect(s).toContain("FROZEN_SUPABASE_LEGACY_RECOVERY_QUOTA_HELD");
    expect(s.indexOf("Require current Supabase free-tier budget"))
      .toBeLessThan(s.indexOf(writer));
    expect(s).not.toContain("REMOVE_B2_ARCHIVE");
    expect(s).not.toContain("executeUSDCSettlement");
  });
  it("separately retains Supabase-independent 90m original-source monitoring",()=>{
    const source=read(".github/workflows/expanded-official-source-observation.yml");
    const runner=read("scripts/intelligence-orchestrator.mjs");
    expect(source).toContain('cron: "17 0,3,6,9,12,15,18,21 * * *"');
    expect(source).toContain('cron: "47 1,4,7,10,13,16,19,22 * * *"');
    expect(runner).toContain('key: "official_native_rss"');
    expect(runner).toContain("restrictedDirectPostgresSafe: true");
    expect(runner).toContain('if (restrictedDataPlane && task.restrictedDirectPostgresSafe !== true) continue;');
  });
});