import {test,beforeEach,afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import worker,{CommerceLedger} from '../../workers/commerce-ledger/src/index.mjs';
import {canonicalJson} from '../../src/lib/canonical-json.ts';
import {MCS_DIGEST_CSV_SHA256} from '../../src/lib/mcs-digest-source-identity.ts';
import {TREASURY_TERMS_SHA256} from '../../src/lib/treasury-fx-source-identity.ts';
import {STRUCTURAL_CANDIDATE_SCOPE as scope,STRUCTURAL_CANDIDATE_VERSION,
 structuralCandidateHash,hashText} from '../../workers/commerce-ledger/src/structural-candidate.mjs';
const NOW=Date.parse('2026-10-18T00:00:00.000Z');
beforeEach(()=>mock.method(Date,'now',()=>NOW));
afterEach(()=>mock.restoreAll());
function vault(){
 const map=new Map();
 const txn={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),
  delete:async k=>map.delete(k),list:async({prefix,limit})=>new Map([...map].filter(([k])=>k.startsWith(prefix)).slice(0,limit))};
 return {map,ledger:new CommerceLedger({storage:{...txn,transaction:async cb=>cb(txn)}},{})};
}
async function fixture(salt='one'){
 const request=await hashText('synthetic-canonical-plan:'+salt);
 const core={schema_version:'geomacro.adaptive-intelligence-response.v1',query_plan_hash:request,
  subjects:[{type:'country',country_iso3:'CHN'}],
  question_interpretation:{delivery_tier:'structural_baseline',topics:['critical_minerals'],required_modules:['critical_minerals']},
  methodology:{price_usdc:'0.02'},signed_risk_objects:[],risk_gate:[],gri_context:null,execution_authorized:false};
 const customerBytes=canonicalJson({...core,delivered_product_hash:await hashText(canonicalJson(core))});
 const candidate={schema:STRUCTURAL_CANDIDATE_VERSION,capability:'structural_country_digest',variant:'standard',amount_atomic:'20000',
  country_iso3:'CHN',topic:'critical_minerals',request_hash:request,answer_sha256:await hashText(customerBytes),
  source_file_sha256:MCS_DIGEST_CSV_SHA256,rights_metadata_sha256:await hashText('synthetic-rights-test-only'),
  source_period_end:'2025-12-31T23:59:59.000Z',checked_at:new Date(NOW).toISOString(),
  expires_at:new Date(NOW+86400_000).toISOString(),binding_hash:''};
 candidate.binding_hash=await structuralCandidateHash(candidate);
 return {candidate,customerBytes};
}
async function post(ledger,action,fields){
 const r=await ledger.fetch(new Request('https://internal/'+action,{method:'POST',body:JSON.stringify({...scope,...fields})}));
 return {status:r.status,body:await r.json()};
}
async function quarterlyFixture(){
 const f=await fixture('quarterly'),{delivered_product_hash:_old,...core}=JSON.parse(f.customerBytes);
 core.subjects=[{type:'country',country_iso3:'IND'}];
 core.question_interpretation.topics=['fx_external_risk'];core.question_interpretation.required_modules=['external_fx'];
 f.customerBytes=canonicalJson({...core,delivered_product_hash:await hashText(canonicalJson(core))});
 Object.assign(f.candidate,{country_iso3:'IND',topic:'fx_external_risk',source_file_sha256:await hashText('synthetic-quarterly-response-test-only'),
  rights_metadata_sha256:TREASURY_TERMS_SHA256,source_period_end:'2026-09-30T23:59:59.000Z',answer_sha256:await hashText(f.customerBytes)});
 f.candidate.binding_hash=await structuralCandidateHash(f.candidate);return f;
}
test('distinct quarterly India profile freezes exact bytes and independently reads twice with no payment state',async()=>{
 const {ledger,map}=vault(),f=await quarterlyFixture();
 assert.equal((await post(ledger,'structural-candidate-freeze',f)).body.disposition,'FROZEN');
 for(let i=0;i<2;i++){
  const r=await post(ledger,'structural-candidate-readback',{bindingHash:f.candidate.binding_hash});
  assert.equal(r.status,200);assert.equal(r.body.customerBytes,f.customerBytes);
  assert.equal(r.body.payment_authorized,false);assert.equal(r.body.settlement_attempted,false);
 }
 assert.equal((await post(ledger,'structural-candidate-freeze',f)).body.disposition,'EXACT_REPLAY');
 assert.equal(map.size,1);assert.ok([...map.keys()].every(k=>k.startsWith('structural-candidate:')));
});
test('quarterly profile cannot borrow annual rights, another country, false clocks or signed modules',async()=>{
 for(const edit of [f=>f.candidate.rights_metadata_sha256='a'.repeat(64),
  f=>f.candidate.country_iso3='USA',f=>f.candidate.source_period_end='2026-09-29T23:59:59.000Z',
  f=>f.candidate.source_period_end='2025-09-30T23:59:59.000Z',
  f=>f.candidate.topic='critical_minerals',f=>f.candidate.expires_at='2026-10-20T00:00:00.000Z']){
  const {ledger,map}=vault(),f=await quarterlyFixture();edit(f);
  f.candidate.binding_hash=await structuralCandidateHash(f.candidate);
  assert.equal((await post(ledger,'structural-candidate-freeze',f)).status,409);assert.equal(map.size,0);
 }
 const {ledger,map}=vault(),f=await quarterlyFixture();
 const {delivered_product_hash:_old,...core}=JSON.parse(f.customerBytes);
 core.question_interpretation.required_modules=['signed_risk_object'];
 f.customerBytes=canonicalJson({...core,delivered_product_hash:await hashText(canonicalJson(core))});
 f.candidate.answer_sha256=await hashText(f.customerBytes);f.candidate.binding_hash=await structuralCandidateHash(f.candidate);
 assert.equal((await post(ledger,'structural-candidate-freeze',f)).status,409);assert.equal(map.size,0);
});
test('exact private candidate bytes freeze, independently read twice and replay without any payment record',async()=>{
 const {ledger,map}=vault();const f=await fixture();
 assert.equal((await post(ledger,'structural-candidate-freeze',f)).body.disposition,'FROZEN');
 for(let i=0;i<2;i++){
  const r=await post(ledger,'structural-candidate-readback',{bindingHash:f.candidate.binding_hash});
  assert.equal(r.status,200);assert.equal(r.body.customerBytes,f.customerBytes);
  assert.deepEqual(r.body.candidate,f.candidate);assert.equal(r.body.payment_authorized,false);
  assert.equal(r.body.settlement_attempted,false);
 }
 assert.equal((await post(ledger,'structural-candidate-freeze',f)).body.disposition,'EXACT_REPLAY');
 assert.equal(map.size,1);assert.ok([...map.keys()].every(k=>k.startsWith('structural-candidate:')));
});
test('changed bytes, digest, prices, country, source, rights lifetime and scope reject before a write',async()=>{
 const edits=[
  f=>{f.customerBytes+=' ';},f=>{f.candidate.answer_sha256='a'.repeat(64);},
  f=>{f.candidate.amount_atomic='50000';},f=>{f.candidate.country_iso3='USA';},
  f=>{f.candidate.source_file_sha256='a'.repeat(64);},f=>{f.candidate.checked_at='2027-01-01T00:00:00.000Z';},
  f=>{f.candidate.expires_at='2027-01-01T00:00:00.000Z';},f=>{f.candidate.extra=true;},
  f=>{f.provider='coinbase_x402';},f=>{f.providerEnvironment='mainnet';},
 ];
 for(const edit of edits){const {ledger,map}=vault(),f=await fixture();edit(f);
  assert.equal((await post(ledger,'structural-candidate-freeze',f)).status,409);assert.equal(map.size,0);}
});
test('corrupted stored bytes and expired candidates are never readable',async()=>{
 const {ledger,map}=vault(),f=await fixture();await post(ledger,'structural-candidate-freeze',f);
 const key='structural-candidate:'+f.candidate.binding_hash;
 const original=structuredClone(map.get(key));map.get(key).customerBytes+='tamper';
 assert.equal((await post(ledger,'structural-candidate-readback',{bindingHash:f.candidate.binding_hash})).status,409);
 map.set(key,original);mock.method(Date,'now',()=>NOW+86400_000);
 assert.equal((await post(ledger,'structural-candidate-readback',{bindingHash:f.candidate.binding_hash})).status,409);
});
test('the vault is bounded and never prunes nonpayment records from other namespaces',async()=>{
 const {ledger,map}=vault();map.set('payment:preserve',{state:'delivered'});
 for(let i=0;i<32;i++)assert.equal((await post(ledger,'structural-candidate-freeze',await fixture(String(i)))).status,200);
 assert.equal((await post(ledger,'structural-candidate-freeze',await fixture('overflow'))).status,409);
 assert.deepEqual(map.get('payment:preserve'),{state:'delivered'});
 assert.equal(map.size,33);
});
test('root transport requires authentication and forbids payment actions in the candidate namespace',async()=>{
 const {ledger,map}=vault();const token='private-test-token-'.repeat(3);
 const env={LEDGER_SHARED_TOKEN:token,COMMERCE_LEDGER:{idFromName:s=>s,get:()=>({fetch:(url,init)=>ledger.fetch(new Request(url,init))})}};
 const req=(action,auth)=>new Request('https://worker.test/v1/delivery/'+action,{method:'POST',
  headers:{authorization:'Bearer '+auth},body:JSON.stringify({...scope})});
 assert.equal((await worker.fetch(req('structural-candidate-readback','wrong'),env)).status,401);
 assert.equal((await worker.fetch(req('claim',token),env)).status,400);
 assert.equal(map.size,0);
});
