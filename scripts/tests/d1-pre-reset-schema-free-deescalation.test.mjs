import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {decideStep2WebsiteReconcile}
 from "../ops/step2-website-reconcile-dedup.mjs";

const now=Date.parse("2026-11-08T17:40:00.000Z");
const environment={GITHUB_EVENT_NAME:"schedule",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_TOKEN:"mock-github-actions-read-token"};
const confirmedStep="Catch up 72h archived Website IDs to the common D1 partner journal";
function fixture({step="success",run="success",minutes=20,http=200}={}){
 return async url=>{
  if(http!==200)return{ok:false,status:http};
  if(url.includes("/workflows/"))return{ok:true,json:async()=>({
   workflow_runs:[{id:123,head_branch:"main",status:"completed",
    conclusion:run,updated_at:new Date(now-minutes*60_000).toISOString()}]})};
  if(url.includes("/runs/123/jobs"))return{ok:true,json:async()=>({
   jobs:[{conclusion:"success",steps:[{name:confirmedStep,
    status:"completed",conclusion:step,
    completed_at:new Date(now-minutes*60_000).toISOString()}]}]})};
  throw Error("unexpected GitHub endpoint");
 };
}
test("daily Website catch-up is skipped only after proven successful exact hourly step",async()=>{
 const r=await decideStep2WebsiteReconcile({
  now,env:environment,fetchImpl:fixture()});
 assert.equal(r.should_run,false);
 assert.equal(r.provider_d1_queries,0);
 assert.equal(r.skipped_primary_ingestion,false);
 assert.equal(r.skipped_b2_archive,false);
});
test("missing GitHub permissions, stale run, skipped stage or manual dispatch always runs fallback",async()=>{
 for(const opts of [{http:403},{minutes:151},{run:"failure"},
  {step:"skipped"}]){
  const r=await decideStep2WebsiteReconcile({
   now,env:environment,fetchImpl:fixture(opts)});
  assert.equal(r.should_run,true);
 }
 const manual=await decideStep2WebsiteReconcile({
  now,env:{...environment,GITHUB_EVENT_NAME:"workflow_dispatch"},
  fetchImpl:async()=>{throw Error("must-not-fetch-for-manual");}});
 assert.equal(manual.should_run,true);
});
test("GRO historical cursor only runs hourly at :59; 2m B2 trigger tick unchanged",()=>{
 const source=readFileSync("workers/control-plane/src/index.mjs","utf8");
 assert.match(source,/utc\.getUTCMinutes\(\)%2===0\)\{\s*ctx\.waitUntil\(groEvidenceTick/u);
 assert.match(source,/utc\.getUTCMinutes\(\)%2===1&&\s*utc\.getUTCMinutes\(\)===59\)\{\s*ctx\.waitUntil\(groEvidenceBackfill/u);
 assert.equal(Array.from({length:1440},(_,m)=>m)
  .filter(m=>m%2===1&&m%60===59).length,24);
 assert.doesNotMatch(source,/GEOMACRO_GRO_BACKFILL_ONCE_V1/u);
 assert.match(source,/await pollP0aSources\(env/u);
 const gro=readFileSync("workers/control-plane/src/gro-evidence-enrichment.mjs","utf8");
 assert.match(gro,/INSERT OR IGNORE INTO gro_evidence_jobs/u);
});
test("optional Website dedup has actions:read and never bypasses original ingestion",()=>{
 const y=readFileSync(".github/workflows/website-finds-canonical-d1-reconcile.yml","utf8");
 assert.match(y,/permissions:\s*contents: read\s*actions: read/u);
 assert.match(y,/step2-website-reconcile-dedup\.mjs/u);
 assert.match(y,/steps\.step2-dedup\.outputs\.should_run == 'true'/u);
 assert.match(y,/workflow_dispatch/u);
 const hourly=readFileSync(".github/workflows/website-derived-news-continuity.yml","utf8");
 assert.match(hourly,/Catch up 72h archived Website IDs to the common D1 partner journal/u);
});
