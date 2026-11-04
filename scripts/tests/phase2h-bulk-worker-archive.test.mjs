import test from "node:test";
import assert from "node:assert/strict";
import {buildPhase2hPrivateRawRecords} from "../lib/phase2h-raw-original-records.mjs";
import {phase2hPrivateRawArchiveExportV2,validPrivateRawNews}
 from "../../workers/control-plane/src/phase2h-private-raw-news.mjs";
import {createPhase2hCanonicalD1} from "../ops/phase2h-archive-private-raw-news.mjs";

const now=new Date("2026-11-04T07:00:00.000Z");
const item=buildPhase2hPrivateRawRecords([{
 category:"geopolitics",sourceId:"official_archive_test",
 title:"UN announces a new diplomatic ceasefire discussion",
 publishedAt:"2026-11-04T06:00:00.000Z",
 articleUrl:"https://example.org/un/ceasefire",
 description:"A dated official release records a diplomatic discussion and named topic.",
 credit:null
}],{now,derive:items=>items.map(x=>({
 category:x.category,published_at:x.publishedAt,
 topic:"ceasefire diplomatic agenda",
 what_changed:"A diplomatic discussion on a ceasefire took place in a published official statement.",
 why_it_matters:"The published diplomatic discussion may change monitoring priorities; outcome unverified."
}))}).records[0];
const badId="f".repeat(64);
const wrong={record_id:badId,raw_sha256:"e".repeat(64),
 first_ingested_at:now.toISOString(),raw_json:'{"invalid":true}'};
const good={record_id:item.record_id,raw_sha256:item.raw_sha256,
 first_ingested_at:item.ingested_at,raw_json:JSON.stringify(item)};
const ROOT="test-root-for-bulk-worker-archive-0000000000000000";

test("one indexed D1 scan returns valid source and quarantines corrupt row without stopping cursor",async()=>{
 assert.equal(await validPrivateRawNews(item,now.getTime(),false),JSON.stringify(item));
 const observed=[];
 const env={DB:{prepare(sql){
  observed.push(sql);
  return {bind(...args){
   observed.push(args);
   return {all:async()=>({success:true,results:[good,wrong]})};
  }};
 }}};
 const response=await phase2hPrivateRawArchiveExportV2(env,
  new URLSearchParams({limit:"2"}),now.getTime());
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.ok,true);assert.equal(body.scanned_count,2);
 assert.equal(body.rows.length,1);
 assert.equal(body.rejected_unverified_or_expired_count,1);
 assert.equal(body.next_cursor_id,badId);
 assert.equal(body.next_cursor_clock,now.toISOString());
 assert.equal(body.scan_complete,false);
 assert.equal(body.provider_d1_single_select,true);
 assert.equal(body.paid_eligible,false);
 assert.match(observed[0],/INDEXED BY idx_phase2h_unarchived/u);
 assert.equal(observed.filter(x=>typeof x==="string").length,1);
});
test("invalid archive cursor cannot reach D1",async()=>{
 let reads=0;
 const env={DB:{prepare(){reads++;throw Error("NO_D1_QUERY")}}};
 for(const params of [
  new URLSearchParams({limit:"26"}),
  new URLSearchParams({limit:"1",archive_cursor_clock:"bad",archive_cursor_id:badId}),
  new URLSearchParams({limit:"1",archive_cursor_clock:now.toISOString()})
 ]){
  const r=await phase2hPrivateRawArchiveExportV2(env,params,now.getTime());
  assert.equal(r.status,400);
 }
 assert.equal(reads,0);
});
test("production archive V2 uses only root-admin Worker one-D1-SELECT batches and one atomic ACK",async()=>{
 const operations=[];
 const env={
  CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
  CLOUDFLARE_API_TOKEN:"token".repeat(8),
  D1_DATABASE_ID:"00000000-0000-4000-8000-000000000001",
  GEOMACRO_COMMERCE_LEDGER_TOKEN:ROOT,
  PHASE2H_BULK_WORKER_ARCHIVE_V2:"1"
 };
 const fetchImpl=async(url,init)=>{
  const u=new URL(url);
  assert.equal(u.origin,"https://geomacro-control-plane.daspallab202391.workers.dev");
  operations.push({path:u.pathname,method:init.method??"GET",limit:u.searchParams.get("limit")});
  assert.match(init.headers.Authorization,/^Bearer [a-f0-9]{64}$/u);
  if(init.method==="PUT"){
   const input=JSON.parse(init.body);
   assert.equal(input.items.length,1);
   assert.equal(input.items[0].raw_sha256,item.raw_sha256);
   return Response.json({ok:true,archived:1,
    independent_d1_archive_ack_verified:true,
    d1_atomic_one_statement_returning_verified:true,
    rights_verified:false,payments:0});
  }
  return Response.json({
   ok:true,schema:"geomacro.phase2h.private-raw-archive-export-v2.v1",
   rows:[item],scanned_count:2,rejected_unverified_or_expired_count:1,
   next_cursor_clock:now.toISOString(),next_cursor_id:badId,
   scan_complete:true,source_native_clocks_unchanged:true,
   provider_d1_single_select:true,paid_eligible:false,
   rights_verified:false,raw_public_delivery:false,payments:0
  });
 };
 const d1=createPhase2hCanonicalD1({env,fetchImpl});
 const rows=await d1.readPending(now);
 assert.equal(rows.length,1);
 assert.equal(rows[0].record_id,item.record_id);
 const ack=await d1.markArchived(rows,"d".repeat(64),now);
 assert.equal(ack.archived,1);
 assert.equal(ack.d1_atomic_one_statement_returning_verified,true);
 assert.equal(ack.d1_write_statements,1);
 assert.deepEqual(operations.map(x=>x.method),["GET","PUT"]);
 assert.equal(operations[0].path,"/v1/internal/phase2h-raw-archive-export-v2");
 assert.equal(operations[0].limit,"25");
 assert.equal(operations[1].path,"/v1/internal/phase2h-raw-news");
});
