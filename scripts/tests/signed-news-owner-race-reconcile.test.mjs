import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifySignedNewsWithOwnerReconciliation} from '../ops/verify-all-news-signed-publications.mjs';

const authorized={
 GEOMACRO_ALLOW_SIGNED_NEWS_RACE_RECONCILE:'1',
 RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64:'p'.repeat(64),
 GEOMACRO_COMMERCE_LEDGER_TOKEN:'q'.repeat(64),
 GITHUB_SHA:'a'.repeat(40),
 GITHUB_RUN_ID:'40670000000',
};
test('deployment reconciliation requires standing consent and keeps the private key step-scoped',()=>{
 const yaml=readFileSync(new URL('../../.github/workflows/deploy-d1-control-plane.yml',import.meta.url),'utf8');
 const start=yaml.indexOf('      - name: Verify retained signed inputs through GeoMacro-only scoped proof');
 const step=yaml.slice(start,yaml.indexOf('\n      - name:',start+1));
 assert.match(step,/GEOMACRO_STANDING_DELEGATION_ENABLED == 'YES_DELEGATED_DERIVED_ONLY'/);
 assert.match(step,/GEOMACRO_STANDING_DELEGATION_REVOKED != 'YES'/);
 assert.match(step,/RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64:/);
 assert.match(step,/run: bun scripts\/ops\/verify-all-news-signed-publications.mjs/);
 assert.doesNotMatch(step,/continue-on-error/);
 assert.equal((yaml.match(/RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64:/g)||[]).length,1);
 assert.ok(yaml.indexOf('bun install --frozen-lockfile --ignore-scripts')<start);
});
test('one legitimate missing issuer envelope is reconciled and reverified by independent verifier',async()=>{
 let reads=0,signs=0;
 const result=await verifySignedNewsWithOwnerReconciliation({
  env:authorized,verify:async()=>{
   reads++;
   if(reads===1)throw Error('SIGNED_NEWS_ITEM_NOT_SIGNED');
   return {verified:true};
  },reconcile:async()=>{signs++;return {new_signed_inputs:1}},
 });
 assert.equal(result.verified,true);
 assert.deepEqual([reads,signs],[2,1]);
});
test('already verified journal never issues another signature or extra read',async()=>{
 let reads=0,signs=0;
 const result=await verifySignedNewsWithOwnerReconciliation({
  env:authorized,verify:async()=>{reads++;return {verified:true}},
  reconcile:async()=>{signs++},
 });
 assert.equal(result.verified,true);assert.equal(reads,1);assert.equal(signs,0);
});
test('failed or corrupted signatures and unauthorised scope never trigger signing',async()=>{
 for(const code of ['SIGNED_NEWS_SIGNATURE_INVALID','SIGNED_NEWS_PROOF_BINDING',
  'SIGNED_NEWS_AUTHORITY_OR_CLOCK','SIGNED_NEWS_SOURCE_STATUS',
  'SIGNED_NEWS_JOURNAL_CHANGED_REPEATEDLY','SIGNED_NEWS_HTTP_UNAVAILABLE']){
  let signs=0;
  await assert.rejects(verifySignedNewsWithOwnerReconciliation({
   env:authorized,verify:async()=>{throw Error(code)},
   reconcile:async()=>{signs++}
  }),e=>e.message===code);
  assert.equal(signs,0);
 }
 for(const env of [
  {...authorized,GEOMACRO_ALLOW_SIGNED_NEWS_RACE_RECONCILE:'0'},
  {...authorized,RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64:''},
  {...authorized,GEOMACRO_COMMERCE_LEDGER_TOKEN:''},
  {...authorized,GITHUB_SHA:'invalid'},
  {...authorized,GITHUB_RUN_ID:'bogus'},
 ]){
  let signs=0;
  await assert.rejects(verifySignedNewsWithOwnerReconciliation({
   env,verify:async()=>{throw Error('SIGNED_NEWS_ITEM_NOT_SIGNED')},
   reconcile:async()=>{signs++},
  }),/SIGNED_NEWS_ITEM_NOT_SIGNED/);
  assert.equal(signs,0);
 }
});
test('second read failure and issuer reconciliation failure remain hard hold, never fake success',async()=>{
 let reads=0,signs=0;
 await assert.rejects(verifySignedNewsWithOwnerReconciliation({
  env:authorized,verify:async()=>{
   reads++;throw Error(reads===1?'SIGNED_NEWS_ITEM_NOT_SIGNED':'SIGNED_NEWS_PROOF_BINDING');
  },reconcile:async()=>{signs++},
 }),/SIGNED_NEWS_PROOF_BINDING/);
 assert.deepEqual([reads,signs],[2,1]);
 reads=0;
 await assert.rejects(verifySignedNewsWithOwnerReconciliation({
  env:authorized,verify:async()=>{reads++;throw Error('SIGNED_NEWS_ITEM_NOT_SIGNED')},
  reconcile:async()=>{throw Error('AUTOMATED_INPUT_REMOTE_HTTP_503_REMOTE_REJECTED')},
 }),/AUTOMATED_INPUT_REMOTE_HTTP_503_REMOTE_REJECTED/);
 assert.equal(reads,1);
});
