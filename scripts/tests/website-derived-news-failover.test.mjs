import {test} from "node:test";
import {strict as assert} from "node:assert";
import {decideWebsiteNewsBackstop,BACKSTOP_AFTER_MS} from "../lib/website-derived-news-failover.mjs";
const NOW=Date.parse("2026-10-13T08:22:00.000Z");
const success=(at)=>({
  status:"completed", conclusion:"success",head_branch:"main",updated_at:at,
});
test("no unnecessary repeat publisher call 15 minutes after the hourly primary",()=>{
  const decision=decideWebsiteNewsBackstop([success("2026-10-13T08:07:00.000Z")],NOW);
  assert.equal(decision.should_run,false);
  assert.equal(decision.reason,"PUBLISHER_SUCCESS_RECENT");
  assert.equal(decision.age_minutes,15);
});
test("missed hourly 08:07 primary triggers bounded recovery at 08:22 after 07:07",()=>{
  const decision=decideWebsiteNewsBackstop([
    success("2026-10-13T07:07:00.000Z"),
    {status:"completed",conclusion:"failure",head_branch:"main",updated_at:"2026-10-13T08:10:00Z"},
    {status:"in_progress",conclusion:null,head_branch:"main",updated_at:"2026-10-13T08:18:00Z"},
  ],NOW);
  assert.equal(decision.should_run,true);
  assert.equal(decision.reason,"PUBLISHER_SUCCESS_STALE");
  assert.equal(decision.age_minutes,75);
});
test("old push run does not disguise an unattended scheduler lapse",()=>{
  const decision=decideWebsiteNewsBackstop([
    success("2026-10-13T01:14:00Z"),
    {status:"completed",conclusion:"skipped",head_branch:"main",updated_at:"2026-10-13T08:05:00Z"},
  ],NOW);
  assert.equal(decision.should_run,true);
  assert.ok(decision.age_minutes>420);
});
test("never accept another branch, a failed check, unknown date or future success",()=>{
  const rows=[
    {...success("2026-10-13T08:10:00Z"),head_branch:"fix/fake"},
    {...success("2026-10-13T08:11:00Z"),conclusion:"failure"},
    {...success("invalid"),updated_at:"invalid"},
    {...success("2026-10-14T08:20:00Z")},
  ];
  const d=decideWebsiteNewsBackstop(rows,NOW);
  assert.equal(d.should_run,true);
  assert.equal(d.reason,"NO_CONFIRMED_SUCCESS");
  assert.equal(d.last_success_at,null);
  assert.equal(d.guaranteed,false);
});
test("exact threshold enables backup and preserves true success time",()=>{
  const at=NOW-BACKSTOP_AFTER_MS;
  const decision=decideWebsiteNewsBackstop([success(new Date(at).toISOString())],NOW);
  assert.equal(decision.should_run,true);
  assert.equal(decision.last_success_at,new Date(at).toISOString());
});
test("a branch-run not completed is not false evidence and missing list fails safely",()=>{
  assert.equal(decideWebsiteNewsBackstop([],NOW).should_run,true);
  assert.throws(()=>decideWebsiteNewsBackstop(null,NOW),/INPUT_INVALID/);
  assert.throws(()=>decideWebsiteNewsBackstop([],Number.NaN),/INPUT_INVALID/);
});

test('actual cadence CLI coalesces a recent primary on push but preserves manual recovery',async()=>{
  const {mkdtempSync,readFileSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {spawnSync}=await import('node:child_process');
  const script=new URL('../ops/check-website-derived-news-cadence.mjs',import.meta.url).href;
  const temp=mkdtempSync(join(tmpdir(),'news-cadence-'));
  try{
    for(const [event,minutes,expected] of [['push',5,false],['workflow_run',10,false],['schedule',69,false],['schedule',71,true],['workflow_run',80,true],['workflow_dispatch',5,true]]){
      const output=join(temp,event+'-'+minutes);
      const code=`globalThis.fetch=async()=>Response.json({workflow_runs:[{status:'completed',conclusion:'success',head_branch:'main',updated_at:new Date(Date.now()-${minutes}*60000).toISOString()}]});await import(${JSON.stringify(script)});`;
      const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',env:{...process.env,
        GITHUB_REPOSITORY:'blocknine0/geomacro',GITHUB_TOKEN:'synthetic-token',GITHUB_OUTPUT:output,GITHUB_EVENT_NAME:event}});
      assert.equal(result.status,0,result.stderr);
      assert.equal(readFileSync(output,'utf8'),`should_run=${expected}\n`);
    }
  }finally{rmSync(temp,{recursive:true,force:true});}
});

test("hourly Cloudflare collection and +15m recovery retain single-writer and three-domain invariants",async()=>{
  const {readFileSync}=await import("node:fs");
  const root=new URL("../../",import.meta.url);
  const primary=readFileSync(new URL(".github/workflows/website-derived-news-continuity.yml",root),"utf8");
  const backstop=readFileSync(new URL(".github/workflows/website-derived-news-cadence-backstop.yml",root),"utf8");
  const collector=readFileSync(new URL("scripts/ops/publish-website-derived-news.ts",root),"utf8");
  const legacy=readFileSync(new URL(".github/workflows/auto-ingest-news.yml",root),"utf8");
  assert.ok(primary.includes('cron: "7 * * * *"'));
  assert.ok(backstop.includes('cron: "22 * * * *"'));
  assert.equal(BACKSTOP_AFTER_MS,70*60_000);
  assert.ok(primary.includes("group: geomacro-website-derived-news-continuity"));
  assert.ok(backstop.includes("group: geomacro-website-derived-news-continuity"));
  assert.match(collector,/const categories=\["geopolitics","macro","rare_earth"\] as const/);
  assert.ok(collector.includes("DERIVED_NEWS_SUPABASE_BLOCKED"));
  assert.ok(collector.includes("geomacro-control-plane.daspallab202391.workers.dev/v1/website-derived-news"));
  assert.ok(collector.includes('GEOMACRO_AUTOMATED_FINDS_PUBLICATION==="1"'));
  assert.ok(primary.includes('GEOMACRO_AUTOMATED_FINDS_PUBLICATION: "1"'));
  assert.ok(legacy.includes("if: " + "$" + "{{ false }}"));
});
