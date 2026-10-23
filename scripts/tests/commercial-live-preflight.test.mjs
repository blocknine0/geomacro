import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessLiveNoFundsReadiness} from '../lib/commercial-live-preflight.mjs';
const sha='a'.repeat(40);
const good={canonicalSha:sha,
 build:{status:200,body:{schema_version:'geomacro.deployment-build.v1',canonical_repository:'blocknine0/geomacro',canonical_main_sha:sha}},
 health:{status:200,body:{ok:true,production_data_runtime_configured:true,public_production:{b2_runtime_configured:true,
  current_hot_product_ready:{intelligence:true,global_risk:true,risk_indices:true},
  hot_snapshot_serving:{intelligence:{ok:true},global_risk:{ok:true},risk_indices:{ok:true}}}}},
 discovery:{status:200,body:{status:'prelaunch',productionFundsAuthorized:false,resources:[]}},
 availability:{status:200,body:{payment_required_now:false,execution_authorized:false,query_plan_hash:'f'.repeat(64),
  availability:{deliverable:true,code:'AVAILABLE'},exact_price:{asset:'USDC',amount_usdc:'0.05'}}}};
test('even positive live no-funds probe is not authorization for payment, rights or 195 countries',()=>{
 const r=assessLiveNoFundsReadiness(good);
 assert.equal(r.status,'READY_FOR_SEPARATE_OWNER_PAYMENT_ACCEPTANCE_NOT_LAUNCHED');
 assert.equal(r.performed_payment,false);assert.equal(r.real_funds_authorized,false);
 assert.equal(r.gates.all_195_countries_certified,false);
 assert.equal(r.gates.commercial_source_rights_verified_by_this_probe,false);
});
test('website SHA mismatch, deep 503, hot 0/3 and unavailable quotes fail closed',()=>{
 const r=assessLiveNoFundsReadiness({...good,
  build:{...good.build,body:{...good.build.body,canonical_main_sha:'b'.repeat(40)}},
  health:{status:503,body:{ok:false,production_data_runtime_configured:false,
   public_production:{b2_runtime_configured:false,
    hot_snapshot_serving:{intelligence:{ok:false},global_risk:{ok:false},risk_indices:{ok:false}},
    current_hot_product_ready:{intelligence:false,global_risk:false,risk_indices:false}}}},
  availability:{status:422,body:{payment_required_now:false,execution_authorized:false,
   availability:{deliverable:false,code:'STALE_REQUIRED_DATA'}}}
 });
 assert.equal(r.status,'BLOCKED_NO_REAL_FUNDS');
 assert.equal(r.gates.availability_no_payment_no_execution,true);
 assert.ok(r.blockers.includes('WEBSITE_PUBLISH_SHA_NOT_CURRENT'));
 assert.ok(r.blockers.includes('CURRENT_SIGNED_RISK_INDICES_NOT_VERIFIED'));
 assert.ok(r.blockers.includes('REPRESENTATIVE_PAID_PRODUCT_NOT_DELIVERABLE'));
});
test('unknown or malformed evidence and x402 implicit execution never succeed',()=>{
 assert.throws(()=>assessLiveNoFundsReadiness({canonicalSha:'foo'}),/SHA_REQUIRED/);
 for(const patch of [
  {discovery:{status:200,body:{status:'prelaunch',productionFundsAuthorized:true,resources:[]}}},
  {availability:{status:200,body:{...good.availability.body,payment_required_now:true}}},
  {health:{status:200,body:{ok:true,production_data_runtime_configured:true}}},
  {build:{status:0,body:null}}
 ]){
  const r=assessLiveNoFundsReadiness({...good,...patch});
  assert.equal(r.status,'BLOCKED_NO_REAL_FUNDS');
 }
});
test('a fabricated HTTP 200 with three hot flags cannot override deep-health ok:false',()=>{
 const r=assessLiveNoFundsReadiness({...good,
  health:{...good.health,body:{...good.health.body,ok:false}}
 });
 assert.equal(r.gates.deep_health_current_3_of_3,false);
 assert.equal(r.status,'BLOCKED_NO_REAL_FUNDS');
 assert.ok(r.blockers.includes('DEEP_HEALTH_REPORTED_NOT_OK'));
 assert.ok(r.blockers.includes('CURRENT_SIGNED_3_OF_3_NOT_VERIFIED'));
 assert.equal(r.performed_payment,false);
});
test('a fabricated HTTP 200 cannot mark B2-backed signed data ready',()=>{
 const r=assessLiveNoFundsReadiness({...good,
  health:{...good.health,body:{...good.health.body,
   public_production:{...good.health.body.public_production,b2_runtime_configured:false}}}
 });
 assert.equal(r.gates.deep_health_current_3_of_3,false);
 assert.equal(r.status,'BLOCKED_NO_REAL_FUNDS');
 assert.ok(r.blockers.includes('B2_BACKED_SIGNED_EDGE_NOT_VERIFIED'));
 assert.ok(r.blockers.includes('CURRENT_SIGNED_3_OF_3_NOT_VERIFIED'));
 assert.equal(r.real_funds_authorized,false);
});
test('exact-head no-funds summary must use separate shell lines',()=>{
 const source=readFileSync(new URL('../../.github/workflows/exact-head-commercial-launch-readiness.yml',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\\n[ \\t]+echo[ \\t]+/);
 assert.match(source,/echo "- Run Live Commercial Go-No-Go No Funds/);
});
