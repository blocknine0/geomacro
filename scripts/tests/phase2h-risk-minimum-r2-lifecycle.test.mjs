import test from "node:test";
import assert from "node:assert/strict";
import {assertPermanentRiskColdR2Lifecycle,verifyPermanentRiskColdR2Lifecycle}
 from "../lib/phase2h-risk-minimum-r2-lifecycle.mjs";
const bucket={
 CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
 GEOMACRO_D1_RECOVERY_R2_BUCKET:"geomacro-d1-recovery-private",
 CLOUDFLARE_API_TOKEN:"token-".repeat(6)
};
const safe={success:true,result:{rules:[
 {id:"short-lived-other",enabled:true,conditions:{
  prefix:"geomacro/private-osint-held/v1/"},
  deleteObjectsTransition:{condition:{type:"Age",maxAge:86400}}},
 {id:"storage-unrelated",enabled:true,conditions:{
  prefix:"geomacro/d1/recovery/v1/"}}
]}};
test("exact provider lifecycle preserves the cold derived Risk Gate prefix permanently",()=>{
 const proof=assertPermanentRiskColdR2Lifecycle(safe);
 assert.equal(proof.status,"PROVIDER_NO_COLD_PREFIX_AUTO_DELETE_RULES");
 assert.equal(proof.no_matching_auto_deletion,true);
 assert.equal(proof.account_wide_r2_cost_headroom_verified,false);
 assert.equal(proof.b2_requests,0);
 assert.equal(proof.payments_authorized,false);
});
test("parent/bucket-wide, exact-prefix and nested cold delete rules HOLD, regardless age",()=>{
 for(const prefix of ["","geomacro/","geomacro/private/",
  "geomacro/private/phase2h-risk-minimum-br11/v2/",
  "geomacro/private/phase2h-risk-minimum-br11/v2/2026/11/"]){
  const actual={success:true,result:{rules:[{enabled:true,
   conditions:{prefix},
   deleteObjectsTransition:{condition:{type:"Age",maxAge:86400}}}
  ]}};
  assert.throws(()=>assertPermanentRiskColdR2Lifecycle(actual),
   /PHASE2H_RISK_COLD_LIFECYCLE_COLD_PREFIX_EXPIRY_OR_PAID_CLASS_CONFLICT/u,prefix);
 }
 for(const prefix of [undefined,null,42]){
  const actual={success:true,result:{rules:[{enabled:true,
   conditions:{prefix},deleteObjectsTransition:{condition:{type:"Age",maxAge:86400}}}
  ]}};
  assert.throws(()=>assertPermanentRiskColdR2Lifecycle(actual),
   /PHASE2H_RISK_COLD_LIFECYCLE_BUCKET_WIDE_OR_UNSCOPED_RULE_UNVERIFIED/u);
 }
});
test("non-deletion transitions into fee-bearing R2 class also HOLD",()=>{
 const actual={success:true,result:{rules:[{
  enabled:true,conditions:{prefix:"geomacro/private/phase2h-risk-minimum-br11/v2/"},
  storageClassTransition:{class:"Infrequent Access"}
 }]}};
 assert.throws(()=>assertPermanentRiskColdR2Lifecycle(actual),
  /PHASE2H_RISK_COLD_LIFECYCLE_COLD_PREFIX_EXPIRY_OR_PAID_CLASS_CONFLICT/u);
});
test("unknown/corrupt provider lifecycle never counts as missing rules",()=>{
 for(const doc of [null,{success:false,result:{rules:[]}},
  {success:true,result:{}},{success:true,result:{rules:null}},
  {success:true,result:{rules:[null]}}]){
  assert.throws(()=>assertPermanentRiskColdR2Lifecycle(doc),
   /PHASE2H_RISK_COLD_LIFECYCLE_/u);
 }
});
test("real read-only provider request gets lifecycle from the pinned private bucket",async()=>{
 const calls=[];
 const fetchImpl=async(url,init)=>{
  calls.push({url,init});
  return {status:200,redirected:false,json:async()=>safe};
 };
 const receipt=await verifyPermanentRiskColdR2Lifecycle({env:bucket,fetchImpl});
 assert.equal(receipt.no_matching_auto_deletion,true);
 assert.equal(calls.length,1);
 assert.match(calls[0].url,/\/r2\/buckets\/geomacro-d1-recovery-private\/lifecycle$/u);
 assert.equal(calls[0].init.method,"GET");
 assert.doesNotMatch(calls[0].url,/delete|put|b2/iu);
});
