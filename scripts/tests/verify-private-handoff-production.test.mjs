import test from "node:test";
import assert from "node:assert/strict";
import {verifyPrivateHandoffDeployment} from "../ops/verify-private-handoff-production.mjs";
const env={ROOT_LEDGER_TOKEN:"r".repeat(40),
 CONTROL_PLANE_URL:"https://geomacro-control-plane.daspallab202391.workers.dev"};
const index={ok:true,schema:"geomacro.automated-intelligence-input-feed.v1",
 handoffs:[{input_id:"a".repeat(64),signal_id:"geopolitics-1234abcd"}]};
const handoff={ok:true,schema:"geomacro.private-source-handoff-feed.v1",
 items:[],offset:0,next_offset:null};
function transport({indexStatus=200,readerStatus=200,boundaryStatus=401,
 indexDoc=index,handoffDoc=handoff}={}){
 const seen=[];
 const fetchImpl=async(url,options)=>{
  seen.push({path:new URL(url).pathname+new URL(url).search,
    method:options.method,hasBody:Object.hasOwn(options,"body"),
    authorization:options.headers.Authorization??null});
  const path=new URL(url).pathname;
  if(path==="/v1/intelligence-inputs/automated"&&
     options.headers.Authorization!==seen[0].authorization)
     return Response.json({ok:false}, {status:boundaryStatus});
  if(path==="/v1/intelligence-inputs/automated")
     return Response.json(indexDoc,{status:indexStatus});
  if(path==="/v1/internal/source-handoffs"&&options.method==="GET"&&
    seen.length===2)return Response.json(handoffDoc,{status:readerStatus});
  return Response.json({ok:false,error:"UNAUTHORIZED"},{status:boundaryStatus});
 };
 return {fetchImpl,seen};
}
test("real route contract succeeds with bounded reads and privilege denials, no writes",async()=>{
 const {fetchImpl,seen}=transport();
 const result=await verifyPrivateHandoffDeployment({env,fetchImpl});
 assert.equal(result.bounded_private_handoff_readable,true);
 assert.equal(result.signed_inputs_retained,1);
 assert.equal(result.article_specific_rights_verified,false);
 assert.equal(result.current_signed_hot_products_verified,false);
 assert.equal(result.b2_requests,0);
 assert.equal(result.d1_writes,0);
 assert.equal(result.payments,0);
 assert.equal(seen.length,6);
 assert.equal(seen[0].path,"/v1/intelligence-inputs/automated?view=handoff-ids");
 assert.equal(seen[1].path,"/v1/internal/source-handoffs?offset=0");
 assert.equal(seen[3].method,"PUT");
 assert.ok(seen.every(x=>!x.hasBody));
 assert.notEqual(seen[0].authorization,seen[1].authorization);
 assert.equal(seen[5].authorization,null);
});
test("unavailable signed-input index fails closed with safe status only",async()=>{
 const {fetchImpl}=transport({indexStatus:503});
 await assert.rejects(verifyPrivateHandoffDeployment({env,fetchImpl}),
  /PRIVATE_HANDOFF_ACCEPTANCE_SIGNED_INPUT_INDEX_HTTP_503/u);
});
test("deployed index schema drift cannot pass even with HTTP 200",async()=>{
 const {fetchImpl}=transport({indexDoc:{ok:true,handoffs:[]}});
 await assert.rejects(verifyPrivateHandoffDeployment({env,fetchImpl}),
  /PRIVATE_HANDOFF_ACCEPTANCE_SIGNED_INPUT_INDEX_CONTRACT/u);
});
test("LOW handoff page contract fails closed without D1 or B2 mutation",async()=>{
 const {fetchImpl}=transport({readerStatus:400});
 await assert.rejects(verifyPrivateHandoffDeployment({env,fetchImpl}),
  /PRIVATE_HANDOFF_ACCEPTANCE_LOW_READER_HTTP_400/u);
});
test("incorrect authorization boundary cannot pass",async()=>{
 const {fetchImpl}=transport({boundaryStatus:200});
 await assert.rejects(verifyPrivateHandoffDeployment({env,fetchImpl}),
  /PRIVATE_HANDOFF_ACCEPTANCE_ADMIN_CANNOT_READ_HTTP_200/u);
});
test("absent production credential fails before any network call",async()=>{
 await assert.rejects(verifyPrivateHandoffDeployment({
  env:{...env,ROOT_LEDGER_TOKEN:""},
  fetchImpl:()=>{throw Error("SHOULD_NOT_USE_NETWORK")},
 }),/PRIVATE_HANDOFF_ACCEPTANCE_PROTECTED_ROOT_ABSENT/u);
});
test("untrusted deployment origin is rejected before any request",async()=>{
 await assert.rejects(verifyPrivateHandoffDeployment({
  env:{...env,CONTROL_PLANE_URL:"http://example.invalid"},
  fetchImpl:()=>{throw Error("SHOULD_NOT_USE_NETWORK")},
 }),/PRIVATE_HANDOFF_ACCEPTANCE_ORIGIN_INVALID/u);
});
