import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {ORIGINAL_VERIFICATION_WINDOW_MS as WINDOW,ORIGINAL_VERIFICATION_WINDOW_HOURS,ORIGINAL_VERIFICATION_EXPIRED} from '../../src/lib/original-verification-policy.ts';
import {verifyGeomacroUnclaimedOriginalPage} from '../lib/geomacro-original-page-readback.mjs';
import {lowSourceReviewBytes,verifyLowSourceReview} from '../../src/lib/low-authority-source-review.ts';
const now=Date.parse('2026-10-22T12:00:00.000Z');
const low=generateKeyPairSync('ed25519'),issuer=generateKeyPairSync('ed25519');
const pub=low.publicKey.export({format:'der',type:'spki'});
const trust={public_spki_b64:pub.toString('base64'),public_sha256:createHash('sha256').update(pub).digest('hex'),
 issuer_public_keys_b64:[issuer.publicKey.export({format:'der',type:'spki'}).toString('base64')]};
function envelope(category,age){
 const source=new Date(now-age).toISOString();
 const review={schema:'geomacro.internal-low-source-review.v1',authority:'GEOMACRO_INTERNAL_AUTOMATED_LOW_V1',
  scope:'ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME',input_id:'a'.repeat(64),category,source_published_at:source,
  reviewed_at:new Date(now).toISOString(),expires_at:new Date(now-age+72*3600000).toISOString(),
  verdict:'SOURCE_EVIDENCE_VERIFIED',reason:'ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED',evidence_sha256:'b'.repeat(64),
  semantic_claims_verified:false,commercial_authorization:false,external_reviewer_attested:false};
 return {review,signature:sign(null,lowSourceReviewBytes(review),low.privateKey).toString('base64')};
}
test('all three categories accept real signed original reviews up to exactly 22h and reject 22h plus 1ms',async()=>{
 assert.equal(ORIGINAL_VERIFICATION_WINDOW_HOURS,22);
 for(const category of ['geopolitics','macro','rare_earth']){
  for(const age of [7*3600000,21*3600000,WINDOW])
   await verifyLowSourceReview(envelope(category,age),trust,now);
  for(const age of [WINDOW+1,-1])
   await assert.rejects(()=>verifyLowSourceReview(envelope(category,age),trust,now));
 }
});
test('an old signature cannot prolong the 22h source verification window or alter native time',async()=>{
 const e=envelope('macro',WINDOW-1);await verifyLowSourceReview(e,trust,now);
 await assert.rejects(()=>verifyLowSourceReview(e,trust,now+2));
 const changed=structuredClone(e);changed.review.source_published_at=new Date(now-3600000).toISOString();
 await assert.rejects(()=>verifyLowSourceReview(changed,trust,now));
});
test('real HTML/native-clock reread accepts the 22h boundary but rejects older source before a GET',async()=>{
 let calls=0;
 for(const age of [7*3600000,WINDOW,WINDOW+1]){
  const source=new Date(now-age).toISOString();
  const original={category:'macro',originating_reporting_organization_id:'federal_reserve',
   original_article_url:'https://www.federalreserve.gov/newsevents/pressreleases/monetary20261021a.htm',original_published_at:source};
  const run=()=>verifyGeomacroUnclaimedOriginalPage({original,now:new Date(now),fetchImpl:async()=>{
   calls++;return new Response('<html><head><meta property="article:published_time" content="'+source+'"></head><body>Offline HTML fixture with exact original native publication time.</body></html>',{headers:{'content-type':'text/html'}});
  }});
  if(age>WINDOW){const before=calls;await assert.rejects(run);assert.equal(calls,before);}
  else{const r=await run();assert.equal(r.accepted,true);assert.equal(r.original_native_published_at,source);assert.equal(r.payment_authorized,false);}
 }
 assert.equal(ORIGINAL_VERIFICATION_EXPIRED,'OUTSIDE_TWENTY_TWO_HOUR_ORIGINAL_VERIFICATION_WINDOW');
});
