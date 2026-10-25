import {test} from "node:test";
import {strict as assert} from "node:assert";
import {decideWebsiteNewsBackstop,verifiedBackstopPublicationTime,verifiedPrimaryPublicationTime,BACKSTOP_AFTER_MS} from "../lib/website-derived-news-failover.mjs";
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
      const code=`globalThis.fetch=async u=>{
        const path=new URL(u).pathname;
        const at=new Date(Date.now()-${minutes}*60000).toISOString();
        if(path.endsWith("/website-derived-news-continuity.yml/runs"))
          return Response.json({workflow_runs:[{id:201,status:"completed",conclusion:"success",
            head_branch:"main",updated_at:at}]});
        if(path.endsWith("/runs/201/jobs"))return Response.json({jobs:[{
          name:"refresh-derived-news",status:"completed",conclusion:"success",
          completed_at:at,
          steps:["Read three domains and write only derived news to existing D1",
            "Independently verify public derived-news journal"].map(name=>
             ({name,status:"completed",conclusion:"success"}))
        }]});
        if(path.endsWith("/website-derived-news-cadence-backstop.yml/runs"))
          return Response.json({workflow_runs:[]});
        throw Error("UNEXPECTED_TEST_GITHUB_API_PATH");
      };await import(${JSON.stringify(script)});`;
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
  assert.ok(backstop.includes('cron: "22,52 * * * *"'));
  assert.ok(backstop.includes('"Three-Domain 30-Minute Original Publisher Pulse"'));
  assert.ok(backstop.includes('Read latest successful actual primary D1 publication clock'));
  assert.ok(backstop.includes('cancel-in-progress: false'));
  assert.equal(BACKSTOP_AFTER_MS,70*60_000);
  assert.ok(primary.includes("group: geomacro-website-derived-news-continuity"));
  assert.ok(backstop.includes("group: geomacro-website-derived-news-continuity"));
  assert.match(collector,/const categories=\["geopolitics","macro","rare_earth"\] as const/);
  assert.ok(collector.includes("DERIVED_NEWS_SUPABASE_BLOCKED"));
  assert.ok(collector.includes('const CONTROL_PLANE_ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev"'));
  assert.ok(collector.includes('const ENDPOINT=CONTROL_PLANE_ORIGIN+"/v1/website-derived-news"'));
  assert.ok(collector.includes('GEOMACRO_AUTOMATED_FINDS_PUBLICATION==="1"'));
  assert.ok(primary.includes('GEOMACRO_AUTOMATED_FINDS_PUBLICATION: "1"'));
  assert.ok(legacy.includes("if: " + "$" + "{{ false }}"));
  assert.ok(legacy.includes('cron: "37 * * * *"'));
  assert.ok(legacy.includes("ingest-supabase-free-derived-news:"));
  assert.ok(legacy.includes("website-derived-news-cadence-backstop.yml/dispatches"));
  assert.ok(legacy.includes("actions: write"));
  assert.ok(legacy.includes("CANONICAL_D1_RECOVERY_DISPATCH_REJECTED_"));
  assert.ok(backstop.includes("workflow_call: {}"));
  assert.ok(legacy.includes("actions: read"));
  assert.ok(legacy.includes("cancel-in-progress: false"));
  assert.ok(!legacy.includes("  recover-news-ingest:\n    runs-on:"));
});

const finishedRecovery=(completedAt)=>({
  name:"catch-up-derived-only",status:"completed",conclusion:"success",
  completed_at:completedAt,steps:[
    "Publish bounded 3-domain derived news to existing D1 (idempotent)",
    "Independently verify signed Finds across combined and category reads",
    "Independently prove private-source-free D1 readback after recovery",
  ].map(name=>({name,status:"completed",conclusion:"success"})),
});
test("green-but-skipped primary cannot hide missed ingestion",()=>{
  const run={id:201,status:"completed",conclusion:"success",
    head_branch:"main",updated_at:"2026-10-13T08:20:00Z"};
  const job={name:"refresh-derived-news",status:"completed",conclusion:"success",
    completed_at:"2026-10-13T08:19:00Z",
    steps:["Read three domains and write only derived news to existing D1",
      "Independently verify public derived-news journal"].map(name=>
      ({name,status:"completed",conclusion:"success"}))};
  assert.equal(verifiedPrimaryPublicationTime(run,[job],NOW),
    "2026-10-13T08:19:00.000Z");
  assert.equal(verifiedPrimaryPublicationTime(run,[{...job,
    steps:job.steps.map(s=>({...s,conclusion:"skipped"}))}],NOW),null);
  assert.equal(verifiedPrimaryPublicationTime(run,[{...job,
    steps:job.steps.slice(0,1)}],NOW),null);
  assert.equal(verifiedPrimaryPublicationTime({...run,head_branch:"other"},[job],NOW),null);
});
test("a green but skipped recovery never resets the writer freshness clock",()=>{
  const run={id:123,head_branch:"main",status:"completed",conclusion:"success",
    updated_at:"2026-10-13T08:20:00Z"};
  const actual=finishedRecovery("2026-10-13T08:19:00Z");
  assert.equal(verifiedBackstopPublicationTime(run,[actual],NOW),
    "2026-10-13T08:19:00.000Z");
  const noop={...actual,steps:actual.steps.map(s=>({...s,
    conclusion:s.name.startsWith("Publish bounded")?"skipped":"success"}))};
  assert.equal(verifiedBackstopPublicationTime(run,[noop],NOW),null);
  const unread={...actual,steps:actual.steps.filter(s=>!s.name.includes("D1 readback"))};
  assert.equal(verifiedBackstopPublicationTime(run,[unread],NOW),null);
  assert.equal(verifiedBackstopPublicationTime(run,[{...actual,conclusion:"failure"}],NOW),null);
  assert.equal(verifiedBackstopPublicationTime({...run,head_branch:"untrusted"},[actual],NOW),null);
  assert.equal(verifiedBackstopPublicationTime({...run,status:"in_progress"},[actual],NOW),null);
  assert.equal(verifiedBackstopPublicationTime({...run,id:0},[actual],NOW),null);
  assert.equal(verifiedBackstopPublicationTime(run,[{...actual,completed_at:"2026-10-14T00:00:00Z"}],NOW),null);
});
test("B2/signature outage cannot erase a genuine free D1 publication clock",()=>{
  const run={id:123,head_branch:"main",status:"completed",conclusion:"success",
    updated_at:"2026-10-13T08:20:00Z"};
  const recovery=finishedRecovery("2026-10-13T08:19:00Z");
  const signingHeld={...recovery,steps:recovery.steps.map(step=>
    step.name.includes("signed Finds")
      ?{...step,conclusion:"failure"}:step)};
  assert.equal(verifiedBackstopPublicationTime(run,[signingHeld],NOW),
    "2026-10-13T08:19:00.000Z");
  const missingSign={...recovery,
    steps:recovery.steps.filter(step=>!step.name.includes("signed Finds"))};
  assert.equal(verifiedBackstopPublicationTime(run,[missingSign],NOW),
    "2026-10-13T08:19:00.000Z");
  const noD1={...recovery,steps:recovery.steps.filter(step=>!step.name.includes("D1 readback"))};
  assert.equal(verifiedBackstopPublicationTime(run,[noD1],NOW),null);
});

test("hourly cadence CLI counts only real D1-writer-and-readback recovery when primary missed",async()=>{
  const {mkdtempSync,readFileSync,rmSync}=await import("node:fs");
  const {tmpdir}=await import("node:os");
  const {join}=await import("node:path");
  const {spawnSync}=await import("node:child_process");
  const script=new URL("../ops/check-website-derived-news-cadence.mjs",import.meta.url).href;
  const temp=mkdtempSync(join(tmpdir(),"news-signed-recovery-"));
  try{
    for(const mode of ["readback_verified","noop_green","readback_missing","proof_http_failed"]){
      const output=join(temp,mode);
      const minutes=80, now=Date.now();
      const recoveryAt=new Date(now-10*60_000).toISOString();
      const recovered={id:123,status:"completed",conclusion:"success",head_branch:"main",
        updated_at:new Date(now-9*60_000).toISOString()};
      const steps=finishedRecovery(recoveryAt).steps;
      const jobs=[{...finishedRecovery(recoveryAt),steps:mode==="noop_green"
        ?steps.map(x=>({...x,conclusion:"skipped"})):mode==="readback_missing"
          ?steps.slice(0,2):steps}];
      const code=`globalThis.fetch=async u=>{
        const url=new URL(u);
        if(url.pathname.endsWith("/website-derived-news-continuity.yml/runs"))
          return Response.json({workflow_runs:[{status:"completed",conclusion:"success",
            id:201,head_branch:"main",updated_at:new Date(Date.now()-${minutes}*60000).toISOString()}]});
        if(url.pathname.endsWith("/runs/201/jobs")){
          const at=new Date(Date.now()-${minutes}*60000).toISOString();
          return Response.json({jobs:[{name:"refresh-derived-news",status:"completed",
            conclusion:"success",completed_at:at,
            steps:["Read three domains and write only derived news to existing D1",
              "Independently verify public derived-news journal"].map(name=>
              ({name,status:"completed",conclusion:"success"}))}]});
        }
        if(url.pathname.endsWith("/website-derived-news-cadence-backstop.yml/runs"))
          return ${JSON.stringify(mode)}==="proof_http_failed"
            ?new Response("",{status:503}):Response.json({workflow_runs:${JSON.stringify([recovered])}});
        if(url.pathname.endsWith("/runs/123/jobs"))
          return Response.json({jobs:${JSON.stringify(jobs)}});
        throw Error("unexpected mocked GH endpoint "+url.href);
      };await import(${JSON.stringify(script)});`;
      const result=spawnSync(process.execPath,["--input-type=module","-e",code],{
        encoding:"utf8",env:{...process.env,GITHUB_REPOSITORY:"blocknine0/geomacro",
          GITHUB_TOKEN:"synthetic-token",GITHUB_EVENT_NAME:"schedule",GITHUB_OUTPUT:output},
      });
      assert.equal(result.status,0,result.stderr);
      assert.equal(readFileSync(output,"utf8"),
        `should_run=${mode==="readback_verified"?"false":"true"}\n`);
      if(mode==="readback_verified"){
        assert.match(result.stdout,/VERIFIED_RECOVERY_D1_READBACK/);
        assert.match(result.stdout,/"should_publish":false/);
      }
    }
  }finally{rmSync(temp,{recursive:true,force:true});}
});

test("skipped primary green run never forges a fresh writer even when recovery proof exists",async()=>{
  const {mkdtempSync,readFileSync,rmSync}=await import("node:fs");
  const {tmpdir}=await import("node:os");
  const {join}=await import("node:path");
  const {spawnSync}=await import("node:child_process");
  const script=new URL("../ops/check-website-derived-news-cadence.mjs",import.meta.url).href;
  const dir=mkdtempSync(join(tmpdir(),"news-proof-failover-"));
  try{
    for(const recovered of [false,true]){
      const output=join(dir,String(recovered)),now=Date.now();
      const prior=new Date(now-80*60_000).toISOString();
      const latest=new Date(now-10*60_000).toISOString();
      const recoveryRun={id:123,head_branch:"main",status:"completed",conclusion:"success",
        updated_at:latest};
      const recoveryJob={name:"catch-up-derived-only",status:"completed",conclusion:"success",
        completed_at:latest,steps:[
          "Publish bounded 3-domain derived news to existing D1 (idempotent)",
          "Independently prove private-source-free D1 readback after recovery",
        ].map(name=>({name,status:"completed",conclusion:"success"}))};
      const code=`globalThis.fetch=async u=>{
        const url=new URL(u);
        if(url.pathname.endsWith("/website-derived-news-continuity.yml/runs"))
          return Response.json({workflow_runs:[{id:201,status:"completed",
            conclusion:"success",head_branch:"main",updated_at:${JSON.stringify(latest)}}]});
        if(url.pathname.endsWith("/runs/201/jobs"))
          return Response.json({jobs:[{name:"refresh-derived-news",status:"completed",
            conclusion:"success",completed_at:${JSON.stringify(latest)},
            steps:[{name:"Read three domains and write only derived news to existing D1",
              status:"completed",conclusion:"skipped"}]}]});
        if(url.pathname.endsWith("/website-derived-news-cadence-backstop.yml/runs"))
          return Response.json({workflow_runs:${JSON.stringify(recovered?[recoveryRun]:[])}});
        if(url.pathname.endsWith("/runs/123/jobs"))
          return Response.json({jobs:${JSON.stringify([recoveryJob])}});
        throw Error("unexpected fake GH path");
      };await import(${JSON.stringify(script)});`;
      const got=spawnSync(process.execPath,["--input-type=module","-e",code],{
        encoding:"utf8",env:{...process.env,GITHUB_REPOSITORY:"blocknine0/geomacro",
        GITHUB_TOKEN:"test-token",GITHUB_EVENT_NAME:"schedule",GITHUB_OUTPUT:output}});
      assert.equal(got.status,0,got.stderr);
      assert.equal(readFileSync(output,"utf8"),
        "should_run="+(recovered?"false":"true")+"\n");
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test("backstop workflow is parseable by GitHub with a real boolean continue-on-error",async()=>{
  const {readFileSync}=await import("node:fs");
  const src=readFileSync(new URL("../../.github/workflows/website-derived-news-cadence-backstop.yml",import.meta.url),"utf8");
  assert.ok(src.includes("if: always() && steps.decide.outputs.should_run == 'true'"));
  assert.ok(src.includes("continue-on-error: true"));
  assert.ok(!src.includes("continue-on-error: true &&"));
  assert.ok(src.includes('cron: "22,52 * * * *"'));
  assert.ok(src.includes("group: geomacro-website-derived-news-continuity"));
});


test("production cadence backstop uses the shared OSINT-safe readback contract", async () => {
  const {readFileSync}=await import("node:fs");
  const workflow=readFileSync(new URL("../../.github/workflows/website-derived-news-cadence-backstop.yml",import.meta.url),"utf8");
  assert.ok(workflow.includes('import {isSafeDerivedNewsReadbackSignal} from "./scripts/lib/derived-news-readback-policy.mjs";'));
  assert.ok(workflow.includes("!isSafeDerivedNewsReadbackSignal(s)"));
  assert.ok(!workflow.includes('/https?:\\/\\/|www\\./iu.test(JSON.stringify(s))'));
  const {isSafeDerivedNewsReadbackSignal}=await import("../lib/derived-news-readback-policy.mjs");
  const safe={
    id:"macro-12345678",category:"macro",
    title:"Geomacro finds official economic statistics source-feed observation",
    what_changed:"A monitored source feed contains a dated item about official economic statistics. The event actor, precise action and impact have not been independently verified.",
    why_it_matters:"This observation can guide follow-up checks, but it does not establish a macroeconomic value, market move or verified consequence.",
    topic:"official economic statistics",geography:null,
    development_type:"unverified OSINT feed observation",
    published_at:"2026-10-25T11:25:00.000Z",date_precision:"exact",observed_release_count:1,
    sources_credited:["Monitored feed: www.bankofcanada.ca"],
    status:"osint_feed_observed_unverified",same_event_corrob_verified:false,severity:null,
  };
  assert.equal(isSafeDerivedNewsReadbackSignal(safe),true);
  assert.equal(isSafeDerivedNewsReadbackSignal({...safe,what_changed:"Open https://example.com/path"}),false);
  assert.equal(isSafeDerivedNewsReadbackSignal({...safe,sources_credited:["Monitored feed: bankofcanada.ca/path"]}),false);
});
