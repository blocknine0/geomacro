import {describe,it,expect} from "vitest";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {STAGE_DOMAINS,CANONICAL_CLASSIFIER_VERSION} from
  "../../scripts/lib/restricted-private-scored-stage.mjs";
import {evaluatePrivateStageArchiveAdmission} from
  "../../scripts/ops/check-private-stage-archive-admission.mjs";

const SHA="a".repeat(64);
function inputs(withRow=false){
  const stage=Object.fromEntries(STAGE_DOMAINS.map(category=>[
    category,{
      schema:"geomacro.private-scoring-candidates.v1",
      category,classifier_version:CANONICAL_CLASSIFIER_VERSION,
      private_only:true,records:withRow&&category==="geopolitics"
        ?[{id:SHA,category}]:[],
    },
  ]));
  const source=Object.fromEntries(STAGE_DOMAINS.map(category=>[
    category,{
      schema:"geomacro.private-gri-source-candidates.v1",
      category,private_only:true,public_published:false,commercial_eligible:false,
      records:withRow&&category==="geopolitics"
        ?[{event_id:SHA,category}]:[],
    },
  ]));
  return {stage,source};
}

describe("#1827 bundle B2 zero-stage admission (no funds)",()=>{
  it("does not try B2 if all original-source classifier outputs are empty",()=>{
    const {stage,source}=inputs();
    expect(evaluatePrivateStageArchiveAdmission(stage,source)).toEqual({
      archive_required:false,stage_row_count:0,b2_calls_by_preflight:0,
      public_published:false,commercial_eligible:false,
    });
  });
  it("requires full bundled verified B2+D1 archive whenever one source-bound score exists",()=>{
    const {stage,source}=inputs(true);
    expect(evaluatePrivateStageArchiveAdmission(stage,source)).toMatchObject({
      archive_required:true,stage_row_count:1,b2_calls_by_preflight:0,
      commercial_eligible:false,
    });
  });
  it("never treats missing, forged, unmatched, public, or oversized members as a safe empty archive",()=>{
    const {stage,source}=inputs(true);
    for(const [s,c] of [
      [stage,{...source,geopolitics:{...source.geopolitics,
        records:[{category:"geopolitics",event_id:"b".repeat(64)}]}}],
      [stage,{...source,geopolitics:{...source.geopolitics,
        public_published:true}}],
      [stage,{...source,geopolitics:{...source.geopolitics,
        commercial_eligible:true}}],
      [stage,{...source,geopolitics:{...source.geopolitics,records:[]}}],
      [{...stage,macro:undefined},source],
      [{...stage,geopolitics:{...stage.geopolitics,records:Array(3).fill({
        id:SHA,category:"geopolitics"})}},source],
    ] as const)expect(()=>evaluatePrivateStageArchiveAdmission(s,c)).toThrow(
      "PRIVATE_SCORING_B2_ARCHIVE_ADMISSION_INVALID");
  });
  it("CLI emits numeric zero and never sends source text to logs, then fails closed on tampering",()=>{
    const cwd=mkdtempSync(join(tmpdir(),"geomacro-zero-private-stage-"));
    const dir=join(cwd,"artifacts/restricted-current-scoring");
    mkdirSync(dir,{recursive:true});
    try{
      const {stage,source}=inputs();
      for(const domain of STAGE_DOMAINS){
        writeFileSync(join(dir,domain+".json"),JSON.stringify(stage[domain]));
        writeFileSync(join(dir,domain+"-source.json"),JSON.stringify(source[domain]));
      }
      const bin=resolve("scripts/ops/check-private-stage-archive-admission.mjs");
      const exec=()=>spawnSync(process.execPath,[bin],{
        cwd,env:{PATH:process.env.PATH},encoding:"utf8",timeout:10000,
      });
      const success=exec();
      expect(success.status).toBe(0);
      expect(success.stdout).toBe("0\n");
      expect(success.stderr).toBe("");
      writeFileSync(join(dir,"geopolitics-source.json"),JSON.stringify({
        ...source.geopolitics,commercial_eligible:true,
      }));
      const bad=exec();
      expect(bad.status).not.toBe(0);
      expect(bad.stdout).toBe("");
      expect(bad.stderr).toContain("PRIVATE_SCORING_B2_ARCHIVE_ADMISSION_INVALID");
      expect(bad.stderr).not.toContain("private_source_title");
    }finally{rmSync(cwd,{recursive:true,force:true})}
  });
  it("workflow invokes mandatory zero-stage guard before B2 network, keeps D1 and rights gates",()=>{
    const flow=readFileSync(".github/workflows/restricted-private-current-scoring.yml","utf8");
    const src=readFileSync("scripts/ops/check-private-stage-archive-admission.mjs","utf8");
    const guard=flow.indexOf("STAGED_COUNT=\"$(node scripts/ops/check-private-stage-archive-admission.mjs)\"");
    const archive=flow.indexOf("node scripts/ops/archive-restricted-private-scored-stage.mjs");
    expect(guard).toBeGreaterThan(flow.indexOf("id: headroom"));
    expect(archive).toBeGreaterThan(guard);
    expect(flow).toContain('steps.headroom.outputs.admitted == \'true\'');
    expect(flow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(flow).toContain('B2_REQUEST_BUDGET: "4"');
    expect(flow).toContain('node scripts/ops/private-classifier-retry-lifecycle.mjs commit "$domain"');
    expect(src).not.toContain("B2_APPLICATION_KEY");
    expect(src).not.toContain("GEOMACRO_COMMERCE_LEDGER_TOKEN");
  });
});
