import test from "node:test";
import assert from "node:assert/strict";
import {verifyPredgeOwnerPartnerSignedParity}
 from "../ops/verify-predge-owner-partner-signed-parity.mjs";
const NOW=Date.parse("2026-11-05T18:20:00Z");
const ownerToken="a".repeat(64),researchToken="b".repeat(64);
function envelope(){
 return {ok:true,schema:"geomacro.predge-pilot-check.v1",
  generated_at:"2026-11-05T18:07:00.276Z",
  expires_at:"2026-11-05T21:07:00.276Z",
  execution_authorized:false,chargeable:false,
  integrity:{payload_hash:"f".repeat(64)},
  risk_gate:{decision:"PAUSE",news_context:{
   delivered_counts:{geopolitics:2,macro:1,rare_earth:1},
   items_by_category:{geopolitics:[{},{}],macro:[{}],rare_earth:[{}]},
  }},
 };
}
function fixture({owner=envelope(),partner=owner,partnerStatus=200,ownerStatus=200}={}){
 const calls=[];
 const fetchImpl=async(url,init)=>{
  calls.push({url,method:init.method,authorization:init.headers.authorization});
  return new Response(JSON.stringify(url.endsWith("/v1/pilot/check")?partner:owner),{
   status:url.endsWith("/v1/pilot/check")?partnerStatus:ownerStatus,
   headers:{"content-type":"application/json"},
  });
 };
 return {calls,fetchImpl};
}
const args={base:"https://geomacro-control-plane.example.test",
 ownerToken,researchToken,now:NOW};
test("real partner 200 must equal independent owner sample and remain noncommercial",async()=>{
 const f=fixture();
 const x=await verifyPredgeOwnerPartnerSignedParity({...args,
  fetchImpl:f.fetchImpl,verify:async()=>true});
 assert.equal(x.ok,true);
 assert.equal(x.same_signed_envelope,true);
 assert.equal(x.partner_http_status,200);
 assert.equal(x.item_count,4);
 assert.equal(x.partner_check_slots_consumed,1);
 assert.equal(x.execution_authorized,false);
 assert.equal(x.chargeable,false);
 assert.equal(x.paired_external_predge_read_completed,false);
 assert.equal(x.full_envelope_logged,false);
 assert.equal(f.calls.length,2);
 assert.ok(f.calls[0].url.endsWith("/v1/internal/predge-pilot-news-context-publish"));
 assert.ok(f.calls[1].url.endsWith("/v1/pilot/check"));
 assert.deepEqual(f.calls.map(y=>y.method),["GET","GET"]);
 assert.deepEqual(f.calls.map(y=>y.authorization),
  ["Bearer "+ownerToken,"Bearer "+researchToken]);
});
test("owner/partner stale divergent readback must never be called delivery-ready",async()=>{
 const old={...envelope(),generated_at:"2026-11-05T12:00:00Z",
  expires_at:"2026-11-05T15:00:00Z",integrity:{payload_hash:"c".repeat(64)}};
 const f=fixture({partner:old});
 await assert.rejects(()=>verifyPredgeOwnerPartnerSignedParity({...args,
  fetchImpl:f.fetchImpl,
  verify:async(obj)=>{if(Date.parse(obj.expires_at)<=NOW)
   throw Error("PREDGE_PILOT_ENVELOPE_EXPIRED");}}),
  /PREDGE_SIGNED_PAIR_PARTNER_ENVELOPE_EXPIRED/);
 const mismatch=fixture({partner:{...envelope(),
  integrity:{payload_hash:"d".repeat(64)}}});
 await assert.rejects(()=>verifyPredgeOwnerPartnerSignedParity({...args,
  fetchImpl:mismatch.fetchImpl,verify:async()=>true}),
  /PREDGE_SIGNED_PAIR_OWNER_PARTNER_HASH_OR_CLOCK_MISMATCH/);
});
test("503, invalid signature, missing credentials and invalid proof fail closed",async()=>{
 await assert.rejects(()=>verifyPredgeOwnerPartnerSignedParity({...args,
  researchToken:ownerToken,fetchImpl:async()=>{throw Error("SHOULD_NOT_CONNECT")}}),
  /CREDENTIALS_REQUIRED/);
 const fail=fixture({partnerStatus:503});
 await assert.rejects(()=>verifyPredgeOwnerPartnerSignedParity({...args,
  fetchImpl:fail.fetchImpl,verify:async()=>true}),/PREDGE_SIGNED_PAIR_HTTP_503/);
 const badSig=fixture();
 await assert.rejects(()=>verifyPredgeOwnerPartnerSignedParity({...args,
  fetchImpl:badSig.fetchImpl,verify:async()=>{throw Error("INVALID_SIGNATURE")}}),
  /OWNER_SIGNED_ENVELOPE_UNVERIFIED/);
 const badBoundary=fixture({partner:{...envelope(),chargeable:true}});
 await assert.rejects(()=>verifyPredgeOwnerPartnerSignedParity({...args,
  fetchImpl:badBoundary.fetchImpl,verify:async()=>true}),/UNSAFE_ADVISORY_BOUNDARY/);
});
test("bad news count and unknown category cannot qualify",async()=>{
 const bad=fixture({partner:{...envelope(),risk_gate:{
  decision:"PAUSE",news_context:{delivered_counts:{geopolitics:2,macro:51,rare_earth:1},
   items_by_category:{geopolitics:[{},{}],macro:[],rare_earth:[{}]}}}}});
 await assert.rejects(()=>verifyPredgeOwnerPartnerSignedParity({...args,
  fetchImpl:bad.fetchImpl,verify:async()=>true}),
  /NEWS_CONTEXT_DELIVERY_COUNTS_INVALID/);
});
