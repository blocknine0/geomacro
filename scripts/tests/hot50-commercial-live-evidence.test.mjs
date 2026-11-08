import test from 'node:test';
import assert from 'node:assert/strict';
import {readHot50LiveEvidenceDeficit} from '../../workers/control-plane/src/hot50-commercial-live-evidence.mjs';
import {scoreQualifiedHot50Cell} from '../../workers/control-plane/src/hot50-commercial-scoring.mjs';

const now=Date.now();
const evidence=(category,subdomain,idx)=>({
 country_iso3:'USA',category,source_subdomain:subdomain,
 qualification_status:'QUALIFIED',rights_approved:true,
 b2_readback_verified:true,ed25519_evidence_receipt_verified:true,
 independent_primary_publishers:3,impact_score:70,
 event_fingerprint:(String(idx).padStart(2,'0')).repeat(32),
 b2_sha256:'a'.repeat(64),proof_sha256:'b'.repeat(64),
 b2_pointer:'b2://fixture-evidence/verified/receipt.json',
 original_published_at:new Date(now-3600000).toISOString(),
});
test('actual D1 source metadata and GRO views are scanned, no fake qualified certificate',async()=>{
 let calls=0;
 const db={prepare(sql){calls++;
  assert.match(sql,/progressive_risk_gate_cell_state|gro_evidence/);
  return {bind(...args){
   assert.ok(args.length>=52);
   return {all:async()=>({results:sql.includes('progressive_risk_gate_cell_state')
    ?[{country_iso3:'USA',category:'geopolitics',corroborated_event_count:2}]
    :[{country_iso3:'USA',category:'geopolitics',verified_gro_rows:1}]})};
  }};
 }};
 const result=await readHot50LiveEvidenceDeficit({DB:db},now);
 assert.equal(calls,2);
 assert.equal(result.status,'INSUFFICIENT_EVIDENCE');
 assert.equal(result.source_d1_query_available,true);
 assert.equal(result.all_150_qualified_scored_cells_confirmed,false);
 assert.equal(result.source_rights_verified,false);
 assert.equal(result.physical_b2_readback_verified,false);
 assert.equal(result.first_missing_cells.includes('USA:trade_minerals_supplychain'),true);
 assert.equal(result.missing_source_metadata_or_verified_gro_cells,149);
});
test('missing/failed real D1 query never asserts source readiness',async()=>{
 const db={prepare(){throw Error('D1_DOWN')}};
 const result=await readHot50LiveEvidenceDeficit({DB:db},now);
 assert.equal(result.status,'INSUFFICIENT_EVIDENCE');
 assert.equal(result.source_d1_query_available,false);
});
test('category 3 never silently maps a rare_earth original to Trade risk',()=>{
 assert.throws(()=>scoreQualifiedHot50Cell({
  iso3:'USA',category:'trade_minerals_supplychain',asOf:now,
  evidence:[evidence('trade_minerals_supplychain','critical_minerals',1)]}),
 /MISSING_SUBDOMAIN/);
 assert.throws(()=>scoreQualifiedHot50Cell({
  iso3:'USA',category:'trade_minerals_supplychain',asOf:now,
  evidence:[evidence('trade_minerals_supplychain','rare_earth',1)]}),
 /SOURCE_CLASSIFICATION_REQUIRED/);
});
test('only fully qualified independent subdomain proof permits deterministic category-3 score',()=>{
 const rating=scoreQualifiedHot50Cell({
  iso3:'USA',category:'trade_minerals_supplychain',asOf:now,
  evidence:['trade','critical_minerals','supply_chain']
   .map((domain,i)=>evidence('trade_minerals_supplychain',domain,i+1)),
 });
 assert.equal(rating.score,70);
 assert.deepEqual(rating.verified_subdomains,['trade','critical_minerals','supply_chain']);
 assert.equal(rating.qualified_evidence_count,3);
});
