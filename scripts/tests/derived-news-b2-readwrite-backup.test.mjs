import test from "node:test";
import {gunzipSync} from "node:zlib";
import assert from "node:assert/strict";
import {archiveDerivedJournalToB2,readExactCurrentDerivedJournal,
 buildDerivedJournalB2Plan,verifyDerivedJournalB2Restore}
 from "../lib/derived-news-b2-readwrite-backup.mjs";
import {runGovernedDerivedNewsBackup,summarizeSafeBackupReceipt}
 from "../ops/archive-live-derived-news-to-b2.mjs";
const now=new Date("2026-10-22T12:07:00Z");
const sample=(category,id)=>{
 const topics={geopolitics:"security and diplomacy",macro:"monetary policy",
  rare_earth:"critical-minerals policy"};
 return {id:category+"-"+id,category,title:"Geomacro finds a dated official "+
    category+" policy development",what_changed:"A named original issuer published an official policy update relevant to "+category+".",
  why_it_matters:"The documented policy development could change exposure, but economic or security effects need independent evidence.",
  topic:topics[category],geography:"India",development_type:"policy",
  published_at:"2026-10-22T04:00:00.000Z",date_precision:"exact",
  observed_release_count:1,sources_credited:[],status:"official_release_observed_unscored",
  same_event_corrob_verified:false,severity:null};
};
const rows=[
 sample("geopolitics","1234abcd"),sample("macro","2345abcd"),
 sample("rare_earth","3456abcd")
];
const page=(signals,offset=0,more=false)=>({
 ok:true,schema:"geomacro.website-derived-news-feed.v1",
 delivery_scope:"free_website_only",retention_hours:72,
 original_release_delay_minutes:0,page_offset:offset,page_size:250,
 has_more:more,next_offset:more?offset+250:null,signals
});
const fetchDoc=(doc=page(rows))=>async(url,init)=>{
 assert.equal(new URL(url).host,"geomacro-control-plane.daspallab202391.workers.dev");
 assert.equal(init.redirect,"error");assert.equal(init.method,"GET");
 return Response.json(doc);
};
const b2=()=>({
 count:0,async putWithMetadataVerification(key,compressed,{verifyRestored}){
  assert.match(key,/^geomacro-evidence\/v1\/private\/derived-news-journal\/2026\/10\/22\/[0-9a-f]{64}\.json\.gz$/u);
  assert.ok(compressed.length>40);
  assert.equal(await verifyRestored(compressed),true);
  this.count++;return {full_body_readback_verified:true,
   sha256:(await import("node:crypto")).createHash("sha256").update(compressed).digest("hex"),
   bytes:compressed.length};
 }
});
test("actual three-domain D1 stories are B2 PUT+GET restored exact, no paid signing",async()=>{
 const archive=b2(),result=await archiveDerivedJournalToB2({
  fetchImpl:fetchDoc(),b2:archive,now});
 assert.equal(result.status,"B2_PUT_FULL_GET_RESTORED_SHA_VERIFIED");
 assert.equal(result.archived_rows,3);
 assert.deepEqual(result.category_counts,{geopolitics:1,macro:1,rare_earth:1});
 assert.equal(archive.count,1);
 assert.equal(result.b2_exact_readback_verified,true);
 assert.equal(result.source_d1_readback_verified,true);
 assert.equal(result.same_news_as_intelligence_d1,true);
 assert.equal(result.independent_gri_signed,false);
 assert.equal(result.paid_eligible,false);
 assert.equal(result.payments,0);
});
test("archive only at four UTC time windows, without extra original provider reads",async()=>{
 const archive=b2();
 const receipt=await archiveDerivedJournalToB2({
  fetchImpl:async()=>{throw Error("READ_UNEXPECTED");},b2:archive,
  now:new Date("2026-10-22T13:07:00Z")});
 assert.equal(receipt.status,"SKIPPED_SIX_HOUR_ARCHIVE_SLOT");
 assert.equal(archive.count,0);
});
test("empty D1 journal never manufactures news nor creates a private blob",async()=>{
 const archive=b2(),receipt=await archiveDerivedJournalToB2({
  fetchImpl:fetchDoc(page([])),b2:archive,now});
 assert.equal(receipt.status,"SKIPPED_NO_QUALIFYING_D1_NEWS");
 assert.equal(archive.count,0);
});
test("wrong D1 page identity, missing cursor, stale item, URL-containing item all fail closed",async()=>{
 for(const doc of [
  page(rows,250),{...page(rows),has_more:true,next_offset:250},
  page([{...rows[0],published_at:"2026-10-18T04:00:00.000Z"}]),
  page([{...rows[0],source_url:"https://private.example.org"}]),
  page([{...rows[0],what_changed:"See https://private.example.org/article"}]),
  page([{...rows[0],status:"official_release_observed_unscored",severity:55}])
 ]){
  await assert.rejects(()=>archiveDerivedJournalToB2({
   fetchImpl:fetchDoc(doc),b2:b2(),now
  }),/DERIVED_NEWS_B2_/u);
 }
});
test("B2 readback corruption or quota/transport denial is never accepted",async()=>{
 const plan=buildDerivedJournalB2Plan(rows,now);
 assert.throws(()=>verifyDerivedJournalB2Restore(Buffer.from("corrupted"),plan),
  /B2_EXACT_COMPRESSED_READBACK_INVALID/u);
 const failB2={async putWithMetadataVerification(){
   throw Error("B2_GLOBAL_DAILY_QUOTA_EXHAUSTED");
 }};
 await assert.rejects(()=>archiveDerivedJournalToB2({
   fetchImpl:fetchDoc(),b2:failB2,now
 }),/B2_GLOBAL_DAILY_QUOTA_EXHAUSTED/u);
});
test("private B2 plan retains only approved source-neutral signal schema and no original links",()=>{
 const plan=buildDerivedJournalB2Plan(rows,now);
 const data=JSON.parse(gunzipSync(plan.compressed).toString("utf8"));
 assert.equal(data.schema,"geomacro.private-derived-news-journal-b2.v1");
 assert.equal(data.record_count,3);
 assert.equal(data.signed_hot_product,false);
 assert.equal(data.commercial_resale_authorized,false);
 assert.equal(data.raw_original_content_stored,false);
 assert.equal(data.source_original_urls_stored,false);
 assert.equal(JSON.stringify(data).includes("https://"),false);
});
test("quota guard reserves free signed-hot recovery headroom before creating B2 client",async()=>{
 const env={GITHUB_REPOSITORY:"blocknine0/geomacro",
  GITHUB_REF:"refs/heads/main",GITHUB_ACTIONS:"true",GITHUB_RUN_ID:"12345",
  B2_ACCOUNT_QUOTA_REQUIRED:"1",B2_ACCOUNT_QUOTA_WORKFLOW_ID:"derived_news_backup",
  B2_REQUEST_BUDGET:"12",GITHUB_EVENT_NAME:"schedule"};
 const quota={ok:true,used:{total:98,GET:42,PUT:52,NATIVE_AUTH:9},
  limits:{total:100,GET:45,PUT:55,NATIVE_AUTH:10}};
 const receipt=await runGovernedDerivedNewsBackup({env,now,
  governorFactory:()=>({status:async()=>quota}),
  b2Factory:()=>{throw Error("MUST_NOT_CREATE_B2_CLIENT");},
  fetchImpl:async()=>{throw Error("MUST_NOT_GET_D1");}});
 assert.equal(receipt.status,"B2_SHARED_ACCOUNT_RECOVERY_HEADROOM_HELD");
 assert.equal(receipt.b2_put_verified,false);
});

test("independent B2 job receipt is green ONLY after actual PUT plus full GET and restored SHA",()=>{
 const testNow=new Date("2026-10-22T12:08:00Z");
 const good=summarizeSafeBackupReceipt({
  status:"B2_PUT_FULL_GET_RESTORED_SHA_VERIFIED",
  b2_put_verified:true,b2_exact_readback_verified:true,
  source_d1_readback_verified:true,
  archived_rows:3,category_counts:{geopolitics:1,macro:1,rare_earth:1},
  compressed_sha256:"a".repeat(64),
  archive_object_key:"geomacro-evidence/v1/private/derived-news-journal/2026/10/22/"+"a".repeat(64)+".json.gz"
 },testNow);
 assert.equal(good.status,"B2_PUT_FULL_GET_RESTORED_SHA_VERIFIED");
 assert.equal(good.storage_confirmed,true);
 assert.equal(good.derived_rows_archived,3);
 assert.equal(good.source_news_d1_website_delivery_not_modified,true);
 assert.equal(good.signed_hot_gri_verified,false);
 for(const receipt of [
  {status:"SKIPPED_SIX_HOUR_ARCHIVE_SLOT"},
  {status:"B2_SHARED_ACCOUNT_RECOVERY_HEADROOM_HELD"},
  {status:"BACKUP_FAILED_CLOSED"},
  {status:"B2_PUT_FULL_GET_RESTORED_SHA_VERIFIED",b2_put_verified:true,
    b2_exact_readback_verified:false,source_d1_readback_verified:true}
 ]){
  const failed=summarizeSafeBackupReceipt(receipt,testNow);
  assert.equal(failed.storage_confirmed,false);
  assert.equal(failed.object_sha256,null);
  assert.equal(failed.derived_rows_archived,0);
  assert.equal(failed.paid_eligible,false);
 }
});
