import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {generateKeyPairSync} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {parseRequest,predgePaidRiskGateD1,predgeRiskGateD1} from "../../workers/control-plane/src/predge-risk-gate-d1.mjs";

const now=Date.parse("2026-11-12T00:00:00Z");
const freeRequest=JSON.parse(readFileSync("docs/partners/predge/risk-gate-request.json","utf8"));
const paidRequest=JSON.parse(readFileSync("docs/partners/predge/risk-gate-paid-request.json","utf8"));
const {privateKey,publicKey}=generateKeyPairSync("ed25519");
const privateB64=privateKey.export({format:"der",type:"pkcs8"}).toString("base64");
const publicB64=publicKey.export({format:"der",type:"spki"}).toString("base64");
const MESSAGE="Authorization failed: Single-use Risk Gate license already consumed or unauthorized resale/redistribution detected. Permission from Geomacro's end is required. Contact: contact@geomacro.live";

class MemoryD1 {
 constructor(){this.claims=new Map();this.licenses=new Map();this.audit=new Map();this.paid=new Map();this.used=0;}
 prepare(sql){
  const db=this;let args=[];
  return {bind(...values){args=values;return this;},
   async run(){
    if(sql.includes("INSERT OR IGNORE INTO risk_gate_d1_requests")){
      const key=args[0]+"|"+args[1];
      if(!db.claims.has(key))db.claims.set(key,{request_hash:args[2],state:"PENDING",response_json:null});
      return {success:true};
    }
    if(sql.includes("INSERT INTO risk_gate_audit_receipts")){
      const keys=["receipt_id","client_id","request_id","request_hash","subject_type","subject_id","decision","policy_id","policy_version","evaluated_at","response_hash","execution_authorized","audit_receipt_hash","created_at","signature_key_id","signature_scheme","audit_receipt_signature"];
      db.audit.set(args[0],Object.fromEntries(keys.map((k,i)=>[k,args[i]])));
      return {success:true};
    }
    if(sql.includes("INSERT INTO predge_risk_gate_verdict_license")){
      if([...db.licenses.values()].some(x=>x.request_id===args[1])||db.licenses.has(args[0]))throw Error("UNIQUE_SINGLE_USE_LICENSE");
      const keys=["verdict_id","request_id","client_id","licensee_id","max_commercial_uses","consumption_count","resale_permitted","transferable","subject_json","action_context_json","market_id","condition_id","downstream_caller","request_hash","license_payload_sha256","created_at"];
      db.licenses.set(args[0],Object.fromEntries(keys.map((k,i)=>[k,args[i]??({licensee_id:"predge",max_commercial_uses:1,consumption_count:1,resale_permitted:0,transferable:0}[k]) ])));
      return {success:true};
    }
    if(sql.includes("INSERT INTO predge_paid_risk_gate_usage_ledger")){
      const keys=["ledger_id","verdict_id","request_id","channel","tier","structure_type","customer_price_usdc_cents","contract_geomacro_fee_usdc_cents","contract_predge_share_usdc_cents","geomacro_fee_usdc_cents","predge_share_usdc_cents","billable","billing_mode","entry_status","request_hash","response_sha256","created_at","usage_month","usage_report_due_date","settlement_due_date","subject_json","action_context_json","market_id","condition_id","downstream_caller","license_payload_sha256"];
      db.paid.set(args[2],Object.fromEntries(keys.map((k,i)=>[k,args[i]])));
      return {success:true};
    }
    return {success:true};
   },
   async first(){
    if(sql.includes("SELECT request_hash,state,response_json")&&sql.includes("FROM risk_gate_d1_requests")){
      return db.claims.get(args[0]+"|"+args[1])??null;
    }
    if(sql.includes("UPDATE risk_gate_d1_requests SET state='CLAIMED'")){
      const row=db.claims.get(args[0]+"|"+args[1]);if(!row||row.state!=="PENDING")return null;
      row.state="CLAIMED";return {request_id:args[1]};
    }
    if(sql.includes("INSERT INTO risk_gate_d1_quota")){
      if(db.used>=100)return null;db.used++;return {used:db.used};
    }
    if(sql.includes("FROM country_gro_verified_hot")||sql.includes("FROM corridor_gro_verified_hot"))return null;
    if(sql.includes("SELECT COUNT(*) AS unique_events")){
      return {unique_events:1,max_publisher_count:1,corroborated_events:0,
        corroborated_countries:0,latest_event_clock:new Date(now-60000).toISOString(),categories:"geopolitics"};
    }
    if(sql.includes("WITH native_events"))return {index_events:0,latest_index_clock:null,native_corroborated_publisher_count:0};
    if(sql.includes("FROM risk_gate_audit_receipts WHERE receipt_id"))return db.audit.get(args[0])??null;
    if(sql.includes("FROM predge_paid_risk_gate_usage_ledger WHERE request_id"))return db.paid.get(args[0])??null;
    if(sql.includes("UPDATE risk_gate_d1_requests")){
      const row=db.claims.get(args[4]+"|"+args[5]);if(!row||row.state!=="CLAIMED")return null;
      row.state="DONE";row.response_json=args[0];return {request_id:args[5]};
    }
    return null;
   },
  };
 }
}
function env(db,paid){
 const pair={PREDGE_RISK_GATE_TOKEN:"a".repeat(64),PREDGE_PAID_RISK_GATE_TOKEN:"b".repeat(64),
  CONTROL_PLANE_TOKEN:"c".repeat(64),PREDGE_RESEARCH_NEWS_TOKEN:"d".repeat(64),
  RISK_GATE_DECISION_ED25519_KEY_ID:"single-use-test-key",
  RISK_GATE_DECISION_ED25519_PRIVATE_KEY_PKCS8_B64:privateB64,
  RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64:publicB64,
  RISK_GATE_OBSERVATION_HMAC_KEY:"h".repeat(48),RISK_GATE_OBSERVATION_HMAC_KEY_ID:"test-hmac",
  DB:db};
 if(paid){pair.PREDGE_PAID_TRAFFIC_ENABLED="YES";pair.PREDGE_PAID_GO_LIVE_CROSSCHECK="PASS";}
 return pair;
}
function call(body,paid,db){
 const token=paid?"b".repeat(64):"a".repeat(64);
 const request=new Request("https://worker.example"+(paid?"/v2/partner/predge/paid-risk-gate":"/v1/partner/predge/risk-gate"),{
  method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify(body)});
 return paid?predgePaidRiskGateD1(request,env(db,true),now):predgeRiskGateD1(request,env(db,false),now);
}
for(const paid of [false,true]){
 const label=paid?"paid":"free";
 test(label+" first verdict is signed cleanly and duplicate request or market rebinding gets the exact 403",async()=>{
  const db=new MemoryD1(),fixture=structuredClone(paid?paidRequest:freeRequest);
  fixture.request_id="single-use-"+label+"-fixture";
  const first=await call(fixture,paid,db),body=await first.json();
  assert.equal(first.status,200);
  assert.equal(body.ok,true);
  assert.equal(body.error,undefined);
  assert.equal(body.message,undefined);
  assert.equal(body.execution_authorized,false);
  assert.equal(body.decision_signature_scheme,"Ed25519");
  assert.deepEqual(body.redistribution_lock,{
   licensee_id:"predge",max_commercial_uses:1,consumption_count:1,
   resale_permitted:false,transferable:false,subject:body.redistribution_lock.subject,
   action_context:fixture.action_context,market_id:fixture.action_context.metadata.market_id,
   condition_id:fixture.action_context.metadata.condition_id,downstream_caller:"predge"
  });
  const saved=[...db.licenses.values()][0];
  assert.equal(saved.licensee_id,"predge");
  assert.equal(saved.max_commercial_uses,1);
  assert.equal(saved.consumption_count,1);
  assert.equal(saved.resale_permitted,0);
  assert.equal(saved.transferable,0);
  assert.equal(saved.market_id,fixture.action_context.metadata.market_id);
  assert.equal(saved.condition_id,fixture.action_context.metadata.condition_id);
  if(paid){
   const row=db.paid.get(fixture.request_id);
   assert.equal(row.licensee_id,"predge");
   assert.equal(row.max_commercial_uses,1);
   assert.equal(row.consumption_count,1);
   assert.equal(row.resale_permitted,0);
   assert.equal(row.market_id,fixture.action_context.metadata.market_id);
   assert.equal(row.condition_id,fixture.action_context.metadata.condition_id);
   assert.equal(row.downstream_caller,"predge");
  }
  for(const attempted of [
   fixture,
   {...fixture,action_context:{...fixture.action_context,metadata:{...fixture.action_context.metadata,market_id:"987654321"}}},
   {...fixture,action_context:{...fixture.action_context,metadata:{...fixture.action_context.metadata,condition_id:"0x"+"1".repeat(64)}}},
   body
  ]){
   const replay=await call(attempted,paid,db),denied=await replay.json();
   assert.equal(replay.status,403);
   assert.equal(denied.error,"REDISTRIBUTION_OR_RESELL_AUTHORIZATION_FAILED");
   assert.equal(denied.execution_authorized,false);
   assert.equal(denied.message,MESSAGE);
  }
 });
}
test("request parser requires immutable market and condition binding",()=>{
 const invalid=structuredClone(freeRequest);delete invalid.action_context.metadata.condition_id;
 assert.equal(parseRequest(invalid,now),null);
});
test("0132 schema persists one-use nontransferable Predge bindings",()=>{
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync("workers/control-plane/migrations/0131_predge_paid_risk_gate_addendum_v2.sql","utf8"));
 db.exec(readFileSync("workers/control-plane/migrations/0132_predge_risk_gate_single_use_license.sql","utf8"));
 const columns=new Set(db.prepare("PRAGMA table_info(predge_paid_risk_gate_usage_ledger)").all().map(x=>x.name));
 for(const name of ["licensee_id","max_commercial_uses","consumption_count","resale_permitted",
  "transferable","subject_json","action_context_json","market_id","condition_id",
  "downstream_caller","license_payload_sha256"])assert.ok(columns.has(name),name);
 const table=db.prepare("SELECT name FROM sqlite_schema WHERE name='predge_risk_gate_verdict_license'").get();
 assert.equal(table.name,"predge_risk_gate_verdict_license");
 assert.throws(()=>db.prepare("INSERT INTO predge_risk_gate_verdict_license "+
  "(verdict_id,request_id,client_id,licensee_id,max_commercial_uses,consumption_count,"+
  "resale_permitted,transferable,subject_json,action_context_json,market_id,condition_id,"+
  "downstream_caller,request_hash,license_payload_sha256,created_at) "+
  "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
   "123e4567-e89b-52d3-a456-426614174000","request","predge-risk-gate-v1","predge",1,2,0,0,
   "{}", "{}", "123", "0x0", "predge","a".repeat(64),"b".repeat(64),new Date(now).toISOString()));
 db.close();
});
