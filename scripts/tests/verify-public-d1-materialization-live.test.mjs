import test from "node:test";
import assert from "node:assert/strict";
import {verifyMaterializedAnonymousRead} from "../ops/verify-public-d1-materialization-live.mjs";
function page(receipt,ids=["macro-abc01234"]){
 return Response.json({ok:true,schema:"geomacro.website-derived-news-feed.v1",
  page_offset:500,page_size:250,chargeable:false,has_more:false,
  signals:ids.map(id=>({id}))},{
   headers:receipt?{"X-GeoMacro-Public-Offload":receipt}:{}
 });
}
test("actual anonymous materialization and mandatory no-cache canonical parity",async()=>{
 const calls=[];
 const result=await verifyMaterializedAnonymousRead({fetchImpl:async(_url,opts)=>{
  calls.push(opts);
  return page(opts.headers["Cache-Control"]?null:"d1-materialized");
 }});
 assert.equal(result.public_materialized_offload_verified,true);
 assert.equal(result.same_canonical_page_ids_verified,true);
 assert.equal(result.public_gets,2);
 assert.equal(calls.length,2);
 assert.equal(calls[1].headers["Cache-Control"],"no-cache");
 assert.equal(calls[0].headers["Cache-Control"],undefined);
});
test("missing offload receipt never passes CI and never needs origin read",async()=>{
 let calls=0;
 await assert.rejects(verifyMaterializedAnonymousRead({fetchImpl:async()=>{
  calls++;return page(null);}}),/OFFLOAD_NOT_OBSERVED/);
 assert.equal(calls,1);
});
test("different IDs and false canonical no-cache offload are hard failures",async()=>{
 for(const [origin,expected] of [[page(null,["macro-def56789"]),/IDS_DIFFER/],
  [page("d1-materialized"),/ORIGIN_BYPASS_INVALID/]]){
  let calls=0;
  await assert.rejects(verifyMaterializedAnonymousRead({fetchImpl:async()=>{
   calls++;return calls===1?page("d1-materialized"):origin;
  }}),expected);
  assert.equal(calls,2);
 }
});
test("provider error body never escapes the fail-closed proof",async()=>{
 await assert.rejects(verifyMaterializedAnonymousRead({fetchImpl:async()=>Response.json({
  confidential:"SHOULD_NOT_OUTPUT"
 },{status:503})}),e=>{
  assert.equal(e.message,"MATERIALIZED_ANONYMOUS_HTTP_UNAVAILABLE");
  assert.ok(!e.message.includes("SHOULD_NOT_OUTPUT"));
  return true;
 });
});
