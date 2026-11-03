import {test} from "node:test";
import assert from "node:assert/strict";
import {createPhase2hCanonicalD1} from "../ops/phase2h-archive-private-raw-news.mjs";
import {deriveControlPlaneRootToken} from "../ops/derive-control-plane-root-token.mjs";
const now=new Date("2026-11-03T14:30:00.000Z");
const root="production-private-test-root-".repeat(3);
const env={CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
 D1_DATABASE_ID:"00000000-0000-4000-8000-000000000001",
 CLOUDFLARE_API_TOKEN:"token".repeat(8),
 GEOMACRO_COMMERCE_LEDGER_TOKEN:root};
const original=Array.from({length:13},(_,i)=>({
 schema:"geomacro.phase2h.private-raw-observation.v1",
 record_id:i.toString(16).padStart(64,"0"),raw_sha256:"f".repeat(64),
 ingested_at:now.toISOString(),category:"macro",
 commercial_rights_verified:false,commercial_delivery_authorized:false,
}));
const denial=(status,code)=>new Response(JSON.stringify({
 success:false,result:[],errors:[{code}]}),{
 status,headers:{"Content-Type":"application/json"},
});
test("Cloudflare REST 400/7500 delegates to the same admin-bound D1 keyset",async()=>{
 const api=[],workerReads=[],workerAcks=[];
 const fetchImpl=async(url,init)=>{
  const u=new URL(url);
  if(u.hostname==="api.cloudflare.com"){
   api.push(JSON.parse(init.body).sql);
   return denial(400,7500);
  }
  assert.equal(u.origin,"https://geomacro-control-plane.daspallab202391.workers.dev");
  assert.equal(init.headers.Authorization,
   "Bearer "+deriveControlPlaneRootToken(root));
  assert.equal(u.pathname,"/v1/internal/phase2h-raw-news");
  if(init.method==="PUT"){
   const body=JSON.parse(init.body);
   assert.equal(body.schema,"geomacro.phase2h.b2-archive-ack.v1");
   assert.equal(body.items.length,13);
   workerAcks.push(body);
   return Response.json({ok:true,archived:body.items.length,
    independent_d1_archive_ack_verified:true,rights_verified:false,payments:0});
  }
  const limit=Number(u.searchParams.get("limit"));
  assert.ok(limit<=25);
  const cursor=u.searchParams.get("archive_cursor_id");
  const cursorClock=u.searchParams.get("archive_cursor_clock");
  if(cursor!==null)assert.equal(cursorClock,now.toISOString());
  const start=cursor===null?0:original.findIndex(r=>r.record_id>cursor);
  workerReads.push({limit,cursor});
  const page=start<0?[]:original.slice(start,start+limit);
  return Response.json({ok:true,schema:"geomacro.phase2h.private-pending-archive.v1",
   rows:page,complete:page.length<limit,paid_eligible:false,raw_public_delivery:false});
 };
 const d1=createPhase2hCanonicalD1({env,fetchImpl});
 const rows=await d1.readPending(now);
 assert.equal(rows.length,13);
 assert.equal(new Set(rows.map(x=>x.record_id)).size,13);
 assert.equal(api.length,3);
 assert.deepEqual(workerReads.map(x=>x.cursor),[null]);
 const ack=await d1.markArchived(rows,"e".repeat(64),now);
 assert.equal(ack.archived,13);
 assert.equal(ack.independent_d1_archive_ack_verified,true);
 assert.equal(workerAcks.length,1);
});
test("403 access denial or 7500 impostor never enables fallback",async()=>{
 for(const [status,code] of [[403,7500],[400,7100]]){
  let workerCalls=0;
  const fetchImpl=async(url)=>{
   if(!new URL(url).hostname==="api.cloudflare.com")workerCalls++;
   return denial(status,code);
  };
  await assert.rejects(
   createPhase2hCanonicalD1({env,fetchImpl}).readPending(now),
   /CANONICAL_D1_PROVIDER_REQUEST_FAILED/u);
  assert.equal(workerCalls,0);
 }
});
test("bad admin response never produces B2 or D1 proof",async()=>{
 let workerCalls=0;
 const fetchImpl=async(url)=>{
  if(new URL(url).hostname==="api.cloudflare.com")return denial(400,7500);
  workerCalls++;
  return Response.json({ok:true,rows:original.slice(0,5),
   schema:"geomacro.phase2h.private-pending-archive.v1",
   paid_eligible:true,raw_public_delivery:false});
 };
 await assert.rejects(
  createPhase2hCanonicalD1({env,fetchImpl}).readPending(now),
  /PHASE2H_RAW_B2_INTERNAL_FALLBACK_READBACK_UNVERIFIED/u);
 assert.equal(workerCalls,1);
});
