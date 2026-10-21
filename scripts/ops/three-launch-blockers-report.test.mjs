import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeLaunchAcceptance} from './three-launch-blockers-report.mjs';
test('unknown originals and testnet cannot certify commercial launch',()=>{
 const r=summarizeLaunchAcceptance({healthStatus:200,health:{ok:true},paymentStatus:{environment:'testnet',network:'eip155:84532'}});
 assert.equal(r.country_category_proof.current_verified_cells,0);
 assert.equal(r.signed_commercial_serving.state,'BLOCKED');
 assert.equal(r.original_to_website_latency.universal_20min_sla_verified,false);
 assert.equal(r.public_launch_acceptance_complete,false);
});
test('a real latency observation and hot products remain distinct from signed settlement',()=>{
 const r=summarizeLaunchAcceptance({healthStatus:200,health:{ok:true,public_production:{
  current_hot_product_ready:{intelligence:true,global_risk:true,risk_indices:true}}},
  paymentStatus:{environment:'production',network:'eip155:8453'},latency:{
   schema:'geomacro.website-observed-publication-latency.v1',actual_website_20min_sample_verified:true,
   samples:[{within_20_minutes:true,latency_upper_bound_seconds:1020}]}});
 assert.equal(r.original_to_website_latency.qualifying_20min_sample_observed,true);
 assert.equal(r.signed_commercial_serving.state,'HOT_SERVING_OBSERVED_PAYMENT_ACCEPTANCE_STILL_REQUIRED');
 assert.equal(r.signed_commercial_serving.paid_delivery_verified,false);
 assert.equal(r.signed_commercial_serving.three_chain_settlement_verified,false);
});
