import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,writeFileSync,rmSync,chmodSync,symlinkSync}
 from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
 discoverPrivateCommercialNewsRequests,processAutomaticPrivateCommercialNewsBatch,
} from "./automatic-private-commercial-news-batch.mjs";

function fixture(t) {
 const root=mkdtempSync(join(tmpdir(),"geomacro-machine-batch-"));
 chmodSync(root,0o700);
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const put=(name,request)=>{
  writeFileSync(join(root,name+".machine-commercial-request.json"),
   JSON.stringify(request),{mode:0o600});
 };
 const input=(id,category="macro",country_iso3="USA")=>({
  schema:"geomacro.private-machine-commercial-request.v1",
  category,country_iso3,event:{id},body:"PRIVATE_PUBLISHER_CONTENT_NEVER_LOG",
 });
 return {root,put,input};
}
const inspect=async raw=>{
 const x=JSON.parse(raw);if(!x.event?.id)throw Error("PRIVATE_URL_LEAK");
 return {category:x.category,country_iso3:x.country_iso3,event_id:x.event.id};
};
const qualify=async()=>({status:"MACHINE_COMMERCIAL_SIGNED_PRIVATE_NO_FUNDS",
 country_iso3:"USA",category:"macro",record_sha256:"a".repeat(64)});

test("all eligible independently approved inputs are automatically offered to canonical qualifier",async t=>{
 const {root,put,input}=fixture(t);
 put("one",input("macro-001"));
 put("two",input("macro-002"));
 const result=await processAutomaticPrivateCommercialNewsBatch({
  root,inspect,qualify,
 });
 assert.equal(result.submitted_dual_authority_private_requests,2);
 assert.equal(result.newly_prepared_canonical_signed_gros,2);
 assert.equal(result.all_submitted_requests_accounted_for,true);
 assert.equal(result.all_internet_news_commercially_qualified,false);
 assert.equal(result.current_paid_delivery_authorized,false);
 assert.equal(result.current_hot_b2_d1_published,false);
 assert.equal(result.payments,0);
 const safe=JSON.stringify(result);
 for(const value of ["macro-001","PRIVATE_PUBLISHER","one.machine","a".repeat(64)])
  assert.equal(safe.includes(value),false);
});
test("invalid, unsigned and duplicate event submissions are never silently promoted",async t=>{
 const {root,put,input}=fixture(t);
 put("first",input("event-001"));
 put("duplicate",input("event-001"));
 put("bad",input(null));
 let called=0;
 const result=await processAutomaticPrivateCommercialNewsBatch({
  root,inspect,qualify:async()=>{called++;return qualify();},
 });
 assert.equal(result.submitted_dual_authority_private_requests,3);
 assert.equal(result.newly_prepared_canonical_signed_gros,1);
 assert.equal(result.repeated_event_requests_rejected,1);
 assert.equal(result.invalid_or_unverified_private_requests,1);
 assert.equal(called,1);
 assert.equal(result.all_submitted_requests_accounted_for,true);
});
test("unproven canonical result is not qualified; no input is also not qualified",async t=>{
 const {root,put,input}=fixture(t);
 const zero=await processAutomaticPrivateCommercialNewsBatch({root,inspect,qualify});
 assert.equal(zero.submitted_dual_authority_private_requests,0);
 assert.equal(zero.all_internet_news_commercially_qualified,false);
 put("invalid-proof",input("macro-123"));
 const rejected=await processAutomaticPrivateCommercialNewsBatch({
  root,inspect,qualify:async()=>{throw Error("UPSTREAM_PRIVATE_SECRET");},
 });
 assert.equal(rejected.invalid_or_unverified_private_requests,1);
 assert.equal(rejected.newly_prepared_canonical_signed_gros,0);
 assert.equal(JSON.stringify(rejected).includes("UPSTREAM_PRIVATE_SECRET"),false);
});
test("preexisting output is never counted as current, paid or verified",async t=>{
 const {root,put,input}=fixture(t);
 put("present",input("macro-123"));
 writeFileSync(join(root,"present.machine-commercial-prepared.json"),"old",{mode:0o600});
 let calls=0;
 const result=await processAutomaticPrivateCommercialNewsBatch({
  root,inspect,qualify:async()=>{calls++;throw Error("SHOULD_NOT_SIGN");},
 });
 assert.equal(calls,0);
 assert.equal(result.preexisting_artifacts_not_revalidated,1);
 assert.equal(result.newly_prepared_canonical_signed_gros,0);
});
test("private directory, source request and output path must not admit public modes or symlinks",async t=>{
 const {root,put,input}=fixture(t);
 put("one",input("macro-123"));
 const path=join(root,"one.machine-commercial-request.json");
 chmodSync(path,0o644);
 assert.throws(()=>discoverPrivateCommercialNewsRequests(root),
  /AUTOMATIC_PRIVATE_COMMERCIAL_NEWS_BATCH_REJECTED/);
 chmodSync(path,0o600);
 chmodSync(root,0o755);
 assert.throws(()=>discoverPrivateCommercialNewsRequests(root),
  /AUTOMATIC_PRIVATE_COMMERCIAL_NEWS_BATCH_REJECTED/);
 chmodSync(root,0o700);
 symlinkSync(path,join(root,"two.machine-commercial-request.json"));
 assert.throws(()=>discoverPrivateCommercialNewsRequests(root),
  /AUTOMATIC_PRIVATE_COMMERCIAL_NEWS_BATCH_REJECTED/);
});
test("batch overflow and suspicious candidate filenames fail closed",async t=>{
 const {root,put,input}=fixture(t);
 put("a",input("macro-123"));
 await assert.rejects(processAutomaticPrivateCommercialNewsBatch({
  root,inspect,qualify,maxItems:0,
 }),/AUTOMATIC_PRIVATE_COMMERCIAL_NEWS_BATCH_REJECTED/);
 writeFileSync(join(root,"unsafe space.machine-commercial-request.json"),
  "{}",{mode:0o600});
 assert.throws(()=>discoverPrivateCommercialNewsRequests(root),
  /AUTOMATIC_PRIVATE_COMMERCIAL_NEWS_BATCH_REJECTED/);
});

test("a rejected earlier submission cannot starve a later valid signed proof for the same event",async t=>{
 const {root,put,input}=fixture(t);
 put("aa-invalid",input("macro-222"));
 put("bb-valid",input("macro-222"));
 let calls=0;
 const r=await processAutomaticPrivateCommercialNewsBatch({
  root,inspect,qualify:async()=>{
   calls++;
   if(calls===1)throw Error("EARLIER_PROOF_NOT_REAL");
   return qualify();
  },
 });
 assert.equal(calls,2);
 assert.equal(r.invalid_or_unverified_private_requests,1);
 assert.equal(r.newly_prepared_canonical_signed_gros,1);
 assert.equal(r.repeated_event_requests_rejected,0);
 assert.equal(r.all_submitted_requests_accounted_for,true);
});
