import test from "node:test";
import {gunzipSync} from "node:zlib";
import assert from "node:assert/strict";
import {archiveDerivedJournalToB2,readExactCurrentDerivedJournal,
 buildDerivedJournalB2Plan,verifyDerivedJournalB2Restore}
 from "../lib/derived-news-b2-readwrite-backup.mjs";
import {runGovernedDerivedNewsBackup,summarizeSafeBackupReceipt}
 from "../ops/archive-live-derived-news-to-b2.mjs";
import {isSafeDerivedNewsReadbackSignal} from "../lib/derived-news-readback-policy.mjs";
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
const bundle=(signals,patch={})=>({
 ok:true,schema:"geomacro.website-derived-news-bundle.v1",
 delivery_scope:"free_website_only",retention_hours:72,
 original_release_delay_minutes:0,complete:true,item_cap:600,
 returned_rows:signals.length,checked_at:now.toISOString(),
 first_ingest:signals.map(s=>({id:s.id,first_seen_at:now.toISOString()})),
 signals,...patch
});
const fetchDoc=(doc=bundle(rows))=>async(url,init)=>{
 assert.equal(new URL(url).host,"geomacro-control-plane.daspallab202391.workers.dev");
 assert.equal(new URL(url).pathname,"/v1/public/website-derived-news-bundle");
 assert.equal(init.redirect,"error");assert.equal(init.method,"GET");
 assert.equal(init.headers["Cache-Control"],"no-cache");
 assert.equal(init.headers.Pragma,"no-cache");
 return Response.json(doc);
};
const b2=()=>({
 count:0,readCount:0,stored:null,
 async putWithMetadataVerification(key,compressed,{verifyRestored}){
  assert.match(key,/^geomacro-evidence\/v1\/private\/derived-news-journal\/2026\/10\/22\/[0-9a-f]{64}\.json\.gz$/u);
  assert.ok(compressed.length>40);
  assert.equal(await verifyRestored(compressed),true);
  this.stored=Buffer.from(compressed);
  this.count++;return {full_body_readback_verified:true,
   sha256:(await import("node:crypto")).createHash("sha256").update(compressed).digest("hex"),
   bytes:compressed.length};
 },
 async get(key){
  assert.match(key,/^geomacro-evidence\/v1\/private\/derived-news-journal\//u);
  this.readCount++;
  return Buffer.from(this.stored);
 }
});
test("actual three-domain D1 stories are B2 PUT+GET restored exact, no paid signing",async()=>{
 const archive=b2(),result=await archiveDerivedJournalToB2({
  fetchImpl:fetchDoc(),b2:archive,now});
 assert.equal(result.status,"B2_PUT_FULL_GET_RESTORED_SHA_VERIFIED");
 assert.equal(result.archived_rows,3);
 assert.deepEqual(result.category_counts,{geopolitics:1,macro:1,rare_earth:1});
 assert.equal(archive.count,1);
 assert.equal(archive.readCount,1);
 assert.equal(result.b2_exact_readback_verified,true);
 assert.equal(result.independent_second_get_verified,true);
 assert.equal(result.second_get_sha256,result.compressed_sha256);
 assert.equal(result.source_d1_readback_verified,true);
 assert.equal(result.same_news_as_intelligence_d1,true);
 assert.equal(result.independent_gri_signed,false);
 assert.equal(result.paid_eligible,false);
 assert.equal(result.payments,0);
});
test("safe domain-only OSINT attribution passes the same Worker, D1 readback and B2 backup contract",async()=>{
 const osint={...sample("macro","4567abcd"),
   title:"Geomacro finds official economic statistics source-feed observation",
   what_changed:"A monitored source feed contains a dated item about official economic statistics. The event actor, precise action and impact have not been independently verified.",
   why_it_matters:"This observation can guide follow-up checks, but it does not establish a macroeconomic value, market move or verified consequence.",
   topic:"official economic statistics",geography:null,
   development_type:"unverified OSINT feed observation",
   sources_credited:["Monitored feed: www.bankofcanada.ca"],
   status:"osint_feed_observed_unverified"};
 assert.equal(isSafeDerivedNewsReadbackSignal(osint),true);
 const fromD1=await readExactCurrentDerivedJournal({fetchImpl:fetchDoc(bundle([...rows,osint])),now});
 assert.equal(fromD1.length,4);
 assert.deepEqual(buildDerivedJournalB2Plan(fromD1,now).category_counts,
   {geopolitics:1,macro:2,rare_earth:1});
 const archive=b2();
 const receipt=await archiveDerivedJournalToB2({fetchImpl:fetchDoc(bundle([...rows,osint])),b2:archive,now});
 assert.equal(receipt.status,"B2_PUT_FULL_GET_RESTORED_SHA_VERIFIED");
 assert.equal(receipt.archived_rows,4);
 assert.deepEqual(receipt.category_counts,{geopolitics:1,macro:2,rare_earth:1});
 assert.equal(receipt.source_d1_readback_verified,true);
 assert.equal(receipt.rights_verified,false);
 assert.equal(receipt.paid_eligible,false);
 assert.equal(receipt.payments,0);
});

test("URL/path/HTML in OSINT attribution still fails closed at the archive boundary",async()=>{
 for(const credit of [
  "Monitored feed: https://www.bankofcanada.ca",
  "Monitored feed: www.bankofcanada.ca/rss.xml",
  "Monitored feed: news.un.org (aggregator; original publisher not verified)",
 ]) {
  const osint={...sample("macro","4567abcd"),
    title:"Geomacro finds official economic statistics source-feed observation",
    what_changed:"A monitored source feed contains a dated item about official economic statistics. The event actor, precise action and impact have not been independently verified.",
    why_it_matters:"This observation can guide follow-up checks, but it does not establish a macroeconomic value, market move or verified consequence.",
    topic:"official economic statistics",geography:null,
    development_type:"unverified OSINT feed observation",
    sources_credited:[credit],status:"osint_feed_observed_unverified"};
  await assert.rejects(()=>archiveDerivedJournalToB2({
    fetchImpl:fetchDoc(bundle([...rows,osint])),b2:b2(),now
  }),/DERIVED_NEWS_B2_/u);
 }
});

test("archive only at four UTC time windows, without extra original provider reads",async()=>{
 const archive=b2();
 const receipt=await archiveDerivedJournalToB2({
  fetchImpl:async()=>{throw Error("READ_UNEXPECTED");},b2:archive,
  now:new Date("2026-10-22T13:07:00Z")});
 assert.equal(receipt.status,"SKIPPED_SIX_HOUR_ARCHIVE_SLOT");
 assert.equal(archive.count,0);
});
test("one uncached canonical D1 bundle replaces non-atomic page scans and holds at 601",async()=>{
 const sixHundred=Array.from({length:600},(_,i)=>
  sample(["geopolitics","macro","rare_earth"][i%3],(i+1000).toString(16).padStart(8,"0")));
 let calls=0;
 const rowsRead=await readExactCurrentDerivedJournal({
  now,fetchImpl:async(url,init)=>{calls++;return fetchDoc(bundle(sixHundred))(url,init);}
 });
 assert.equal(calls,1);
 assert.equal(rowsRead.length,600);
 assert.deepEqual(buildDerivedJournalB2Plan(rowsRead,now).record_count,600);
 const overflow=Response.json({ok:false,error:"DERIVED_NEWS_BUNDLE_HARD_CAP_EXCEEDED",actual_rows_at_least:601},{status:503});
 await assert.rejects(readExactCurrentDerivedJournal({
  now,fetchImpl:async()=>overflow
 }),/DERIVED_NEWS_B2_D1_CANONICAL_BUNDLE_UNAVAILABLE/);
});
test("empty D1 journal never manufactures news nor creates a private blob",async()=>{
 const archive=b2(),receipt=await archiveDerivedJournalToB2({
  fetchImpl:fetchDoc(bundle([])),b2:archive,now});
 assert.equal(receipt.status,"SKIPPED_NO_QUALIFYING_D1_NEWS");
 assert.equal(archive.count,0);
});
test("invalid canonical bundle, missing completeness, stale or unsafe items fail closed",async()=>{
 for(const doc of [
  bundle(rows,{item_cap:601}),bundle(rows,{complete:false}),
  bundle(rows,{returned_rows:4}),bundle(rows,{checked_at:"2026-10-20T04:00:00.000Z"}),
  bundle([{...rows[0],published_at:"2026-10-18T04:00:00.000Z"}]),
  bundle([{...rows[0],source_url:"https://private.example.org"}]),
  bundle([{...rows[0],what_changed:"See https://private.example.org/article"}]),
  bundle([{...rows[0],status:"official_release_observed_unscored",severity:55}])
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
  independent_second_get_verified:true,
  second_get_sha256:"a".repeat(64),
  source_d1_readback_verified:true,
  archived_rows:3,category_counts:{geopolitics:1,macro:1,rare_earth:1},
  compressed_sha256:"a".repeat(64),
  archive_object_key:"geomacro-evidence/v1/private/derived-news-journal/2026/10/22/"+"a".repeat(64)+".json.gz"
 },testNow);
 assert.equal(good.status,"B2_PUT_FULL_GET_RESTORED_SHA_VERIFIED");
 assert.equal(good.storage_confirmed,true);
 assert.equal(good.independent_second_b2_get_sha_verified,true);
 assert.equal(good.derived_rows_archived,3);
 assert.equal(good.source_news_d1_website_delivery_not_modified,true);
 assert.equal(good.signed_hot_gri_verified,false);
 for(const receipt of [
  {status:"SKIPPED_SIX_HOUR_ARCHIVE_SLOT"},
  {status:"B2_SHARED_ACCOUNT_RECOVERY_HEADROOM_HELD"},
  {status:"BACKUP_FAILED_CLOSED"},
  {status:"B2_PUT_FULL_GET_RESTORED_SHA_VERIFIED",b2_put_verified:true,
    b2_exact_readback_verified:false,independent_second_get_verified:true,
    source_d1_readback_verified:true},
  {status:"B2_PUT_FULL_GET_RESTORED_SHA_VERIFIED",b2_put_verified:true,
    b2_exact_readback_verified:true,independent_second_get_verified:false,
    source_d1_readback_verified:true}
 ]){
  const failed=summarizeSafeBackupReceipt(receipt,testNow);
  assert.equal(failed.storage_confirmed,false);
  assert.equal(failed.object_sha256,null);
  assert.equal(failed.derived_rows_archived,0);
  assert.equal(failed.paid_eligible,false);
 }
});

test("second independent B2 GET must be byte-identical, SHA-matched and restored",async()=>{
 const first=b2();
 first.get=async()=>Buffer.from("corrupted second fetch");
 await assert.rejects(()=>archiveDerivedJournalToB2({
  fetchImpl:fetchDoc(),b2:first,now
 }),/DERIVED_NEWS_B2_B2_EXACT_COMPRESSED_READBACK_INVALID/);
 const missing=b2();delete missing.get;
 await assert.rejects(()=>archiveDerivedJournalToB2({
  fetchImpl:fetchDoc(),b2:missing,now
 }),/DERIVED_NEWS_B2_SECOND_INDEPENDENT_GET_REQUIRED/);
});
