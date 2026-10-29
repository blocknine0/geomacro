import test from "node:test";
import assert from "node:assert/strict";
import {verifyMaterializedAnonymousRead} from "../ops/verify-public-d1-materialization-live.mjs";
const env={GEOMACRO_COMMERCE_LEDGER_TOKEN:"a".repeat(64)};
function page(receipt,ids=["macro-abc01234"],owner=false){
 return Response.json({ok:true,schema:"geomacro.website-derived-news-feed.v1",
  page_offset:500,page_size:250,chargeable:false,has_more:false,
  signals:ids.map(id=>({id}))},{
   headers:{...(receipt?{"X-GeoMacro-Public-Offload":receipt}:{}),
    ...(owner?{"X-GeoMacro-Origin-Readback":"d1-canonical",
      "Cache-Control":"no-store"}:{})}
 });
}
test("anonymous D1 materialization and no-cache parity with canonical origin",async()=>{
 const calls=[];
 const result=await verifyMaterializedAnonymousRead({env,fetchImpl:async(url,opts)=>{
  calls.push({url,opts});
  return url.includes("/v1/internal/website-derived-news-origin")?
    page(null,["macro-abc01234"],true):page("d1-materialized");
 }});
 assert.equal(result.public_materialized_offload_verified,true);
 assert.equal(result.same_canonical_page_ids_verified,true);
 assert.equal(result.public_gets,1);
 assert.equal(result.protected_origin_gets,1);
 assert.equal(result.protected_direct_d1_origin_route_verified,true);
 assert.equal(calls.length,2);
 assert.match(calls[1].url,/\/v1\/internal\/website-derived-news-origin\?offset=500$/u);
 assert.match(calls[1].opts.headers.Authorization,/^Bearer [a-f0-9]{64}$/u);
 assert.equal(calls[1].opts.headers["Cache-Control"],"no-cache");
 assert.equal(calls[1].opts.cache,"no-store");
 assert.equal(calls[0].opts.headers["Cache-Control"],"no-cache");
 assert.equal(calls[0].opts.cache,"no-store",
  "parity probe must not compare a cached older page with current canonical D1");
});
test("missing offload receipt never passes CI and never needs origin read",async()=>{
 let calls=0;
 await assert.rejects(verifyMaterializedAnonymousRead({env,fetchImpl:async()=>{
  calls++;return page(null);}}),/OFFLOAD_NOT_OBSERVED/);
 assert.equal(calls,1);
});
test("different IDs and false canonical no-cache offload are hard failures",async()=>{
 for(const [origin,expected] of [[page(null,["macro-def56789"],true),/IDS_DIFFER/],
  [page("d1-materialized",["macro-abc01234"],true),/ORIGIN_BYPASS_INVALID/],
  [page(null,["macro-abc01234"]),/ORIGIN_BYPASS_INVALID/]]){
  let calls=0;
  await assert.rejects(verifyMaterializedAnonymousRead({env,fetchImpl:async()=>{
   calls++;return calls===1?page("d1-materialized"):origin;
  }}),expected);
  assert.equal(calls,2);
 }
});
test("provider error body never escapes the fail-closed proof",async()=>{
 await assert.rejects(verifyMaterializedAnonymousRead({env,fetchImpl:async()=>Response.json({
  confidential:"SHOULD_NOT_OUTPUT"
 },{status:503})}),e=>{
  assert.equal(e.message,"MATERIALIZED_ANONYMOUS_HTTP_UNAVAILABLE");
  assert.ok(!e.message.includes("SHOULD_NOT_OUTPUT"));
  return true;
 });
});

test("owner credentials are necessary before any canonical origin request",async()=>{
 let calls=0;
 await assert.rejects(verifyMaterializedAnonymousRead({
  env:{GEOMACRO_COMMERCE_LEDGER_TOKEN:""},
  fetchImpl:async()=>{calls++;return page("d1-materialized")}
 }),/MATERIALIZED_OWNER_READBACK_TOKEN_MISSING/);
 assert.equal(calls,1,"must never call protected origin without owner token");
});
