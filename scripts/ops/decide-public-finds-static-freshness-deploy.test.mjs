import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {shouldDeployFreshPublicArchive,shouldDeployFullArchiveSnapshot,decidePublicArchiveDeployment}
 from "./decide-public-finds-static-freshness-deploy.mjs";
const now=Date.parse("2026-10-28T00:45:00.000Z");
const old=new Date(now-71*60*60*1000).toISOString();
const expired=new Date(now-73*60*60*1000).toISOString();
function source(id,at=old){
 return {id:"macro-"+id,category:"macro",title:"Geomacro finds monetary policy announcement",
  published_at:at,date_precision:"exact",status:"official_release_observed_unscored"};
}
function feed(signals=[]){return {
 ok:true,schema:"geomacro.website-derived-news-feed.v1",checked_at:new Date(now).toISOString(),
 original_release_delay_minutes:0,retention_days:3,retention_hours:72,
 delivery_scope:"free_website_only",scored:false,chargeable:false,
 supabase_dependency:false,signals,
};}
const COVERAGE={
 schema:"geomacro.free-derived-archive-eligibility.v1",
 checked_at:new Date(now).toISOString(),retention_hours:72,
 original_release_eligible_total:1,eligible_ids_sha256:"a".repeat(64),
 free_displayable_findings_total:1,d1_reads:0,free_website_only:true,
 paid_customer_eligible:false,unverified_promoted:false,
};
const INDEX={
 schema:"geomacro.permanent-derived-news-archive-index.v1",
 months:["2026-10"],categories:["geopolitics","macro","rare_earth"],
 updated_at:new Date(now-60_000).toISOString(),seed_complete:true,total_signals:100,
};
function writeCompanions(dir){
 writeFileSync(join(dir,"coverage-72h.json"),JSON.stringify(COVERAGE));
 writeFileSync(join(dir,"index.json"),JSON.stringify(INDEX));
}
test("identical preview does not hide changed full-archive eligibility or index",()=>{
 const older={...COVERAGE,checked_at:new Date(now-30*60_000).toISOString()};
 assert.equal(shouldDeployFullArchiveSnapshot(COVERAGE,older,INDEX,INDEX,now).deploy,false);
 assert.equal(shouldDeployFullArchiveSnapshot(COVERAGE,{...older,eligible_ids_sha256:"b".repeat(64)},INDEX,INDEX,now).deploy,true);
 assert.equal(shouldDeployFullArchiveSnapshot(COVERAGE,older,INDEX,{...INDEX,total_signals:101},now).deploy,true);
 assert.equal(shouldDeployFullArchiveSnapshot(COVERAGE,{...older,checked_at:new Date(now-7*60*60_000).toISOString()},INDEX,INDEX,now).deploy,true);
});
test("no D1 read / no needless Cloudflare Worker deploy when current live rows are identical",()=>{
 const a=feed([source("a".repeat(8))]);
 const b={...a,checked_at:new Date(now-30*60000).toISOString()};
 assert.deepEqual(shouldDeployFreshPublicArchive(a,b,now),
 {deploy:false,reason:"ALREADY_IDENTICAL_NATIVE_CLOCK_VALIDATED_FEED"});
});
test("at native 72h expiry, prune old public row instead of extending original time",()=>{
 const stale=feed([source("a".repeat(8),expired)]);
 const desired=feed([]);
 assert.deepEqual(shouldDeployFreshPublicArchive(desired,stale,now),
 {deploy:true,reason:"PUBLIC_FEED_ROWS_OR_SAFETY_CONTRACT_DIFFERS"});
 assert.equal(desired.signals.length,0);
 assert.equal(stale.signals[0].published_at,expired);
});
test("rights, schema, bad counts and remote corrupted rows all trigger truthful refresh",()=>{
 const current=feed([source("b".repeat(8))]);
 for(const changed of [
  {...current,chargeable:true},
  {...current,delivery_scope:"paid"},
  {...current,signals:[{...current.signals[0],status:"paid_verified"}]},
  {...current,signals:[]},
  {...current,checked_at:new Date(now+3600000).toISOString()},
  null,
 ])assert.equal(shouldDeployFreshPublicArchive(current,changed,now).deploy,true);
 assert.throws(()=>shouldDeployFreshPublicArchive({...current,chargeable:true},null,now),
 /PUBLIC_FINDS_EXPECTED_BUNDLE_INVALID/);
});
test("scheduled bounded network compare touches ONLY existing PUBLIC static origin",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"geomacro-free-launch-test-"));
 try{
  const path=join(dir,"latest.json"),expected=feed([source("c".repeat(8))]);
  writeFileSync(path,JSON.stringify(expected));
  writeCompanions(dir);
  const requests=[];
  const fetchImpl=async(url,opts)=>{
   requests.push({url,opts});
   if(String(url).includes("/coverage-72h.json"))
    return Response.json({...COVERAGE,checked_at:new Date(now-3600000).toISOString()});
   if(String(url).includes("/index.json"))return Response.json(INDEX);
   return Response.json({...expected,checked_at:new Date(now-3600000).toISOString()});
  };
  const r=await decidePublicArchiveDeployment({
   localPath:path,fetchImpl,now,env:{}});
  assert.equal(r.deploy_required,false);
  assert.equal(requests.length,3);
  assert.ok(requests[0].url.startsWith(
   "https://geomacro-public-finds-archive.daspallab202391.workers.dev/latest.json?"));
  assert.equal(requests[0].opts.method,"GET");
  assert.equal(requests[0].opts.redirect,"error");
  assert.equal(r.d1_queries,0);
  assert.equal(r.b2_requests,0);
  assert.equal(r.r2_requests,0);
  assert.equal(r.payments,0);
  assert.equal(r.predge_touched,false);
  assert.ok(!JSON.stringify(r).includes("monetary policy"));
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test("network denial triggers safe existing-public-Worker refresh, never fake no-op",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"geomacro-free-launch-test-"));
 try{
  const path=join(dir,"latest.json");writeFileSync(path,JSON.stringify(feed()));
  writeCompanions(dir);
  const r=await decidePublicArchiveDeployment({localPath:path,now,
   fetchImpl:async()=>new Response(null,{status:503}),env:{}});
  assert.equal(r.deploy_required,true);
  assert.equal(r.reason,"PUBLIC_ARCHIVE_REMOTE_READ_UNAVAILABLE");
 }finally{rmSync(dir,{recursive:true,force:true})}
});
