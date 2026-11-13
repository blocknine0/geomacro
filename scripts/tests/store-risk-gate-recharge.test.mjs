import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {generateKeyPairSync,webcrypto,verify as verifyEd25519} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {storeRiskGateD1,STORE_RISK_GATE_PRICE_CENTS} from "../../workers/control-plane/src/store-risk-gate.mjs";
import {canonicalProgressiveJson} from "../../workers/control-plane/src/progressive-risk-gate.mjs";

if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto});
const pepper="test-store-pepper-at-least-32-characters-long";
const key="gmk_live_"+"a".repeat(64);
function envFor({enabled="NO",events=1,publishers=1,depleted=false}={}){
 const {privateKey,publicKey}=generateKeyPairSync("ed25519");
 const debits=[];
 const env={GEOMACRO_STORE_CHECKOUT_ENABLED:enabled,
  GEOMACRO_API_CREDENTIAL_PEPPER:pepper,
  RISK_GATE_DECISION_ED25519_KEY_ID:"geomacro-test-key",
  RISK_GATE_DECISION_ED25519_PRIVATE_KEY_PKCS8_B64:privateKey.export({type:"pkcs8",format:"der"}).toString("base64"),
  RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64:publicKey.export({type:"spki",format:"der"}).toString("base64"),
  DB:{prepare(sql){let values=[];return {bind(...args){values=args;return this;},
   async first(){
    if(sql.includes("FROM api_keys k JOIN users"))return {key_id:"key-1",user_id:"customer-00000000001",
     scopes_json:'["risk-gate:read"]',grant_id:"grant-1",grant_tier:"business_pilot",
     expires_at:"2026-12-01T00:00:00.000Z",receipt_id:"receipt-1",amount_minor_units:1000};
    if(sql.includes("FROM progressive_risk_gate_facts"))return {unique_events:events,
     max_publisher_count:1,corroborated_events:publishers>=2?1:0,corroborated_countries:0,
     latest_event_clock:"2026-11-12T12:00:00.000Z",categories:"geopolitics"};
    if(sql.includes("FROM native_events"))return {index_events:events,
     latest_index_clock:"2026-11-12T12:00:00.000Z",native_corroborated_publisher_count:publishers};
    return null;
   },async run(){
    if(sql.includes("INSERT INTO customer_store_risk_gate_usage")){
     if(depleted)throw Error("STORE_RISK_GATE_INSUFFICIENT_RECHARGE_BALANCE");
     debits.push({user_id:values[0],request_id:values[1],charge_cents:values[6]});
     return {success:true};
    }
    return {success:true};
   }};}}
 };
 return {env,debits,publicKey};
}
const fixture=JSON.parse(readFileSync("docs/partners/predge/risk-gate-paid-request.json","utf8"));
function request(body){return new Request("https://worker.example/v1/store/risk-gate",{
 method:"POST",headers:{authorization:"Bearer "+key,"content-type":"application/json"},
 body:JSON.stringify(body)});}

test("Store stays locked by default and exposes the published receipt-backed cent prices",async()=>{
 const {env}=envFor();
 const response=await storeRiskGateD1(request(fixture),env,Date.parse("2026-11-12T12:00:00Z"));
 assert.equal(response.status,403);
 assert.equal((await response.json()).error,"STORE_PAID_CHECKOUT_LOCKED");
 assert.deepEqual(STORE_RISK_GATE_PRICE_CENTS,{basic_focused:15,standard:20,complex_full:30});
 const migration=readFileSync("workers/control-plane/migrations/0133_customer_store_risk_gate_recharge.sql","utf8");
 for(const [tier,cents] of Object.entries(STORE_RISK_GATE_PRICE_CENTS))
  assert.match(migration,new RegExp(`WHEN '${tier}' THEN ${cents}`,"u"));
});

test("0133 debit trigger prices delivery and rejects a depleted prepaid receipt atomically",()=>{
 const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");
 for(const name of ["0020_predge_risk_gate_d1.sql","0090_customer_canonical_d1.sql","0091_customer_canonical_integrity_triggers.sql",
   "0092_customer_resend_otp_sessions.sql","0093_customer_email_provider_quota.sql",
   "0094_customer_login_runtime.sql","0095_customer_grant_scoped_usage.sql",
   "0096_customer_prepaid_pack_spend.sql"])
  db.exec(readFileSync(`workers/control-plane/migrations/${name}`,"utf8"));
 db.prepare("INSERT INTO risk_gate_d1_quota(client_id,usage_day,used) VALUES('paid','2026-11-13',500)").run();
 db.exec(readFileSync("workers/control-plane/migrations/0133_customer_store_risk_gate_recharge.sql","utf8"));
 db.prepare("UPDATE risk_gate_d1_quota SET used=used+1 WHERE client_id='paid' AND usage_day='2026-11-13'").run();
 assert.equal(db.prepare("SELECT used FROM risk_gate_d1_quota WHERE client_id='paid'").get().used,501);
 const now=new Date().toISOString(),future=new Date(Date.now()+86400000).toISOString();
 db.prepare("INSERT INTO users(id,email,email_verified_at) VALUES(?,?,?)")
  .run("store-customer-00000001","store@example.test",now);
 db.prepare(`INSERT INTO customer_payment_receipts
  (receipt_id,user_id,provider,environment,provider_event_id,sku,amount_minor_units,currency,
   settled_at,verified_at,verification_sha256) VALUES(?,?,'base_usdc','mainnet',?,? ,30,'USDC',?,?,?)`)
  .run("store-receipt-1","store-customer-00000001","provider-event-1","monthly-recharge",now,now,"a".repeat(64));
 db.prepare(`INSERT INTO customer_entitlement_grants
  (grant_id,user_id,receipt_id,tier,contract_version,starts_at,expires_at,status)
  VALUES(?,?,?,'business_pilot','credits-v1.1.0',?,?, 'active')`)
  .run("store-grant-1","store-customer-00000001","store-receipt-1",now,future);
 db.prepare(`INSERT INTO credit_ledger(event_id,user_id,event_type,delta_credits,receipt_id)
  VALUES(?,?,'funding',100,?)`).run("store-funding-1","store-customer-00000001","store-receipt-1");
 db.prepare(`INSERT INTO api_keys(key_id,user_id,hmac_sha256,scopes_json,expires_at)
  VALUES(?,?,?, ?,?)`).run("store-key-00000001","store-customer-00000001","b".repeat(64),
   '["risk-gate:read"]',future);
 const insert=db.prepare(`INSERT INTO customer_store_risk_gate_usage
  (user_id,request_id,key_id,grant_id,receipt_id,tier,charge_cents)
  VALUES(?,?,?,?,?,?,?)`);
 insert.run("store-customer-00000001","store-usage-001","store-key-00000001",
  "store-grant-1","store-receipt-1","basic_focused",15);
 assert.throws(()=>insert.run("store-customer-00000001","store-usage-002","store-key-00000001",
  "store-grant-1","store-receipt-1","standard",20),/STORE_RISK_GATE_INSUFFICIENT_RECHARGE_BALANCE/u);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM customer_store_risk_gate_usage").get().n,1);
 db.close();
});

test("enabled Store delivers signed Basic/Standard decisions and atomically debits monthly receipt cents",async()=>{
 for(const [tier,events,publishers,expectedCharge] of [
  ["basic_focused",1,1,15],["standard",1,2,20],
 ]){
  const f=envFor({enabled:"YES",events,publishers});
  const body={...fixture,request_id:`store-${tier}-request-001`,tier,category:"geopolitics"};
  const response=await storeRiskGateD1(request(body),f.env,Date.parse("2026-11-12T12:00:00Z"));
  const result=await response.json();
  assert.equal(response.status,200,JSON.stringify(result));
  assert.equal(result.issuer,"Geomacro");
  assert.equal(result.commercial_signatory,"Geomacro");
  assert.equal(result.resale_permitted,false);
  assert.equal(result.execution_authorized,false);
  assert.equal(result.decision_signature_scheme,"Ed25519");
  assert.equal(verifyEd25519(null,Buffer.from(canonicalProgressiveJson(result.decision_signed_payload)),
   f.publicKey,Buffer.from(result.decision_signature_b64,"base64")),true);
  assert.equal(result.charge_cents,expectedCharge);
  assert.equal(f.debits.length,1);
  assert.equal(f.debits[0].charge_cents,expectedCharge);
 }
});

test("depleted Store recharge returns 402 and insufficient evidence is free",async()=>{
 const depleted=envFor({enabled:"YES",events:1,depleted:true});
 const response=await storeRiskGateD1(request({...fixture,request_id:"store-depleted-request-01"}),
  depleted.env,Date.parse("2026-11-12T12:00:00Z"));
 assert.equal(response.status,402);
 assert.equal((await response.json()).error,"INSUFFICIENT_RECHARGE_BALANCE");
 const empty=envFor({enabled:"YES",events:0});
 const noEvidence=await storeRiskGateD1(request({...fixture,request_id:"store-no-evidence-001"}),
  empty.env,Date.parse("2026-11-12T12:00:00Z"));
 const result=await noEvidence.json();
 assert.equal(noEvidence.status,200);
 assert.equal(result.charge_usdc,"0.00");
 assert.equal(result.charge_cents,0);
 assert.equal(empty.debits.length,0);
});
