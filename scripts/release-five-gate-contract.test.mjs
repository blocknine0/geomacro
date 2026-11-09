import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonical,signEnvelope,verifySignedEnvelopeFile,HOT50,CATEGORIES} from './release-common.ts';

// Cryptographic primitive contract tests: generated disposable test keys only;
// no provider responses, news events, or production-ready receipts are forged.
for(const algorithm of ['ed25519','ec']){
 test(`integrity primitive signs and detects altered bytes (${algorithm})`,()=>{
  const pair=algorithm==='ec'?generateKeyPairSync('ec',{namedCurve:'prime256v1'}):generateKeyPairSync('ed25519');
  const old=process.env.SIGNING_JWK;
  const dir=mkdtempSync(join(tmpdir(),'geomacro-signature-contract-'));
  const file=join(dir,'test-only.json');
  try{
   process.env.SIGNING_JWK=JSON.stringify(pair.privateKey.export({format:'jwk'}));
   const payload={status:'PASS',category:'CRYPTO_PRIMITIVE_TEST_ONLY',day:'2026-11-07',num:0};
   const envelope=signEnvelope(payload);
   assert.equal(envelope.attestation.alg,algorithm==='ec'?'ES256':'Ed25519');
   writeFileSync(file,canonical(envelope));
   assert.deepEqual(verifySignedEnvelopeFile(file),payload);
   envelope.payload.num=1;
   writeFileSync(file,canonical(envelope));
   assert.throws(()=>verifySignedEnvelopeFile(file),/RELEASE_SIGNED_RECEIPT_UNVERIFIED|RELEASE_RECEIPT_SIGNATURE_BAD/);
  }finally{
   if(old===undefined)delete process.env.SIGNING_JWK;else process.env.SIGNING_JWK=old;
   rmSync(dir,{recursive:true,force:true});
  }
 });
}
test('exact country/category count and canonical sorting are immutable',()=>{
 assert.equal(HOT50.length,50);
 assert.equal(new Set(HOT50).size,50);
 assert.equal(CATEGORIES.length,3);
 assert.equal(canonical({z:1,a:2}),'{"a":2,"z":1}');
 assert.throws(()=>canonical({number:Infinity}),/RELEASE_CANONICAL_NONFINITE/);
});
test('user-required controls and no-funds release architecture remain explicit',()=>{
 const workflow=readFileSync('.github/workflows/canary-promotion.yml','utf8');
 const source=readFileSync('scripts/canary-promoter.ts','utf8');
 const admission=readFileSync('src/middleware/quotaCircuitBreaker.ts','utf8');
 const audit=readFileSync('scripts/release-remediate.ts','utf8');
 assert.match(workflow,/environment: production/);
 assert.match(workflow,/cancel-in-progress: false/);
 assert.match(workflow,/MIGRATE_D1_0204_0211_NO_FUNDS/);
 assert.match(workflow,/npm run release:quota/);
 assert.match(workflow,/test -f config\/d1-hotspot-v2-canary\.hold/);
 assert.doesNotMatch(workflow,/continue-on-error: true/);
 assert.match(source,/const STAGES=\[0,1,5,25,50,100\]/);
 assert.match(source,/15\*60\*1000/);
 assert.match(source,/CANARY_ROLLBACK_BASELINE_100_VERIFIED/);
 assert.match(source,/CANARY_D1_PAID_MONTHLY_PACED_BURN_SPIKE/);
 assert.match(admission,/account_wide_provider_hard_cap:false/);
 assert.match(audit,/Promise\.all/);
});

test('canary schema acceptance relies on physical Paid monthly provider readback',()=>{
 const read=readFileSync('scripts/apply-d1-migrations.ts','utf8');
 const promoter=readFileSync('scripts/canary-promoter.ts','utf8');
 assert.match(read,/checkD1PaidMonthlyHeadroom/u);
 assert.match(read,/verifyCanaryPaidMonthQuota\(quota,new Date\(\)\)/u);
 assert.match(read,/RELEASE_PAID_MONTHLY_PROVIDER_SCHEMA_HEADROOM_HOLD/u);
 const verifyStart=read.indexOf('const quota=await checkD1PaidMonthlyHeadroom');
 const oldMutationStart=read.indexOf('const legacy=await checkD1BundledWork');
 assert(verifyStart>0&&oldMutationStart>verifyStart);
 assert(read.slice(verifyStart,oldMutationStart).includes('if(apply)'));
 for(const field of ['paid_monthly_subscription_verified','paid_monthly_billing_cycle_verified',
  'paid_monthly_cycle_start_utc','paid_monthly_cycle_end_exclusive_utc',
  'old_daily_140k_policy_applied','provider_account_wide_d1_usage_observed']){
  assert(read.includes(field),field+' missing from signed producer');
  assert(promoter.includes('report.'+field),field+' missing from consumer');
 }
 assert.match(promoter,/report\.schema==='geomacro\.d1-0204-0211\.schema-acceptance\.v1'/u);
 assert.match(promoter,/verifySignedEnvelopeFile\(file\)/u);
 assert.match(promoter,/CANARY_D1_SCHEMA_PROOF_NOT_ACCEPTED/u);
});
