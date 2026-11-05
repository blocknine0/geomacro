import test from "node:test";
import assert from "node:assert/strict";
import {
 FIVE_USD_SPEND_GUARD_SCHEMA,assessFiveUsdSpendPolicies,readFiveUsdSpendGuard,
} from "../lib/cloudflare-five-usd-spend-guard.mjs";

const now=new Date("2026-11-05T15:00:00.000Z");
const policy=(product_id)=>({
 id:"policy-"+product_id,product_id,action:"usage_block",
 enabled:true,threshold_cents:1,version:1,
 current_state:{status:"below_limit",balance_cents:0,
  billing_period_start:"2026-11-01T00:00:00Z",
  billing_period_end:"2026-12-01T00:00:00Z"},
});
const policies={success:true,errors:[],result:[
 policy("workers"),policy("durable_objects"),
]};
test("only active provider-side 1-cent usage blocks unlock Paid admission",()=>{
 const proof=assessFiveUsdSpendPolicies(policies,now);
 assert.equal(proof.schema,FIVE_USD_SPEND_GUARD_SCHEMA);
 assert.equal(proof.verified,true);
 assert.equal(proof.d1_spend_hard_capped,false);
 assert.equal(proof.account_wide_zero_overage_guaranteed,false);
 assert.deepEqual(proof.products,["workers","durable_objects"]);
});
test("missing, alert-only, disabled, too-high, used-up, or unknown policies HOLD",()=>{
 const bad=[
  {...policies,result:[policy("workers")]},
  {...policies,result:[{...policy("workers"),action:"notification"},policy("durable_objects")]},
  {...policies,result:[{...policy("workers"),enabled:false},policy("durable_objects")]},
  {...policies,result:[{...policy("workers"),threshold_cents:100},policy("durable_objects")]},
  {...policies,result:[{...policy("workers"),current_state:{status:"limit_reached"}},policy("durable_objects")]},
  {...policies,result:[{...policy("workers"),current_state:undefined},policy("durable_objects")]},
  {...policies,result:[policy("workers"),policy("workers"),policy("durable_objects")]},
  {...policies,result_info:{total_count:300}},
  {...policies,success:false},
 ];
 for(const row of bad)assert.throws(()=>assessFiveUsdSpendPolicies(row,now),/CLOUDFLARE_FIVE_USD/);
});
test("real guard is read-only, fails closed without a restricted Billing Read token",async()=>{
 const env={CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
  CLOUDFLARE_BILLING_READ_TOKEN:"b".repeat(32)};
 const requests=[];
 const proof=await readFiveUsdSpendGuard({env,now,fetchImpl:async(url,init)=>{
  requests.push({url,method:init.method,redirect:init.redirect});
  return {status:200,json:async()=>policies};
 }});
 assert.equal(proof.verified,true);
 assert.deepEqual(requests,[{
  url:"https://api.cloudflare.com/client/v4/accounts/"+
    env.CLOUDFLARE_ACCOUNT_ID+"/billing/spend-policies",
  method:"GET",redirect:"error",
 }]);
 await assert.rejects(()=>readFiveUsdSpendGuard({
  env:{...env,CLOUDFLARE_BILLING_READ_TOKEN:""},
  fetchImpl:async()=>{throw Error("MUST_NOT_CALL_PROVIDER");},
 }),/PERMISSION_REQUIRED/);
 await assert.rejects(()=>readFiveUsdSpendGuard({
  env,fetchImpl:async()=>({status:403}),
 }),/READ_REJECTED/);
});
