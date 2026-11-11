import {test} from "node:test";
import assert from "node:assert/strict";
import {B2_DAILY_LIMITS} from "../../workers/control-plane/src/b2-account-quota.mjs";
import {planAdaptiveB2Pacing,reserveAdaptiveB2StreamQuota,B2_STREAM_PACING}
 from "../../workers/control-plane/src/risk-stream-b2-governor.mjs";
const now=Date.parse("2026-11-11T12:00:00.000Z");
const day="2026-11-11";
const live=(used={total:0,GET:0,PUT:0,HEAD:0,NATIVE_AUTH:0},limits=B2_DAILY_LIMITS)=>({
 ok:true,schema:"geomacro.b2-account-quota-status.v1",day_utc:day,
 limits,used
});
test("200+ source deliveries can pace in micro-batches without increasing account quota",()=>{
 const plan=planAdaptiveB2Pacing({live:live(),kind:"PUT",now});
 assert.equal(plan.action,"TRY_ATOMIC_TOKEN_RESERVATION");
 assert.equal(plan.capacity_milli,40000);
 assert.equal(plan.no_provider_quota_increase,true);
 assert.equal(B2_STREAM_PACING.auto_raise_provider_quota,false);
 assert(plan.refill_milli_per_second>0);
});
test("governor never silently accepts stale date, inflated provider cap or noninteger usage",()=>{
 for(const item of [
  {...live(),day_utc:"2026-11-10"},
  live(undefined,{...B2_DAILY_LIMITS,GET:B2_DAILY_LIMITS.GET+1}),
  live({...live().used,PUT:0.5}),
  {...live(),limits:null},
 ]){
  assert.throws(()=>planAdaptiveB2Pacing({live:item,kind:"GET",now}),
   /RISK_STREAM_B2_(LIVE_QUOTA_TELEMETRY_UNAVAILABLE|LIVE_GOVERNOR_POLICY_DRIFT)/);
 }
});
test("exhausted approved B2 quota defers to private R2 without a reservation",()=>{
 const q=live({total:B2_DAILY_LIMITS.total,GET:0,PUT:0,HEAD:0,NATIVE_AUTH:0});
 const plan=planAdaptiveB2Pacing({live:q,kind:"GET",now});
 assert.equal(plan.action,"DEFER_OR_R2");
});
test("stream token reservation always chains through existing global atomic D1 account governor",async()=>{
 const statements=[];let global=0;
 const db={prepare(sql){return {bind(...args){statements.push({sql,args});return this},
  async first(){return {tokens_milli:39000}}}}};
 const reservation=await reserveAdaptiveB2StreamQuota({DB:db},{
  kind:"PUT",workflowId:"stream_private_archive",now,
  read:async()=>live(),
  reserve:async(_,input)=>{
   global++;assert.deepEqual(input,{kind:"PUT",workflow_id:"stream_private_archive"});
   return {ok:true,reserved:true,code:"ATOMIC_D1_TICKET"};
  }
 });
 assert.equal(reservation.ok,true);
 assert.equal(reservation.status,"RESERVED");
 assert.equal(global,1);
 assert.equal(statements.length,1);
 assert.match(statements[0].sql,/ON CONFLICT\(day_utc,kind\) DO UPDATE/);
 assert.match(statements[0].sql,/RETURNING tokens_milli/);
});
test("missing global account ticket cannot be converted into a successful B2 call",async()=>{
 let attempts=0;
 const db={prepare(){return {bind(){return this},
  async first(){return {tokens_milli:39000}}}}};
 const result=await reserveAdaptiveB2StreamQuota({DB:db},{
  kind:"GET",workflowId:"stream_private_archive",now,
  read:async()=>live(),reserve:async()=>{
   attempts++;return {ok:false,reserved:false};
  }
 });
 assert.equal(attempts,1);
 assert.equal(result.ok,false);
 assert.equal(result.status,"DEFER_R2");
});
