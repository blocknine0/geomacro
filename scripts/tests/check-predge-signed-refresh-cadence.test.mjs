import test from "node:test";
import assert from "node:assert/strict";
import {assessSignedRefreshCadence,MAX_SIGNED_RUNS_PER_UTC_DAY} from "../ops/check-predge-signed-refresh-cadence.mjs";
const REPO="blocknine0/geomacro";
const NOW=Date.parse("2026-11-01T11:30:00Z");
const stepName="Generate, locally verify, publish and independently read back real signed envelope";
const makeRun=(id,minutesAgo,{signed=true,event="schedule",createdAt=null}={})=>{
 const when=createdAt||new Date(NOW-minutesAgo*60000).toISOString();
 return {id,event,head_branch:"main",status:"completed",conclusion:"success",
   created_at:when,updated_at:when,signed};
};
function mockGitHub(runs,{apiStatus=200}={}){
 const urls=[];
 const fetchImpl=async (url)=>{
   urls.push(url);
   if(apiStatus!==200)return {status:apiStatus,json:async()=>({})};
   if(url.includes("/actions/workflows/")){
     return {status:200,json:async()=>({workflow_runs:runs.map(({signed,...r})=>r)})};
   }
   const match=url.match(/\/actions\/runs\/(\d+)\/jobs/);
   assert.ok(match,"unexpected endpoint "+url);
   const run=runs.find(x=>x.id===Number(match[1]));
   assert.ok(run);
   return {status:200,json:async()=>({jobs:[{name:"refresh",
     conclusion:"success",
     steps:[{name:stepName,conclusion:run.signed?"success":"skipped"}]
   }]})};
 };
 return {fetchImpl,urls};
}
async function decide(runs,opts={}){
 const stub=mockGitHub(runs,opts);
 const result=await assessSignedRefreshCadence({fetchImpl:stub.fetchImpl,
   token:"abc123___read_only_token",repo:REPO,runId:999,eventName:"workflow_run",now:NOW});
 return {...result,urls:stub.urls};
}
test("manual exact approval bypasses GitHub freshness query",async()=>{
 const v=await assessSignedRefreshCadence({token:"abc123___read_only_token",
   repo:REPO,runId:999,eventName:"workflow_dispatch",now:NOW,
   fetchImpl:()=>{throw Error("should not query");}});
 assert.equal(v.should_run,true);
 assert.equal(v.reason,"EXPLICIT_MANUAL_OWNER_CONFIRMATION");
});
test("fresh source wake without preceding signed receipt is due",async()=>{
 const x=await decide([makeRun(101,5,{signed:false})]);
 assert.equal(x.should_run,true);
 assert.equal(x.reason,"SIGNING_DUE");
 assert.equal(x.signedToday,0);
});
test("completed GitHub job without signed step never counts as published",async()=>{
 const x=await decide([makeRun(101,5,{signed:false}),makeRun(102,35,{signed:true})]);
 assert.equal(x.should_run,true);
 assert.equal(x.signedToday,1);
});
test("a confirmed signed readback 12 minutes ago suppresses duplicate backstop",async()=>{
 const x=await decide([makeRun(101,12)]);
 assert.equal(x.should_run,false);
 assert.equal(x.reason,"RECENT_SIGNED_READBACK_EXISTS");
});
test("verified readback older than 25 minutes allows new publication",async()=>{
 const x=await decide([makeRun(101,31)]);
 assert.equal(x.should_run,true);
 assert.equal(x.signedToday,1);
});
test("48 actual signed runs in same UTC day enforce max daily cap",async()=>{
 const runs=Array.from({length:MAX_SIGNED_RUNS_PER_UTC_DAY},
   (_,i)=>makeRun(200+i,30+i));
 const x=await decide(runs);
 assert.equal(x.should_run,false);
 assert.equal(x.reason,"DAILY_SIGNED_REFRESH_CAP");
 assert.equal(x.signedToday,MAX_SIGNED_RUNS_PER_UTC_DAY);
});
test("GitHub API unavailable fails closed before private signing",async()=>{
 await assert.rejects(()=>decide([],{apiStatus:503}),/PREDGE_AUTO_REFRESH_GITHUB_RECEIPTS_UNAVAILABLE_503/);
});
test("canonical repository restriction holds even with a correct token",async()=>{
 await assert.rejects(()=>assessSignedRefreshCadence({repo:"other/geomacro",
   token:"abc123___read_only_token",runId:1,eventName:"workflow_run",now:NOW}),
   /PREDGE_AUTO_REFRESH_UNTRUSTED_REPOSITORY/);
});
test("untrusted event cannot implicitly sign",async()=>{
 await assert.rejects(()=>assessSignedRefreshCadence({repo:REPO,
   token:"abc123___read_only_token",runId:1,eventName:"pull_request",now:NOW}),
   /PREDGE_AUTO_REFRESH_EVENT_NOT_ALLOWED/);
});
test("previous UTC day's signed envelope avoids midnight duplicate",async()=>{
 const midnight=Date.parse("2026-11-02T00:10:00Z");
 const old=makeRun(101,0,{createdAt:"2026-11-01T23:58:00Z"});
 old.updated_at=old.created_at;
 const stub=mockGitHub([old]);
 const x=await assessSignedRefreshCadence({fetchImpl:stub.fetchImpl,
   token:"abc123___read_only_token",repo:REPO,runId:999,
   eventName:"schedule",now:midnight});
 assert.equal(x.should_run,false);
 assert.equal(x.reason,"RECENT_SIGNED_READBACK_EXISTS");
 assert.equal(x.signedToday,0);
});
