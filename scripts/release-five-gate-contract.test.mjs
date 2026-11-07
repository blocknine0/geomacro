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
 assert.match(workflow,/test -f config\/d1-hotspot-v2-canary\.hold/);
 assert.doesNotMatch(workflow,/continue-on-error: true/);
 assert.match(source,/const STAGES=\[0,1,10,100\]/);
 assert.match(source,/15\*60\*1000/);
 assert.match(source,/CANARY_ROLLBACK_BASELINE_100_VERIFIED/);
 assert.match(source,/CANARY_D1_140K_PROVIDER_BREACH/);
 assert.match(admission,/account_wide_provider_hard_cap:false/);
 assert.match(audit,/Promise\.all/);
});
