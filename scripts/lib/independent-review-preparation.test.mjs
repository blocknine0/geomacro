import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {makePrivateStageRecord,makePrivateStageBundle} from './restricted-private-scored-stage.mjs';
import {capturePrivateGriSourceCompanion,makePrivateGriCompanionBundle} from './private-gri-original-publisher-companion.mjs';
import {prepareIndependentReviewPackage,archiveIndependentReviewPreparation} from './independent-review-preparation.mjs';
const now=new Date('2026-10-15T21:00:00.000Z');
const hash=x=>createHash('sha256').update(x).digest('hex');
function fixture(age=30){
 const article={url:'https://publisher.example.org/release/real-original',sourceDomain:'publisher.example.org',
  title:'Publisher announces a new material cross-border trade policy',
  publishedAt:new Date(now.getTime()-age*60000).toISOString(),
  discoveryProvider:'official_native_rss',nativePublishedAtVerified:true};
 const assessment={relevant:true,category:'geopolitics',ungrounded:false,severity:74,confidence:86,
  narrative:'Derived policy change affects cross-border trade disruption risk.',
  summary:'Official decision raises estimated geopolitical corridor exposure.',
  classificationProvider:'groq',classificationModel:'fixture-model',
  classificationVersion:'event-severity-v1.0.5',classificationPromptVersion:'risk-desk-filter-v1.0.5',
  classificationInputHash:'a'.repeat(64)};
 const staged=makePrivateStageRecord({article,assessment,category:'geopolitics',now});
 const stage=makePrivateStageBundle([staged],{now});
 const source=capturePrivateGriSourceCompanion({article,staged,capturedAt:now});
 const companion=makePrivateGriCompanionBundle(stage,[source],{now});
 const stageBytes=gzipSync(Buffer.from(JSON.stringify(stage)));
 const companionBytes=gzipSync(Buffer.from(JSON.stringify(companion)));
 const pins={schema:'geomacro.private-review-preparation-source.v1',source_run_id:'1234',source_main_sha:'b'.repeat(40),
  stage_sha256:hash(stageBytes),companion_sha256:hash(companionBytes)};
 pins.stage_key='geomacro-evidence/v1/private/restricted-current-scoring/'+pins.stage_sha256+'.json.gz';
 pins.companion_key='geomacro-evidence/v1/private/gri-original-source-companions/'+pins.companion_sha256+'.json.gz';
 const input={pins,stageBytes,companionBytes,now};
 return {input,article,stage,companion};
}
function storage(input,{tamper=false}={}){
 const map=new Map([[input.pins.stage_key,input.stageBytes],[input.pins.companion_key,input.companionBytes]]);
 const calls=[];
 return {calls,client:{get:async key=>{calls.push(['get',key]);return tamper&&key.includes('/independent-review-preparation/')?Buffer.from('bad'):map.get(key);},
  put:async(key,bytes)=>{calls.push(['put',key]);map.set(key,Buffer.from(bytes));}}};
}
test('uses actual bound private records, retains missing categories and never claims review/signature/public readiness',()=>{
 const f=fixture(),r=prepareIndependentReviewPackage(f.input);
 assert.equal(r.packet.private_evidence.original_source_companion.rows[0].private_source_title,f.article.title);
 assert.deepEqual(r.packet.available_counts,{geopolitics:1,macro:0,rare_earth:0});
 assert.deepEqual(r.packet.missing_categories,['macro','rare_earth']);
 assert.equal(r.packet.private_evidence.stage.rows.length,1);
 for(const flag of ['reviewer_signed','publication_authorized','commercial_eligible','payments_allowed'])assert.equal(r.packet[flag],false);
 assert.equal(r.packet.review_tasks[0].within_gri_90m,true);
 assert.ok(r.packet.publication_blockers.includes('INDEPENDENT_REVIEW_SIGNATURE_REQUIRED'));
 assert.equal(r.key,'geomacro-evidence/v1/private/independent-review-preparation/'+hash(r.packed)+'.json.gz');
});
test('four-call governed archive verifies exact B2 package bytes and emits no private source content',async()=>{
 const f=fixture(),s=storage(f.input);
 const r=await archiveIndependentReviewPreparation({pins:f.input.pins,archiveClient:s.client,now});
 assert.deepEqual(s.calls.map(c=>c[0]),['get','get','put','get']);
 assert.equal(r.package_b2_readback_verified,true);assert.equal(r.reviewer_signed,false);
 assert.equal(r.publication_authorized,false);assert.equal(r.payments_executed,0);
 const receipt=JSON.stringify(r);assert.equal(receipt.includes(f.article.url),false);assert.equal(receipt.includes(f.article.title),false);
 assert.equal(receipt.includes('private_evidence'),false);
});
test('invalid source pins make zero B2 requests',async()=>{
 const f=fixture(),s=storage(f.input);
 for(const pins of [{...f.input.pins,stage_key:'arbitrary.json'},
  {...f.input.pins,companion_sha256:'bad'},{...f.input.pins,source_main_sha:'fake'},
  {...f.input.pins,private_source_url:f.article.url}]){
  await assert.rejects(archiveIndependentReviewPreparation({pins,archiveClient:s.client,now}),/SOURCE_PINS_INVALID/);
 }
 assert.equal(s.calls.length,0);
});
test('changed archive SHA or companion binding and forged eligibility fail before package PUT',()=>{
 const f=fixture();
 assert.throws(()=>prepareIndependentReviewPackage({...f.input,stageBytes:Buffer.from('bad')}),/SOURCE_BYTES_MISMATCH/);
 for(const mutate of [c=>c.rows[0].private_source_title='Different publisher original title now substituted',
  c=>c.rights_verification_pending=false,c=>c.stage_bundle_sha256='c'.repeat(64)]){
  const c=structuredClone(f.companion);mutate(c);const packed=gzipSync(Buffer.from(JSON.stringify(c)));
  assert.throws(()=>prepareIndependentReviewPackage({...f.input,companionBytes:packed,
   pins:{...f.input.pins,companion_sha256:hash(packed),
    companion_key:'geomacro-evidence/v1/private/gri-original-source-companions/'+hash(packed)+'.json.gz'}}));
 }
});
test('old original clocks stay old and block current publication while evidence remains explicitly private',()=>{
 const f=fixture(7*60),r=prepareIndependentReviewPackage(f.input);
 assert.equal(r.packet.review_tasks[0].within_intelligence_6h,false);
 assert.equal(r.packet.review_tasks[0].within_gri_90m,false);
 assert.equal(r.packet.review_tasks[0].source_as_of,f.article.publishedAt);
 assert.ok(r.packet.publication_blockers.includes('INTELLIGENCE_CURRENT_WINDOW_NOT_MET'));
 assert.ok(r.packet.publication_blockers.includes('GRI_CURRENT_WINDOW_NOT_MET'));
 assert.throws(()=>prepareIndependentReviewPackage({...f.input,now:new Date(now.getTime()+25*3600000)}));
});
test('corrupt final B2 readback cannot emit a successful package receipt',async()=>{
 const f=fixture(),s=storage(f.input,{tamper:true});
 await assert.rejects(archiveIndependentReviewPreparation({pins:f.input.pins,archiveClient:s.client,now}),/PACKAGE_READBACK_MISMATCH/);
});
