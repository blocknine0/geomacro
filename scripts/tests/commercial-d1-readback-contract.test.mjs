import test from 'node:test';
import assert from 'node:assert/strict';
import {
 REQUIRE,BASE_REQUIRED_OBJECTS,commercialSchemaSql,
 verifyCommercialD1Schema,parseWranglerCommercialSchema,
 createCommercialReadbackReceipt
} from '../ops/readback-commercial-d1-schema.mjs';
function rows(){
 return Object.entries(REQUIRE).map(([name,type])=>({name,type,
 sql:type==='index'?(
  name==='idx_commercial_hot50_live_view'
   ?'CREATE INDEX '+name+' ON commercial_hot50_signed_snapshots(view_key,published_at DESC)'
   :name==='idx_phase2h_ref_country_category_clock_v1'
    ?'CREATE INDEX '+name+' ON phase2h_raw_object_refs_v1(risk_country_iso3,category,original_published_at)'
    :'CREATE INDEX '+name+' ON '+(name.includes('phase2h')?'phase2h_raw_object_refs_v1':'credit_ledger')+'(id)'
 ):type==='trigger'
   ?"CREATE TRIGGER "+name+" BEFORE INSERT ON commercial_hot50_checkout_key_handoffs BEGIN SELECT CASE WHEN provider='paypal' THEN 1 END; END"
   :type==='view'?'CREATE VIEW '+name+' AS SELECT 1 AS id':
  name==='customer_payment_receipts'
   ?'CREATE TABLE customer_payment_receipts(provider TEXT,environment TEXT,provider_event_id TEXT, UNIQUE(provider,environment,provider_event_id))'
   :name==='api_keys'?'CREATE TABLE api_keys(hmac_sha256 TEXT)'
   :name==='tenant_api_keys_v1'?'CREATE TABLE tenant_api_keys_v1(key_sha256 TEXT)'
   :name==='phase2h_raw_object_refs_v1'?'CREATE TABLE phase2h_raw_object_refs_v1(pointer_hmac_sha256 TEXT)'
   :name==='commercial_hot50_signed_snapshots'
     ?'CREATE TABLE commercial_hot50_signed_snapshots(signature_b64 TEXT)'
     :name==='commercial_hot50_checkout_key_handoffs'
       ?'CREATE TABLE commercial_hot50_checkout_key_handoffs(receipt_id TEXT PRIMARY KEY,key_id TEXT UNIQUE,user_id TEXT)'
     :name==='commercial_hot50_delivery_receipts'
       ?'CREATE TABLE commercial_hot50_delivery_receipts(id TEXT, FOREIGN KEY(id) REFERENCES users(id))'
       :'CREATE TABLE '+name+'(id TEXT)'
 }));
}
const meta={rows_read:18,rows_written:0};
test('read-only base phase verifies Step3 pointer and canonical ledger without falsely asserting 0215/0216',()=>{
 const base=rows().filter(x=>Object.hasOwn(BASE_REQUIRED_OBJECTS,x.name));
 const proof=verifyCommercialD1Schema(base,meta,'base');
 assert.equal(proof.status,'PASS');
 assert.equal(proof.verified_phase,'base');
 assert.equal(proof.phase2h_ref_table_present,true);
 assert.equal(proof.signed_commercial_delivery_schema_present,false);
 assert.equal(proof.live_data_or_actual_paypal_settlement_verified,false);
 assert.ok(!commercialSchemaSql('base').includes('commercial_hot50_signed_snapshots'));
 assert.ok(commercialSchemaSql('base').includes('phase2h_raw_object_refs_v1'));
 assert.throws(()=>verifyCommercialD1Schema(base.filter(x=>x.name!=='api_keys'),meta,'base'));
 assert.throws(()=>verifyCommercialD1Schema(base,meta,'unknown'));
});
test('remote read-only schema verifier requires all exact objects',()=>{
 const proof=verifyCommercialD1Schema(rows(),meta);
 assert.equal(proof.status,'PASS');
 assert.equal(proof.remote_schema_readback_verified,undefined);
 assert.equal(proof.live_data_or_actual_paypal_settlement_verified,false);
 assert.equal(proof.provider_rows_written,0);
});
test('missing Phase2H pointer migration, composite index or unique capture constraint HOLD',()=>{
 assert.throws(()=>verifyCommercialD1Schema(rows().filter(x=>x.name!=='phase2h_raw_object_refs_v1'),meta));
 assert.throws(()=>verifyCommercialD1Schema(rows().map(x=>x.name==='idx_phase2h_ref_country_category_clock_v1'?{...x,sql:x.sql.replace('risk_country_iso3','id')}:x),meta));
 assert.throws(()=>verifyCommercialD1Schema(rows().map(x=>x.name==='customer_payment_receipts'?{...x,sql:'CREATE TABLE customer_payment_receipts(provider_event_id TEXT)'}:x),meta));
});
test('provider metadata ambiguity, any writes, duplicate objects or unsuccessful result HOLD',()=>{
 assert.throws(()=>verifyCommercialD1Schema(rows(),{rows_read:1,rows_written:1}));
 assert.throws(()=>verifyCommercialD1Schema([...rows().slice(0,-1),rows()[0]],meta));
 assert.throws(()=>parseWranglerCommercialSchema(JSON.stringify([{success:false,results:rows(),meta}])));
 assert.throws(()=>parseWranglerCommercialSchema('not JSON'));
});
test('readback receipt never claims production migration or merchant activation',()=>{
 const p=createCommercialReadbackReceipt({target:'production'});
 assert.equal(p.status,'NOT_YET_VERIFIED');
 assert.equal(p.remote_schema_readback_verified,false);
 assert.equal(p.first_real_money_pilot_verified,false);
 assert.equal(p.production_d1_mutated,false);
});
