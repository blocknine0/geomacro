import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPairSync,createPublicKey,createHash,verify as cryptoVerify} from 'node:crypto';
import {storeRiskGateD1} from '../../workers/control-plane/src/store-risk-gate.mjs';
import {readFileSync as readText} from 'node:fs';
import {canonicalProgressiveJson} from '../../workers/control-plane/src/progressive-risk-gate.mjs';
import {mintCanonicalCustomerPaidKey,readCanonicalCustomerPaidAccount} from '../../workers/control-plane/src/customer-paid-ledger.mjs';

const customerMigrations=['0090_customer_canonical_d1.sql','0091_customer_canonical_integrity_triggers.sql',
 '0092_customer_resend_otp_sessions.sql','0093_customer_email_provider_quota.sql',
 '0094_customer_login_runtime.sql','0095_customer_grant_scoped_usage.sql',
 '0096_customer_prepaid_pack_spend.sql','0097_customer_paypal_checkout_intents.sql'];
const pepper='test-store-credential-pepper-32-characters-or-more';
const iso=n=>new Date(n).toISOString();
function fixture(credits=100){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of customerMigrations)sql.exec(readFileSync('workers/control-plane/migrations/'+file,'utf8'));
 for(const file of ['0113_risk_gate_append_only_audit_receipts.sql','0124_risk_gate_receipt_signatures.sql',
   '0123_risk_gap_enrichment.sql','0201_progressive_risk_gate_facts.sql','0133_customer_store_risk_gate_metering.sql'])
  sql.exec(readFileSync('workers/control-plane/migrations/'+file,'utf8'));
 sql.exec(`CREATE TABLE country_gro_verified_hot(country_iso3 TEXT PRIMARY KEY,object_id TEXT,schema_version TEXT,
  generated_at TEXT,expires_at TEXT,signing_key_id TEXT,payload_hash TEXT,record_sha256 TEXT,archive_key TEXT,
  archive_sha256 TEXT,archive_write_acknowledged INTEGER,archive_readback_verified INTEGER,object_json TEXT,
  verified_at TEXT,updated_at TEXT);
 CREATE TABLE unified_risk_snapshots(entity_type TEXT,entity_id TEXT,day_utc TEXT,generated_at TEXT);`);
 const prepare=q=>({bind(...args){return {first:async()=>sql.prepare(q).get(...args)??null,
  all:async()=>({results:sql.prepare(q).all(...args)}),
  run:async()=>({meta:{changes:Number(sql.prepare(q).run(...args).changes)}})};}});
 const db={prepare},now=Date.now(),start=iso(now-60000),end=iso(now+30*86400000);
 const uid='store-customer-0000000001';
 sql.prepare('INSERT INTO users(id,email,email_verified_at) VALUES(?,?,?)').run(uid,'store@example.test',start);
 sql.prepare(`INSERT INTO customer_payment_receipts(receipt_id,user_id,provider,environment,provider_event_id,sku,
 amount_minor_units,currency,settled_at,verified_at,verification_sha256)
 VALUES('receipt-store-1',?,'base_usdc','mainnet','event-store-1','credits_100',500,'USDC',?,?,?)`)
  .run(uid,start,start,'a'.repeat(64));
 sql.prepare(`INSERT INTO customer_entitlement_grants(grant_id,user_id,receipt_id,tier,contract_version,starts_at,expires_at,status)
 VALUES('grant-store-1',?,'receipt-store-1','credits_100','credits-v1.1.0',?,?,'active')`)
  .run(uid,start,end);
 sql.prepare(`INSERT INTO credit_ledger(event_id,user_id,event_type,delta_credits,receipt_id)
 VALUES('fund-store-1',?,'funding',?,'receipt-store-1')`).run(uid,credits);
 const pair=generateKeyPairSync('ed25519');
 const privateB64=pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64');
 const publicB64=pair.publicKey.export({format:'der',type:'spki'}).toString('base64');
 const env={DB:db,GEOMACRO_API_CREDENTIAL_PEPPER:pepper,GEOMACRO_STORE_CHECKOUT_ENABLED:'YES',
  RISK_GATE_OBSERVATION_HMAC_KEY:'test-observation-hmac-key-which-is-long-enough',
  RISK_GATE_DECISION_ED25519_KEY_ID:'test-store-ed25519',
  RISK_GATE_DECISION_ED25519_PRIVATE_KEY_PKCS8_B64:privateB64,
  RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64:publicB64};
 function fact(fingerprint,domain='publisher.example',clock=iso(now-60000)){
  sql.prepare(`INSERT INTO progressive_risk_gate_facts(observation_id,country_iso3,category,event_fingerprint,
   publisher_domain,canonical_source_url,event_clock,clock_basis,extracted_entities_json,observed_at)
   VALUES(?,?,?,?,?,? ,?,'ORIGINAL_PUBLICATION','[]',?)`).run(
    createHash('sha256').update(fingerprint+'|'+domain).digest('hex'),'IND','geopolitics',fingerprint.padEnd(64,'b'),
    domain,'https://'+domain+'/news',clock,iso(now));
 }
 return {sql,db,env,uid,now,start,envPublic:publicB64,privateKey:pair.privateKey,fact};
}
function requestBody(tier,id,policy={}){return {request_id:id,subject:{type:'country',country_iso3:'IND'},tier,category:'geopolitics',
 policy:{policy_id:'customer-policy',policy_version:'v1',continue_max_score:35,reduce_limit_max_score:60,
 require_approval_max_score:85,minimum_confidence_for_auto_continue:0.8,
 require_commercial_verification_for_continue:false,...policy}};}
test('Store and Predge adapters call the same request Risk Gate builder with isolated locks',()=>{
 const store=readText('workers/control-plane/src/store-risk-gate.mjs','utf8');
 const predge=readText('workers/control-plane/src/predge-risk-gate-d1.mjs','utf8');
 const router=readText('workers/control-plane/src/index.mjs','utf8');
 assert.match(store,/generateRequestRiskGateDecision/u);
 assert.match(predge,/export async function generateRequestRiskGateDecision/u);
 assert.match(router,/url\.pathname==="\/v1\/store\/risk-gate"[\s\S]*?return storeRiskGateD1\(request,env\)/u);
 assert.match(predge,/predge-paid-license-scope-v1/u);
 assert.match(store,/consumeCanonicalCustomerPaid/u);
 assert.match(store,/resale_permitted:false/u);
});
async function call(f,key,body,options={}){return storeRiskGateD1(new Request('https://api.geomacro.live/v1/store/risk-gate',{
 method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify(body)}),f.env,f.now,
 options.evidenceReader,options.decisionBuilder);}

 test('Store checkout is locked by default; enabled self-serve BASIC is GeoMacro signed and debits 15 cents',async()=>{
 const f=fixture();const key=await mintCanonicalCustomerPaidKey(f.db,f.env,f.uid);f.fact('a'.repeat(64));
 const off=await storeRiskGateD1(new Request('https://api.geomacro.live/v1/store/risk-gate',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),{DB:f.db},f.now);
 assert.equal(off.status,403);assert.equal((await off.json()).error,'STORE_PAID_CHECKOUT_LOCKED');
 const res=await call(f,key.api_key,requestBody('basic_focused','store-basic-0001'));
 assert.equal(res.status,200);const out=await res.json();
 assert.equal(out.issuer,'Geomacro');assert.equal(out.commercial_signatory,'Geomacro');
 assert.equal(out.resale_permitted,false);assert.equal(out.price_usd_cents,15);assert.equal(out.customer_price_usd,'0.15');
 assert.equal(out.geomacro_fee_usd_cents,15);assert.equal(out.geomacro_fee_usd,'0.15');
 assert.equal(out.predge_share_usd_cents,0);assert.equal(out.predge_share_usd,'0.00');
 assert.equal(out.credit_cost,3);assert.equal(out.risk_gate.risk.confidence,0.35);
 assert.equal(out.risk_gate.affected_domain,'geopolitics');assert.ok(out.risk_gate.top_drivers.length);
 assert.equal(out.risk_gate.decision,'REQUIRE_APPROVAL');assert.equal(out.execution_authorized,false);
 const pub=createPublicKey({key:Buffer.from(f.envPublic,'base64'),format:'der',type:'spki'});
 assert.equal(cryptoVerify(null,Buffer.from(canonicalProgressiveJson(out.decision_signed_payload)),pub,
  Buffer.from(out.decision_signature_b64,'base64')),true);
 assert.equal((await readCanonicalCustomerPaidAccount(f.db,f.uid)).credits.remaining,97);
 assert.equal(f.sql.prepare("SELECT credit_cost FROM customer_usage_receipts WHERE request_id='store-basic-0001'").get().credit_cost,3);
 f.sql.close();
});

test('Store STANDARD same-event two-publisher fact gate uses policy fields and debits 20 cents',async()=>{
 const f=fixture();const key=await mintCanonicalCustomerPaidKey(f.db,f.env,f.uid);
 f.fact('c'.repeat(64),'publisher-one.test');f.fact('c'.repeat(64),'publisher-two.test');
 const res=await call(f,key.api_key,requestBody('standard','store-standard-0001',{
  continue_max_score:20,reduce_limit_max_score:45,require_approval_max_score:85,
  minimum_confidence_for_auto_continue:0.7}));
 assert.equal(res.status,200);const out=await res.json();
 assert.equal(out.price_usd_cents,20);assert.equal(out.customer_price_usd,'0.20');assert.equal(out.credit_cost,4);
 assert.equal(out.risk_gate.risk.confidence,0.72);assert.equal(out.risk_gate.risk_metric_semantics,'CORROBORATED_OBSERVATION_PROXY');
 assert.equal(out.risk_gate.decision,'CONTINUE');assert.equal(out.risk_gate.affected_domain,'geopolitics');
 assert.ok(out.risk_gate.top_drivers.some(x=>x.driver==='conflict'));
 assert.equal((await readCanonicalCustomerPaidAccount(f.db,f.uid)).credits.remaining,96);
 f.sql.close();
});

test('Store COMPLEX delivered debit is 30 cents; depleted recharge returns 402 and insufficient evidence is free',async()=>{
 const f=fixture();const key=await mintCanonicalCustomerPaidKey(f.db,f.env,f.uid);
 const body=requestBody('complex_full','store-complex-0001');
 const readyDecision={tierReady:true,tierActivationMatrix:{complex:{active:true}},result:{decision:'REQUIRE_APPROVAL',
 recommended_action:'REQUIRE_HUMAN_APPROVAL',reason_codes:['verified_test'],risk:{score:50,confidence:0.9},
 execution_authorized:false,top_drivers:[],policy:{policy_id:'customer-policy',policy_version:'v1'}}};
 const res=await call(f,key.api_key,body,{evidenceReader:async()=>({facts:{}}),decisionBuilder:async()=>readyDecision});
 assert.equal(res.status,200);const out=await res.json();assert.equal(out.price_usd_cents,30);
 assert.equal(out.customer_price_usd,'0.30');assert.equal(out.credit_cost,6);
 assert.equal((await readCanonicalCustomerPaidAccount(f.db,f.uid)).credits.remaining,94);
 const empty=fixture(1);const emptyKey=await mintCanonicalCustomerPaidKey(empty.db,empty.env,empty.uid);
 const insufficient=await call(empty,emptyKey.api_key,requestBody('standard','store-insufficient-01'),{
  evidenceReader:async()=>({facts:{}}),decisionBuilder:async()=>({tierReady:false,
   tierActivationMatrix:{standard:{active:false}},result:{decision:'PAUSE',recommended_action:'BLOCK',
    reason_codes:['INSUFFICIENT_EVIDENCE'],risk:{score:100,confidence:0},execution_authorized:false,
    top_drivers:[],policy:{policy_id:'customer-policy',policy_version:'v1'}}})});
 assert.equal(insufficient.status,200);const noEvidence=await insufficient.json();
 assert.equal(noEvidence.price_usd_cents,0);assert.equal(noEvidence.billable,false);assert.equal(noEvidence.entry_status,'INSUFFICIENT_EVIDENCE');
 assert.equal((await readCanonicalCustomerPaidAccount(empty.db,empty.uid)).credits.remaining,1);
 const depleted=fixture(2);const depletedKey=await mintCanonicalCustomerPaidKey(depleted.db,depleted.env,depleted.uid);depleted.fact('d'.repeat(64));
 const denied=await call(depleted,depletedKey.api_key,requestBody('basic_focused','store-depleted-001'));
 assert.equal(denied.status,402);assert.equal((await denied.json()).error,'INSUFFICIENT_RECHARGE_BALANCE');
 f.sql.close();empty.sql.close();depleted.sql.close();
});
