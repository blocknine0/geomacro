import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessLiveCanaryBaseline} from '../canary-promoter.ts';

const main='a'.repeat(40),previous='b'.repeat(40);
const baseline='11111111-2222-4333-8444-555555555555';
const current={versions:[{version_id:baseline,percentage:100}]};
const healthy={ok:true,deployed_source_sha:previous};
test('existing immutable 100% baseline can be older than not-yet-promoted main',()=>{
 const r=assessLiveCanaryBaseline(current,healthy,200,main);
 assert.equal(r.status,'PASS');
 assert.equal(r.scope,'LIVE_EXISTING_BASELINE_100_NO_FUNDS');
 assert.equal(r.candidate_not_yet_promoted,true);
 assert.equal(r.baseline_source_sha,previous);
 assert.equal(r.candidate_exact_main_sha,main);
 assert.equal(r.deployment_mutated,false);
 assert.equal(r.remote_hold_unchanged,true);
 assert.equal(r.no_funds,true);
});
test('already-exact-main baseline is also legitimate for read-only verification',()=>{
 const r=assessLiveCanaryBaseline(current,{...healthy,deployed_source_sha:main},200,main);
 assert.equal(r.status,'PASS');
 assert.equal(r.candidate_not_yet_promoted,false);
});
test('unknown health, split, version, SHA or HTTP status always HOLD',()=>{
 const variants=[
  [current,healthy,503,main],
  [current,{ok:false,deployed_source_sha:previous},200,main],
  [current,{ok:true,deployed_source_sha:'not-a-sha'},200,main],
  [{versions:[{version_id:baseline,percentage:90}]},healthy,200,main],
  [{versions:[{version_id:baseline,percentage:100},{version_id:baseline,percentage:0}]},healthy,200,main],
  [{versions:[{version_id:'unknown',percentage:100}]},healthy,200,main],
  [current,healthy,200,'bad-main']
 ];
 for(const args of variants)
  assert.throws(()=>assessLiveCanaryBaseline(...args),/CANARY_[A-Z0-9_]+/u);
});
test('0-100% safety still checks candidate exact SHA and retains rollback',()=>{
 const source=readFileSync('scripts/canary-promoter.ts','utf8');
 const workflow=readFileSync('.github/workflows/canary-promotion.yml','utf8');
 assert.match(source,/CANARY_DIRECTED_HEALTH_SHA_UNVERIFIED/u);
 assert.match(source,/b\?\.deployed_source_sha===expectedSha/u);
 assert.match(source,/CANARY_ROLLBACK_BASELINE_100_VERIFIED/u);
 assert.match(source,/const STAGES=\[0,1,5,25,50,100\]/u);
 assert.match(source,/config\/d1-hotspot-v2-canary\.hold/u);
 assert.match(workflow,/timeout-minutes: 180/u);
 assert.match(workflow,/CANARY_STAGE2_REAL_RUN_ID_REQUIRED/u);
});
