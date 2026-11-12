import test from "node:test";
import assert from "node:assert/strict";
import receiver from "../../workers/risk-stream-shadow-ack/src/index.mjs";

const endpoint="https://geomacro-risk-stream-shadow-ack.example-team.workers.dev/v1/internal/mock-commercial-ack";
const token="a".repeat(64),id="1".repeat(64),hash="2".repeat(64);
const license="GEOMACRO_COMMERCIAL_REDISTRIBUTION_v1";
const headers={
 "Content-Type":"application/json",
 "X-GeoMacro-Shadow-ACK":token,
 "X-GeoMacro-Delivery-ID":id,
 "Idempotency-Key":id,
 "X-GeoMacro-License-ID":license
};
const body={payload:{license_id:license,charged:false,execution_authorized:false},
 license_proof:{payload_sha256:hash}};
function request({url=endpoint,method="POST",hdr=headers,data=body}={}){
 return new Request(url,{method,headers:hdr,body:JSON.stringify(data)});
}
const serve=(req,bound=token)=>receiver.fetch(req,{STREAM_SHADOW_ACK_TOKEN:bound});

test("authenticated ACK handler accepts the same exact envelope and headers used in staging",async()=>{
 for(const bound of [token,token+"\n",token+"\r\n"]){
  const res=await serve(request(),bound);
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{
   schema:"geomacro.commercial-webhook-ack.v1",
   job_id:id,payload_sha256:hash,status:"ACCEPTED"
  });
 }
});
test("ACK does not accept missing/wrong bearer, delivery identity, license or wrong payload",async()=>{
 for(const [change,status] of [
  [{hdr:{...headers,"X-GeoMacro-Shadow-ACK":"b".repeat(64)}},401],
  [{hdr:{...headers,"X-GeoMacro-Shadow-ACK":token+"\n"}},401],
  [{hdr:{...headers,"Idempotency-Key":"f".repeat(64)}},400],
  [{hdr:{...headers,"X-GeoMacro-Delivery-ID":"abc"}},400],
  [{hdr:{...headers,"X-GeoMacro-License-ID":"WRONG_LICENSE"}},400],
  [{data:{...body,payload:{...body.payload,charged:true}}},400],
  [{data:{...body,payload:{...body.payload,execution_authorized:true}}},400],
  [{data:{...body,license_proof:{payload_sha256:"bad"}}},400],
  [{url:"https://geomacro-risk-stream-shadow-ack.example-team.workers.dev/wrong"},404],
 ]){
  const res=await serve(request(change));
  assert.equal(res.status,status,JSON.stringify(change));
  const data=await res.json();
  assert.equal(data.ok,false);
 }
});
test("missing receiver secret is always a 401 and never an accidental ACK",async()=>{
 const res=await serve(request(),"");
 assert.equal(res.status,401);
 assert.deepEqual(await res.json(),{ok:false,error:"UNAUTHORIZED"});
});
test("oversized POST is refused, independent of correct credentials",async()=>{
 const oversized={...body,extra:"x".repeat(24100)};
 const res=await serve(request({data:oversized}));
 assert.equal(res.status,413);
});
