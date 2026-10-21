import test from "node:test";
import assert from "node:assert/strict";
import {assessPredgeContinuity} from "./verify-predge-pilot-continuity.mjs";
const NOW=Date.parse("2026-10-21T00:00:00.000Z");
const item={id:"geomacro-research-1",domain:"geopolitics"};
const feed={ok:true,items:[item],counts:{geopolitics:1,macro:0,rare_earth:0}};
const research={...feed,partner_delivery_schema:"geomacro.predge.research-news-delivery.v1",
 authentication:"DEDICATED_BEARER_ONLY",
 execution_authorized:false,partner_resale_or_commercial_redistribution_authorized:false,
 chargeable:false,daily_utc_request_hard_cap:500,
 distributed_rate_governor:"ATOMIC_CLOUDFLARE_D1_FAIL_CLOSED",
 maximum_pilot_scope_expires_at:"2027-01-17T00:00:00.000Z"};
const gate={authority:"cloudflare-d1",scope:"predge-risk-gate-country-v1",
 execution_authorized:false,paid_launch_approved:false,status:"not_ready"};
test("research stays available while paid Risk Gate has no GRO",()=>{
 const p=assessPredgeContinuity(research,feed,gate,NOW);
 assert.equal(p.authenticated_research_verified,true);
 assert.equal(p.signed_risk_gate_ready,false);
 assert.equal(p.execution_authorized,false);
 assert.equal(p.days_until_pilot_end>30,true);
});
test("refuse private-public divergence and accidental commercial resale",()=>{
 assert.throws(()=>assessPredgeContinuity({...research,items:[{id:"different"}]},feed,gate,NOW),/RESEARCH_CONTRACT_OR_PARITY/);
 assert.throws(()=>assessPredgeContinuity({...research,partner_resale_or_commercial_redistribution_authorized:true},feed,gate,NOW),/RESEARCH_CONTRACT_OR_PARITY/);
 assert.throws(()=>assessPredgeContinuity(research,feed,{...gate,paid_launch_approved:true},NOW),/RISK_GATE_BOUNDARY/);
});
test("pilot end and 30-day renewal warning protect partner continuity",()=>{
 assert.throws(()=>assessPredgeContinuity(research,feed,gate,Date.parse("2027-01-17T00:00:00Z")) ,/PILOT_EXPIRED/);
 const p=assessPredgeContinuity(research,feed,gate,Date.parse("2027-01-01T00:00:00Z"));
 assert.equal(p.renewal_action_required,true);
 assert.equal(p.days_until_pilot_end,16);
});
