import test from "node:test";
import assert from "node:assert/strict";
import {checkExistingGroqReadiness} from "./verify-existing-groq-free-readiness.mjs";
const key="never-print-this-existing-project-key";
const base={GROQ_API_KEY:key,GROQ_BROWSER_SEARCH_ENABLED:"1",
 GROQ_BROWSER_SEARCH_FREE_QUOTA_ACK:"YES_BROWSER_FREE_TIER_CONFIRMED"};
const okFetch=async(url,options)=>{
 assert.equal(url,"https://api.groq.com/openai/v1/models");
 assert.equal(options.method,"GET");
 assert.equal(options.redirect,"error");
 assert.equal(options.headers.Authorization,"Bearer "+key);
 return {status:200,headers:{get:()=>null},
 text:async()=>JSON.stringify({data:[{id:"openai/gpt-oss-20b"}]})};
};
test("existing Groq key can read model metadata with zero inference/browser calls",async()=>{
 const result=await checkExistingGroqReadiness({env:base,fetchImpl:okFetch});
 assert.equal(result.configuration_ready_to_try_on_owner_verified_free_plan,true);
 assert.equal(result.free_account_tier_verified,false);
 assert.equal(result.browser_search_entitlement_verified,false);
 assert.equal(result.inference_requests,0);
 assert.equal(result.browser_search_requests,0);
 assert.equal(result.real_payments,0);
 assert.equal(result.new_key_provisioned,false);
 assert.equal(JSON.stringify(result).includes(key),false);
});
test("no installed key makes zero provider calls and cannot claim active",async()=>{
 let calls=0;
 const receipt=await checkExistingGroqReadiness({env:{},fetchImpl:async()=>{calls++;throw Error("network") }});
 assert.equal(calls,0);
 assert.equal(receipt.configuration_ready_to_try_on_owner_verified_free_plan,false);
 assert.equal(receipt.existing_key_configured,"NOT_CONFIGURED");
});
test("feature flags are separately required; Groq key alone never enables paid browser search",async()=>{
 for(const e of [
  {...base,GROQ_BROWSER_SEARCH_ENABLED:""},
  {...base,GROQ_BROWSER_SEARCH_FREE_QUOTA_ACK:""},
  {...base,GROQ_BROWSER_SEARCH_FREE_QUOTA_ACK:"YES"}
 ]){
  const x=await checkExistingGroqReadiness({env:e,fetchImpl:okFetch});
  assert.equal(x.configuration_ready_to_try_on_owner_verified_free_plan,false);
  assert.equal(x.browser_search_actual_completion_verified,false);
 }
});
test("invalid credentials, missing model and rate limits return fixed states without leaking content",async()=>{
 const inputs=[
  [{status:401},"EXISTING_KEY_AUTH_REJECTED"],
  [{status:429},"METADATA_RATE_LIMITED"],
  [{status:200,headers:{get:()=>null},text:async()=>JSON.stringify({data:[{id:"other"}]})},"MODEL_NOT_IN_EXISTING_KEY_METADATA"],
  [{status:200,headers:{get:()=>null},text:async()=>"<private>"},"MODEL_METADATA_UNAVAILABLE"]
 ];
 for(const [response,state] of inputs){
  const x=await checkExistingGroqReadiness({env:base,fetchImpl:async()=>response});
  assert.equal(x.supported_model_access_state,state);
  assert.equal(x.configuration_ready_to_try_on_owner_verified_free_plan,false);
  assert.equal(x.service_permission_to_bill,false);
 }
});
