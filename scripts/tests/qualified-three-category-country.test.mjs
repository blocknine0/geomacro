import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {registerHooks} from 'node:module';
// Node 24 native TypeScript loader; these canonical modules use no third-party
// packages. Resolve existing extensionless relative TS imports for this test.
registerHooks({resolve(specifier,context,next){
 try{return next(specifier,context)}catch(error){
  if(error.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')&&context.parentURL){
   const candidate=new URL(specifier+'.ts',context.parentURL);
   if(existsSync(fileURLToPath(candidate)))return next(candidate.href,context);
  }
  throw error;
 }
}});
const {scoreAndSignQualifiedThreeCategoryCountry}=await import('../../src/lib/on-demand-qualified-country-risk.server.ts');
const {verifyRiskObjectSignature}=await import('../../src/lib/risk-object-signing.server.ts');
const {validatedSignedCategoryScores}=await import('../../workers/control-plane/src/unified-risk-categories.mjs');
const now=new Date('2026-11-06T12:00:00.000Z');
const kp=generateKeyPairSync('ed25519');
const key='offline-three-category-test-key';
const pub=kp.publicKey.export({format:'der',type:'spki'}).toString('base64');
const signingMaterial={key_id:key,private_key_pkcs8_b64:kp.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),public_key_spki_b64:pub};
const verificationKeys={[key]:{public_key_spki_b64:pub,status:'active'}};
function input(){return {country_iso3:'USA',country_name:'United States',now,groups:['geopolitics','macro','rare_earth'].map((category,index)=>({category,events:[{
 id:'offline-event-'+index,domain:category,event_type:['military_conflict','monetary_policy','critical_minerals'][index],
 title:'Offline deterministic fixture '+category,primary_country:'USA',countries:['USA'],severity:60,confidence:90,direction:'UP',
 first_seen_at:'2026-11-06T11:30:00.000Z',last_seen_at:'2026-11-06T11:40:00.000Z',material_evidence_at:'2026-11-06T11:30:00.000Z',
 evidence_count:2,independent_source_count:2,source_ids:['source-a-'+index,'source-b-'+index],source_families:['issuer-a','issuer-b'],
 source_record_ids:['record-a-'+index,'record-b-'+index],content_hashes:['a'.repeat(64),'b'.repeat(64)],
 evidence_refs:[],structure_version:'offline-test-v1',structured_payload:{},relevance_weight:1,corroboration_status:'CONFIRMED',
}]}))};}
async function qualified(scope){return {schema:'geomacro.on-demand-qualified-events.v1',category:scope.category,country_iso3:scope.country_iso3,
 exact_evidence_sha256:scope.evidence_sha256,event_ids:scope.events.map(x=>x.id).sort(),independent_claims_verified:true,verified_commercial_rights:true,
 event_commercial_eligibility:scope.events.map(x=>({event_id:x.id,status:'DERIVED_ONLY',reason_codes:['offline-trusted-qualifier-fixture']}))};}
const deps={signingMaterial,verificationKeys,qualifyEvidence:qualified};
test('all three separately qualified groups produce one verifiable canonical GRO with three category scores',async()=>{
 const calls=[];
 const result=await scoreAndSignQualifiedThreeCategoryCountry(input(),{...deps,qualifyEvidence:async s=>{calls.push(s.category);return qualified(s)}});
 const gro=JSON.parse(result.signed_risk_object_json);
 assert.equal(verifyRiskObjectSignature(gro,verificationKeys).valid,true);
 assert.equal(gro.subject.id,'USA');assert.equal(gro.evidence.length,3);
 assert.deepEqual(calls,['geopolitics','macro','rare_earth']);
 assert.deepEqual(Object.keys(validatedSignedCategoryScores(gro)).sort(),['CRITICAL_MINERALS','GEOPOLITICS','MACRO_FX']);
 assert.equal(result.payment_authorized,false);assert.equal(result.persistence_performed,false);
});
test('one missing qualification cannot be replaced with two valid categories',async()=>{
 await assert.rejects(()=>scoreAndSignQualifiedThreeCategoryCountry(input(),{...deps,qualifyEvidence:async s=>s.category==='macro'?null:qualified(s)}),/QUALIFICATION_NOT_VERIFIED/);
});
test('duplicate category, cross-country input, and stale native clocks are rejected',async()=>{
 const duplicate=input();duplicate.groups[1].category='geopolitics';
 await assert.rejects(()=>scoreAndSignQualifiedThreeCategoryCountry(duplicate,deps),/THREE_CATEGORY_SCOPE_INVALID/);
 const country=input();country.groups[1].events[0].primary_country='CHN';
 await assert.rejects(()=>scoreAndSignQualifiedThreeCategoryCountry(country,deps),/EVENT_UNVERIFIED/);
 const stale=input();stale.groups[0].events[0].material_evidence_at='2026-11-05T11:30:00.000Z';
 await assert.rejects(()=>scoreAndSignQualifiedThreeCategoryCountry(stale,deps),/ORIGINAL_NOT_FRESH/);
});
test('later asynchronous qualifier cannot mutate an earlier approved category',async()=>{
 let earlier;
 await assert.rejects(()=>scoreAndSignQualifiedThreeCategoryCountry(input(),{...deps,qualifyEvidence:async s=>{
  if(earlier)earlier[0].severity=99;
  earlier=s.events;return qualified(s);
 }}),/EVIDENCE_CHANGED/);
});

test('canonical three-category signature passes the actual hot verifier and reaches the seven-day assessment readback',async()=>{
 const {verifyHotGRO}=await import('../../workers/control-plane/src/predge-risk-gate-d1.mjs');
 const {materializeRiskGateAssessments}=await import('../../workers/control-plane/src/risk-gate-assessment-buffer.mjs');
 const prepared=await scoreAndSignQualifiedThreeCategoryCountry(input(),deps);
 const gro=JSON.parse(prepared.signed_risk_object_json);
 const row={country_iso3:'USA',object_id:gro.object_id,schema_version:'gro-1.1',
  generated_at:gro.generated_at,expires_at:gro.expires_at,record_sha256:prepared.record_sha256,
  payload_hash:gro.integrity.payload_hash,signing_key_id:key,object_json:prepared.signed_risk_object_json,
  archive_write_acknowledged:1,archive_readback_verified:1,archive_sha256:'a'.repeat(64),
  archive_key:'geomacro-evidence/v1/live/country-gro/offline-fixture.json.gz'};
 const authority={key_id:key,public_key_spki_b64:pub};
 const verifyGro=(row,env,subject,time)=>verifyHotGRO(row,env,subject,time,authority);
 assert.ok(await verifyGro(row,{}, {type:'country',id:'USA'},now.getTime()));
 const snapshot={target_type:'COUNTRY',target_id:'USA',day_utc:'2026-11-06',categories:{}};
 const verifiedRows=[{entity_type:'COUNTRY',entity_id:'USA',day_utc:snapshot.day_utc,snapshot,content_sha256:'a'.repeat(64)}];
 const env={DB:{prepare(sql){return {bind(){return {all:async()=>({results:sql.includes('country_gro_verified_hot')?[row]:[]})}}}}}};
 let saved=[];
 const result=await materializeRiskGateAssessments(env,verifiedRows,{now:now.getTime(),verifyGro,
  remote:async(path,options)=>{
   if(options.method==='POST'){saved=JSON.parse(options.body);return new Response(null,{status:201})}
   return Response.json(saved);
  }});
 assert.equal(result.assessment_rows,3);assert.equal(result.verified_assessment_rows,1);
 assert.equal(saved.find(x=>x.tier==='STANDARD').assessment_status,'VERIFIED');
 row.object_json=row.object_json.replace('"confidence":','"tampered_confidence":');
 const rejected=await materializeRiskGateAssessments(env,verifiedRows,{now:now.getTime(),verifyGro,
  remote(){assert.fail('tampered signed bytes left the verifier')}});
 assert.equal(rejected.assessment_rows,0);
});
