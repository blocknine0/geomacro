import test from "node:test";
import assert from "node:assert/strict";
import {
 FIVE_USD_SPEND_GUARD_SCHEMA,assessFiveUsdSpendPolicies,readFiveUsdSpendGuard,
} from "../lib/cloudflare-five-usd-spend-guard.mjs";

import {CONFIRM,planSpendBlockCreation,provisionFiveUsdSpendBlocks}
 from "../ops/provision-cloudflare-five-usd-spend-blocks.mjs";
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

test("spend block provisioning requires explicit owner confirmation and never upgrades a plan",async()=>{
 const env={CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
  CLOUDFLARE_BILLING_WRITE_TOKEN:"b".repeat(32)};
 let calls=0;
 const fetchImpl=async()=>{calls++;throw Error("UNEXPECTED_PROVIDER_CALL")};
 assert.equal((await provisionFiveUsdSpendBlocks({env,fetchImpl})).status,
  "NO_PROVIDER_CHANGE_DRY_RUN");
 assert.equal(calls,0);
 assert.equal((await provisionFiveUsdSpendBlocks({env,fetchImpl,apply:true})).status,
  "NO_PROVIDER_CHANGE_DRY_RUN");
 assert.equal(calls,0);
 assert.equal(planSpendBlockCreation([]).length,2);
 assert.throws(()=>planSpendBlockCreation([
  {product_id:"workers",enabled:true,action:"usage_block",threshold_cents:100},
 ]),/CONFLICTING_ENABLED_POLICY/);
});
test("provisioning sends exactly 2 product-specific 1-cent POSTs, then GET readback",async()=>{
 const account="a".repeat(32),env={
  CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_BILLING_WRITE_TOKEN:"b".repeat(32),
  GEOMACRO_CLOUDFLARE_COST_GUARD_CONFIRM:CONFIRM,
 };
 const stored=[],methods=[];
 const result=await provisionFiveUsdSpendBlocks({env,apply:true,fetchImpl:async(url,init)=>{
  assert.equal(url,"https://api.cloudflare.com/client/v4/accounts/"+account+
   "/billing/spend-policies");
  methods.push(init.method);
  if(init.method==="GET")
   return {status:200,json:async()=>({success:true,result:[...stored]})};
  assert.equal(init.method,"POST");
  const body=JSON.parse(init.body);
  assert.equal(body.action,"usage_block");
  assert.equal(body.threshold_cents,1);
  assert.equal(body.enabled,true);
  stored.push({...body,id:"created-"+body.product_id,version:1,
   current_state:{status:"below_limit"}});
  return {status:201,json:async()=>({success:true,result:stored.at(-1)})};
 }});
 assert.deepEqual(methods,["GET","POST","POST","GET"]);
 assert.equal(result.created,2);
 assert.equal(result.invoice_5_usd_guaranteed,false);
 assert.equal(result.plan_changed,false);
});
