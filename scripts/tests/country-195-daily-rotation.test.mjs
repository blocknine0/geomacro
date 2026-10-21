import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {
  COUNTRY_COUNT,MAX_COUNTRIES_PER_RUN,ROTATION_DAYS,ROTATION_EPOCH_MS,
  planCountry195DailyRotation,
} from "../lib/country-195-daily-rotation.mjs";

test("195 sovereign/observer country indices exactly covered by a 65-UTC-day 3/day sweep",()=>{
  assert.equal(COUNTRY_COUNT,195);
  assert.equal(MAX_COUNTRIES_PER_RUN,3);
  assert.equal(ROTATION_DAYS,65);
  const seen=[];
  for(let day=0;day<ROTATION_DAYS;day++){
    const plan=planCountry195DailyRotation({
      eventName:"schedule",now:new Date(ROTATION_EPOCH_MS+day*86_400_000+12*3_600_000),
    });
    assert.equal(plan.trigger,"DAILY_UTC_CALENDAR");
    assert.equal(plan.cycle_day,day);
    assert.ok(plan.count>0&&plan.count<=3);
    for(let j=0;j<plan.count;j++)seen.push(plan.start+j);
  }
  assert.deepEqual(seen,Array.from({length:195},(_,i)=>i));
  const next=planCountry195DailyRotation({
    eventName:"schedule",now:new Date(ROTATION_EPOCH_MS+65*86_400_000),
  });
  assert.equal(next.start,0);
  assert.equal(next.count,3);
});

test("restarts, extra pushes and workflows on same UTC day do not silently skip ISO3s",()=>{
  const at=new Date("2026-11-05T15:22:00.000Z");
  const a=planCountry195DailyRotation({eventName:"schedule",now:at});
  const b=planCountry195DailyRotation({eventName:"schedule",now:new Date("2026-11-05T23:58:00.000Z")});
  assert.deepEqual(a,b);
  assert.equal(planCountry195DailyRotation({eventName:"push",now:at}),null);
  assert.deepEqual(planCountry195DailyRotation({eventName:"workflow_dispatch",now:at,requestedStart:"194",requestedCount:"1"}),
    {start:194,count:1,trigger:"OPERATOR_PINNED",rotation_day:null,cycle_day:null});
  assert.equal(planCountry195DailyRotation({eventName:"workflow_dispatch",now:at,requestedCount:""}).count,3);
});

test("malformed, overbudget and future date input fails closed without country GET",()=>{
  const input=(start,count)=>planCountry195DailyRotation({
    eventName:"workflow_dispatch",requestedStart:start,requestedCount:count,
  });
  for(const [start,count] of [
    ["195","1"],["194","2"],["0","4"],["-1","1"],["+1","1"],
    ["1e2","1"],["1.2","1"],["0","0"],["0","-1"],["abc","1"],
    ["01","1"],["Infinity","1"],["0","01"],
  ])assert.throws(()=>input(start,count),/COUNTRY_195_/);
  assert.throws(()=>planCountry195DailyRotation({
    eventName:"schedule",requestedStart:"1",
  }),/COUNTRY_195_/);
  assert.throws(()=>planCountry195DailyRotation({
    eventName:"schedule",now:new Date("2026-10-21T23:59:59Z"),
  }),/COUNTRY_195_/);
  assert.throws(()=>planCountry195DailyRotation({eventName:"bad"}),/COUNTRY_195_/);
});

test("GitHub CLI always yields bounded safe outputs and never reads source data",()=>{
  const script=new URL("../ops/plan-country-195-daily-rotation.mjs",import.meta.url).href;
  const directory=mkdtempSync(join(tmpdir(),"country-195-plan-"));
  try{
    for(const event of ["schedule","workflow_dispatch","push"]){
      const output=join(directory,event);
      // Stable post-epoch CLI clock: the PR may be tested before the
      // next daily sweep starts on 2026-10-22 UTC.
      const code=`globalThis.Date=class extends Date{constructor(...a){if(a.length)super(...a);else super("2026-10-23T12:00:00.000Z")}};await import(${JSON.stringify(script)});`;
      const result=spawnSync(process.execPath,["--input-type=module","-e",code],{
        encoding:"utf8",env:{
          ...process.env,GITHUB_REPOSITORY:"blocknine0/geomacro",
          GITHUB_OUTPUT:output,GITHUB_EVENT_NAME:event,
          REQUESTED_START:event==="workflow_dispatch"?"194":"",
          REQUESTED_COUNT:event==="workflow_dispatch"?"1":"",
        },
      });
      assert.equal(result.status,0,result.stderr);
      const text=readFileSync(output,"utf8");
      assert.match(text,/should_run=(true|false)/);
      if(event==="push")assert.equal(text,"should_run=false\n");
      else{
        assert.match(text,/batch_start=\d+\n/);
        assert.match(text,/batch_count=[123]\n/);
      }
      assert.doesNotMatch(result.stdout,/https?:\/\/|source_url|article_title|raw_html/);
    }
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test("GitHub country rotation is schedule/dispatch-only with shared 12+4 budget",()=>{
  const yaml=readFileSync(".github/workflows/live-on-demand-source-acceptance.yml","utf8");
  assert.match(yaml,/cron: "23 8 \* \* \*"/);
  assert.ok(yaml.includes("plan-country-195-daily-rotation.mjs"));
  assert.ok(yaml.includes("steps.country_rotation.outputs.should_run == 'true'"));
  assert.ok(yaml.includes("GEOMACRO_COUNTRY_BATCH_START:"));
  assert.ok(yaml.includes("GEOMACRO_COUNTRY_BATCH_COUNT:"));
  assert.ok(!yaml.includes("GITHUB_RUN_NUMBER - 1"));
  assert.ok(yaml.includes("geomacro-live-on-demand-global-discovery-acceptance"));
});
