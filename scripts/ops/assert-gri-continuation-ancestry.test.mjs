import test from "node:test";
import assert from "node:assert/strict";
import {verifyTrustedGriContinuation} from "./assert-gri-continuation-ancestry.mjs";
const sha="a".repeat(40),prior="b".repeat(40);
test("accepts trusted publisher ancestor despite newer main and does not attest signed GRI",()=>{
 const result=verifyTrustedGriContinuation({eventName:"workflow_run",eventSha:sha,
  checkoutSha:sha,parentSha:prior,isAncestor:true});
 assert.equal(result.allowed,true);
 assert.equal(result.signed_gri_parent_verified,false);
 assert.equal(result.parent_workflow_success_verified,false);
 assert.equal(result.b2_requests+result.d1_writes+result.payments,0);
});
test("allows owner dispatch on exact current checkout while keeping D1 verification separate",()=>{
 const result=verifyTrustedGriContinuation({eventName:"workflow_dispatch",eventSha:sha,
  checkoutSha:sha});
 assert.equal(result.origin,"OWNER_DISPATCH_CURRENT_MAIN");
 assert.equal(result.signed_gri_parent_verified,false);
});
test("rejects unrelated, deleted, malformed, unknown, or mismatched main",()=>{
 for(const change of [
  {eventName:"push",parentSha:prior,isAncestor:true},
  {eventName:"workflow_run",parentSha:prior,isAncestor:false},
  {eventName:"workflow_run",parentSha:"main",isAncestor:true},
  {eventName:"workflow_run",parentSha:undefined,isAncestor:true},
  {eventName:"workflow_run",parentSha:prior,isAncestor:undefined},
  {eventName:"workflow_dispatch",checkoutSha:prior},
  {eventName:"workflow_run",checkoutSha:prior,parentSha:prior,isAncestor:true},
 ])assert.throws(()=>verifyTrustedGriContinuation({eventName:"workflow_run",
    eventSha:sha,checkoutSha:sha,...change}));
});
