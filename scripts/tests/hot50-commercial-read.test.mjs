import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {RISK_GATE_HOT50} from '../../workers/control-plane/src/risk-gate-hot50-scope.mjs';
import {
 HOT50_CATEGORIES, HOT50_SIGNED_SCHEMA,verifyHot50CommercialSnapshot,
 handleHot50CommercialRead
} from '../../workers/control-plane/src/hot50-commercial-read.mjs';

const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const env={GEOMACRO_HOT50_PUBLIC_KEY_ID:'test-hot50-issuer',
 GEOMACRO_HOT50_PUBLIC_JWK_JSON:JSON.stringify(publicKey.export({format:'jwk'})),
 GEOMACRO_HOT50_COMMERCIAL_ACCEPTANCE:'ACCEPTED_SIGNED_B2_VERIFIED_150_CELLS'};
const sha=s=>createHash('sha256').update(s).digest('hex');
const ts=Date.now(),published=new Date(ts-60000).toISOString(),expires=new Date(ts+600000).toISOString();
const rating=(category)=>({score:72,confidence_low:66,confidence_high:78,
 confidence:0.8,qualified_evidence_count:3,
 ...(category==='trade_minerals_supplychain'?{verified_subdomains:['trade','critical_minerals','supply_chain']}:{}),
 b2_evidence_pointer:'b2://geomacro-evidence/signed/verified.json',
 b2_evidence_sha256:'a'.repeat(64)});
function country(iso3){return {iso3,composite_score:72,ratings:Object.fromEntries(HOT50_CATEGORIES.map(x=>[x,rating(x)]))};}
function make(viewKey='hot50',modifier=()=>{}){
 let countries=RISK_GATE_HOT50.map(country);
 if(viewKey.startsWith('country:'))countries=[country(viewKey.slice(8))];
 if(viewKey.startsWith('category:')){
   const category=viewKey.slice(9);
   countries=countries.sort((a,b)=>a.iso3.localeCompare(b.iso3))
     .map((x,i)=>({iso3:x.iso3,rank:i+1,ratings:{[category]:rating(category)}}));
 }
 const payload={schema:HOT50_SIGNED_SCHEMA,view_key:viewKey,
  public_key_id:'test-hot50-issuer',execution_authorized:false,
  evidence_qualification:'QUALIFIED',b2_readback_status:'VERIFIED',
  b2_pointer:'b2://geomacro-evidence/hot50/manifest.json',
  b2_sha256:'b'.repeat(64),verifier_proof_sha256:'c'.repeat(64),
  published_at:published,expires_at:expires,countries,
  ...(viewKey.startsWith('country:')?{historical_trend:[
   {as_of:new Date(ts-86400000).toISOString(),scores:Object.fromEntries(HOT50_CATEGORIES.map(c=>[c,65]))},
   {as_of:published,scores:Object.fromEntries(HOT50_CATEGORIES.map(c=>[c,72]))},
  ]}:{})};
 modifier(payload);
 const signed_json=JSON.stringify(payload);
 return {view_key:viewKey,signed_json,
  signature_b64:sign(null,Buffer.from(signed_json),privateKey).toString('base64'),
  snapshot_sha256:sha(signed_json),public_key_id:'test-hot50-issuer',
  b2_pointer:payload.b2_pointer,b2_sha256:payload.b2_sha256,
  verifier_proof_sha256:payload.verifier_proof_sha256,
  verifier_state:'CRYPTO_AND_B2_READBACK_VERIFIED',
  published_at:payload.published_at,expires_at:payload.expires_at};
}
test('EXPLICIT FIXTURE ONLY: signed 50 x 3 (150) canonical view verifies',async()=>{
 const data=await verifyHot50CommercialSnapshot(make(), 'hot50',env,ts);
 assert.equal(data.countries.length,50);
 assert.deepEqual(Object.keys(data.countries[0].ratings),HOT50_CATEGORIES);
});
test('EXPLICIT FIXTURE ONLY: country two-point historical trend verified',async()=>{
 assert.equal((await verifyHot50CommercialSnapshot(make('country:USA'),'country:USA',env,ts)).countries[0].iso3,'USA');
});
test('EXPLICIT FIXTURE ONLY: all three 50-country category snapshots verify',async()=>{
 for(const category of HOT50_CATEGORIES){
  const key='category:'+category;
  assert.equal((await verifyHot50CommercialSnapshot(make(key),key,env,ts)).countries.length,50);
 }
});
test('49 countries or one missing category is not qualified',async()=>{
 await assert.rejects(
  verifyHot50CommercialSnapshot(make('hot50',p=>p.countries.pop()),'hot50',env,ts),
  /HOT50_SIGNED_CONTENT_UNQUALIFIED/);
 await assert.rejects(
  verifyHot50CommercialSnapshot(make('hot50',p=>delete p.countries[0].ratings.trade_minerals_supplychain),'hot50',env,ts),
  /HOT50_SIGNED_CONTENT_UNQUALIFIED/);
});
test('tampering any signed byte is rejected even with unchanged DB hash',async()=>{
 const row=make();row.signed_json=row.signed_json.replace('"score":72','"score":73');
 await assert.rejects(verifyHot50CommercialSnapshot(row,'hot50',env,ts),/SHA256_MISMATCH/);
});
test('altered Ed25519 signature is rejected despite matching SHA',async()=>{
 const row=make(),other=generateKeyPairSync('ed25519');
 row.signature_b64=sign(null,Buffer.from(row.signed_json),other.privateKey).toString('base64');
 await assert.rejects(verifyHot50CommercialSnapshot(row,'hot50',env,ts),/ED25519_SIGNATURE_INVALID/);
});
test('expired, missing provenance or out-of-interval scores are rejected',async()=>{
 await assert.rejects(verifyHot50CommercialSnapshot(make(),'hot50',env,ts+1200000),/UNQUALIFIED_STALE/);
 await assert.rejects(verifyHot50CommercialSnapshot(make('hot50',p=>p.countries[0].ratings.macro_financial.b2_evidence_pointer=''), 'hot50',env,ts),/UNQUALIFIED_STALE/);
 await assert.rejects(verifyHot50CommercialSnapshot(make('hot50',p=>p.countries[0].ratings.geopolitics.confidence_low=90),'hot50',env,ts),/UNQUALIFIED_STALE/);
});
test('no owner proof: returns 503 without any D1 access',async()=>{
 let touched=0;const result=await handleHot50CommercialRead(
 new Request('https://control.example/v1/risk/hot50'),{
 ...env,GEOMACRO_HOT50_COMMERCIAL_ACCEPTANCE:'NOT_YET_VERIFIED',
 DB:{batch(){touched++;throw Error('NO_DB')}}});
 assert.equal(result.status,503);assert.equal(touched,0);
});
test('missing bearer returns 401 with no financial mutations',async()=>{
 let touched=0;
 const response=await handleHot50CommercialRead(
  new Request('https://control.example/v1/risk/hot50',
   {headers:{'Idempotency-Key':'test-request-0001'}}),
  {...env,DB:{batch(){touched++;throw Error('NO_DEBIT')}}});
 assert.equal(response.status,401);assert.equal(touched,0);
});
test('unknown ISO2 never maps to a country and never bills',async()=>{
 const response=await handleHot50CommercialRead(
  new Request('https://control.example/v1/risk/country/zz'),env);
 assert.equal(response,null);
});
test('key absent with correct route must be rejected before snapshot query',async()=>{
 const response=await handleHot50CommercialRead(
  new Request('https://control.example/v1/risk/hot50',
  {headers:{'Authorization':'Bearer gm_live_'+('f'.repeat(32)),
            'Idempotency-Key':'test-request-0001'}}),
  {...env,DB:{batch(){throw Error('NO_WRITES')},prepare(){return {bind(){return {first:async()=>null}}}}}});
 assert.equal(response.status,503); // pepper is intentionally absent in this fixture
 const body=await response.json();assert.equal(body.ok,false);
});
