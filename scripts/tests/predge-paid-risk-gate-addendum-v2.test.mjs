import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {generateKeyPairSync} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {PREDGE_PAID_RISK_GATE_V2,predgePaidRiskGateTerms,usdcFromCents}
 from "../../workers/control-plane/src/predge-paid-risk-gate-contract.mjs";
import {parseRequest,predgePaidTrafficEnabled,predgePaidRiskGateD1,predgeRiskGateD1,verifyPredgePaidVerdictD1} from "../../workers/control-plane/src/predge-risk-gate-d1.mjs";

test("Predge Addendum v2 fee split and Arc settlement are explicit",()=>{
 assert.equal(PREDGE_PAID_RISK_GATE_V2.channel,"predge_b2b");
 assert.equal(PREDGE_PAID_RISK_GATE_V2.settlement_rail,"circle_arc");
 assert.equal(PREDGE_PAID_RISK_GATE_V2.settlement_network,"arc");
 assert.equal(PREDGE_PAID_RISK_GATE_V2.usage_report_due_day,5);
 assert.equal(PREDGE_PAID_RISK_GATE_V2.usage_report_due_month,"FOLLOWING_MONTH");
 assert.equal(PREDGE_PAID_RISK_GATE_V2.settlement_due_day,10);
 assert.equal(PREDGE_PAID_RISK_GATE_V2.settlement_due_month,"FOLLOWING_MONTH");
 assert.equal(PREDGE_PAID_RISK_GATE_V2.alternate_settlement_network_requires_mutual_email_agreement,true);
 assert.equal(PREDGE_PAID_RISK_GATE_V2.term,"INDEFINITE_UNTIL_TERMINATED");
 assert.equal(PREDGE_PAID_RISK_GATE_V2.paid_traffic_default_enabled,false);
 assert.equal(PREDGE_PAID_RISK_GATE_V2.paid_traffic_enablement_requires_go_live_and_72h_crosscheck,true);
 for(const [tier,price,fee,structure] of [
  ["basic_focused",15,10,"BASIC_FOCUSED_FACTS_DERIVED_V1"],
  ["standard",20,15,"STANDARD_DUAL_ORIGINAL_GRO_V1"],
  ["complex_full",30,25,"COMPLEX_7D_CORRIDOR_SYNTHESIS_V1"],
 ]){
  const row=predgePaidRiskGateTerms(tier);
  assert.equal(row.customer_price_usdc_cents,price);
  assert.equal(row.geomacro_fee_usdc_cents,fee);
  assert.equal(row.predge_share_usdc_cents,5);
  assert.equal(row.structure_type,structure);
  assert.equal(usdcFromCents(price),({15:"0.15",20:"0.20",30:"0.30"})[price]);
 }
});

test("Predge request parser requires an explicit pre-processing tier",()=>{
 const request=JSON.parse(readFileSync("docs/partners/predge/risk-gate-paid-request.json","utf8"));
 const paidRequest=JSON.parse(readFileSync("docs/partners/predge/risk-gate-paid-request.json","utf8"));
 assert.equal(parseRequest(request)?.tier,"basic_focused");
 assert.equal(parseRequest(paidRequest)?.tier,"basic_focused");
 assert.equal(paidRequest.policy.policy_id,"predge-paid-traffic-addendum-v2");
 const {tier,...withoutTier}=request;
 assert.equal(parseRequest(withoutTier),null);
});

test("optional Hot50 category selection normalizes the three supported cells",()=>{
 const request=JSON.parse(readFileSync("docs/partners/predge/risk-gate-paid-request.json","utf8"));
 for(const [input,expected] of [["geopolitics","geopolitics"],["macro","macro"],
  ["critical_minerals","critical_minerals"],["rare_earth","critical_minerals"]])
  assert.equal(parseRequest({...request,category:input})?.category,expected);
 assert.equal(parseRequest({...request,category:"unverified_category"}),null);
});

test("paid billing stays off until protected go-live cross-check and paid policy are all present",()=>{
 assert.equal(predgePaidTrafficEnabled({}, {policy_id:"predge-paid-traffic-addendum-v2"}),false);
 assert.equal(predgePaidTrafficEnabled({PREDGE_PAID_TRAFFIC_ENABLED:"YES"},
  {policy_id:"predge-paid-traffic-addendum-v2"}),false);
 assert.equal(predgePaidTrafficEnabled({PREDGE_PAID_TRAFFIC_ENABLED:"YES",
  PREDGE_PAID_GO_LIVE_CROSSCHECK:"PASS"},{policy_id:"predge-free-pilot-review-only"}),false);
 assert.equal(predgePaidTrafficEnabled({PREDGE_PAID_TRAFFIC_ENABLED:"YES",
  PREDGE_PAID_GO_LIVE_CROSSCHECK:"PASS"},{policy_id:"predge-paid-traffic-addendum-v2"}),true);
});

test("D1 usage ledger rejects charges on insufficient, undelivered, and refunded outcomes",()=>{
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync("workers/control-plane/migrations/0131_predge_paid_risk_gate_addendum_v2.sql","utf8"));
 const put=db.prepare(`INSERT INTO predge_paid_risk_gate_usage_ledger
  (ledger_id,verdict_id,request_id,channel,tier,structure_type,
   customer_price_usdc_cents,contract_geomacro_fee_usdc_cents,
   geomacro_fee_usdc_cents,predge_share_usdc_cents,billable,billing_mode,entry_status,
   request_hash,response_sha256,created_at,usage_month,usage_report_due_date,
   settlement_due_date)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
 const common=["a".repeat(64),"123e4567-e89b-52d3-a456-426614174000","req-1",
  "predge_b2b","standard","STANDARD_DUAL_ORIGINAL_GRO_V1",20,15];
 put.run(...common,0,0,0,"PAID_ADDENDUM_V2","INSUFFICIENT_EVIDENCE","b".repeat(64),"c".repeat(64),"2026-11-12T00:00:00Z","2026-11","2026-12-05","2026-12-10");
 for(const status of ["INSUFFICIENT_EVIDENCE","UNDELIVERED","REFUNDED"]){
  assert.throws(()=>put.run("d".repeat(64),"123e4567-e89b-52d3-a456-426614174001",`req-${status}`,
   "predge_b2b","standard","STANDARD_DUAL_ORIGINAL_GRO_V1",20,15,15,5,1,"PAID_ADDENDUM_V2",status,
   "b".repeat(64),"c".repeat(64),"2026-11-12T00:00:00Z","2026-11","2026-12-05","2026-12-10"));
 }
 assert.equal(db.prepare("SELECT billable,geomacro_fee_usdc_cents FROM predge_paid_risk_gate_usage_ledger").get().geomacro_fee_usdc_cents,0);
 db.close();
});

test("paid D1 ledger rejects all free-pilot rows",()=>{
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync("workers/control-plane/migrations/0131_predge_paid_risk_gate_addendum_v2.sql","utf8"));
 const put=db.prepare(`INSERT INTO predge_paid_risk_gate_usage_ledger
  (ledger_id,verdict_id,request_id,channel,tier,structure_type,
   customer_price_usdc_cents,contract_geomacro_fee_usdc_cents,
   geomacro_fee_usdc_cents,predge_share_usdc_cents,billable,billing_mode,
   entry_status,request_hash,response_sha256,created_at,usage_month,
   usage_report_due_date,settlement_due_date)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
 assert.throws(()=>put.run("f".repeat(64),"123e4567-e89b-52d3-a456-426614174004","req-prelaunch-free",
  "predge_b2b","basic_focused","BASIC_FOCUSED_FACTS_DERIVED_V1",15,10,0,0,0,
  "PILOT_FREE","PILOT_FREE","f".repeat(64),"e".repeat(64),
  "2026-11-12T00:00:00Z","2026-11","2026-12-05","2026-12-10"));
 assert.equal(db.prepare("SELECT count(*) AS n FROM predge_paid_risk_gate_monthly_usage_report").get().n,0);
 db.close();
});

test("paid and legacy free routes are distinct and free traffic cannot touch paid D1",async()=>{
 const token="a".repeat(64),paidToken="b".repeat(64),requestBody=JSON.parse(readFileSync("docs/partners/predge/risk-gate-paid-request.json","utf8"));
 requestBody.request_id="endpoint-isolation-fixture";
 let d1Calls=0;
 const env={PREDGE_RISK_GATE_TOKEN:token,PREDGE_PAID_RISK_GATE_TOKEN:paidToken,
  DB:{prepare(){d1Calls++;throw Error("paid gate must not query D1 while disabled")}}};
 const makeRequest=(path,bearer)=>new Request("https://worker.example"+path,{
  method:"POST",headers:{authorization:"Bearer "+bearer,"content-type":"application/json"},body:JSON.stringify(requestBody)});
 const paid=await predgePaidRiskGateD1(makeRequest("/v2/partner/predge/paid-risk-gate",paidToken),env,Date.parse("2026-11-12T00:00:00Z"));
 assert.equal(paid.status,403);assert.equal((await paid.json()).error,"PAID_TRAFFIC_NOT_ENABLED");
 const legacy=await predgeRiskGateD1(makeRequest("/v1/partner/predge/risk-gate",token),env,Date.parse("2026-11-12T00:00:00Z"));
 assert.equal(legacy.status,409);assert.equal((await legacy.json()).error,"PAID_ADDENDUM_REQUIRES_VERSIONED_ENDPOINT");
 assert.equal(d1Calls,0);
 const router=readFileSync("workers/control-plane/src/index.mjs","utf8");
 assert.ok(router.includes('url.pathname==="/v1/partner/predge/risk-gate"'));
 assert.ok(router.includes('return predgeRiskGateD1(request,env);'));
 assert.ok(router.includes('url.pathname==="/v2/partner/predge/paid-risk-gate"'));
 assert.ok(router.includes('return predgePaidRiskGateD1(request,env);'));
 assert.ok(router.includes('url.pathname==="/v2/partner/predge/verify-verdict"'));
 assert.ok(router.includes('return verifyPredgePaidVerdictD1(request,env);'));
});

test("D1 refund transition zeroes all fees and cannot be reopened",()=>{
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync("workers/control-plane/migrations/0131_predge_paid_risk_gate_addendum_v2.sql","utf8"));
 db.prepare(`INSERT INTO predge_paid_risk_gate_usage_ledger
  (ledger_id,verdict_id,request_id,channel,tier,structure_type,
   customer_price_usdc_cents,contract_geomacro_fee_usdc_cents,
   geomacro_fee_usdc_cents,predge_share_usdc_cents,billable,billing_mode,entry_status,
   request_hash,response_sha256,created_at,usage_month,usage_report_due_date,settlement_due_date)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run("a".repeat(64),
   "123e4567-e89b-52d3-a456-426614174002","req-refund","predge_b2b","standard",
   "STANDARD_DUAL_ORIGINAL_GRO_V1",20,15,15,5,1,"PAID_ADDENDUM_V2","DELIVERED","b".repeat(64),
   "c".repeat(64),"2026-11-12T00:00:00Z","2026-11","2026-12-05","2026-12-10");
 db.prepare(`UPDATE predge_paid_risk_gate_usage_ledger SET entry_status='REFUNDED',
  billable=0,geomacro_fee_usdc_cents=0,predge_share_usdc_cents=0,
  settlement_status='REFUNDED' WHERE request_id='req-refund'`).run();
 const row=db.prepare("SELECT billable,geomacro_fee_usdc_cents,predge_share_usdc_cents FROM predge_paid_risk_gate_usage_ledger WHERE request_id='req-refund'").get();
 assert.deepEqual({...row},{billable:0,geomacro_fee_usdc_cents:0,predge_share_usdc_cents:0});
 assert.throws(()=>db.prepare(`UPDATE predge_paid_risk_gate_usage_ledger SET entry_status='DELIVERED',
   billable=1,geomacro_fee_usdc_cents=15,predge_share_usdc_cents=5,
   settlement_status='AWAITING_COLLECTION_REPORT' WHERE request_id='req-refund'`).run());
 db.close();
});

test("paid partner terms do not replace direct Store / Intelligence API pricing or pilot continuity",()=>{
 const contract=JSON.parse(readFileSync("config/decision-intelligence-commercial-contract.json","utf8"));
 const manifest=JSON.parse(readFileSync("config/commercial-launch-manifest.json","utf8"));
 const predge=contract.partner_channels.predge_b2b_risk_gate;
 const direct=contract.partner_channels.direct_store_intelligence;
 assert.deepEqual(direct.per_call_usdc,["0.02","0.03","0.05"]);
 assert.deepEqual(direct.plans_usd,["9","29","99"]);
 assert.equal(direct.inherits_predge_b2b_prices,false);
 assert.equal(manifest.partner_contracts.predge_paid_risk_gate.term.expires_at,null);
 assert.equal(predge.expires_at,null);
 assert.equal(predge.worker_endpoint_path,"/v2/partner/predge/paid-risk-gate");
 assert.equal(predge.separate_from_noncommercial_pilot,true);
 assert.equal(predge.settlement.usage_report_due_month,"FOLLOWING_MONTH");
 assert.equal(predge.settlement.payment_due_month,"FOLLOWING_MONTH");
 assert.equal(predge.settlement.alternate_network_requires_mutual_email_agreement,true);
 const pilot=JSON.parse(readFileSync("config/predge-research-continuity-lock.v1.json","utf8"));
 assert.equal(pilot.pilot_end,"2027-01-17T00:00:00.000Z");
});

test("Stage 3 rehearsal reads account billing through its dedicated token binding",()=>{
 const workflow=readFileSync(".github/workflows/d1-step3-v2-shadow-only-rehearsal.yml","utf8");
 assert.match(workflow,/CLOUDFLARE_BILLING_READ_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_BILLING_READ_TOKEN \}\}/u);
});


function paidRiskGateFixtureDb(){
 const requests=new Map(),ledger=new Map(),receipts=new Map();
 const key=(client,id)=>client+"|"+id;
 return {prepare(sql){
  let values=[];
  return {bind(...args){values=args;return this;},
   async first(){
    if(sql.includes("FROM risk_gate_d1_requests")&&sql.includes("client_id=? AND request_id=?")){
     const row=requests.get(key(values[0],values[1]));return row?{...row}:null;
    }
    if(sql.includes("INSERT OR IGNORE INTO risk_gate_d1_requests")&&sql.includes("predge-paid-license-scope-v1")){
     const [id,hash,subjectType,subjectId,createdAt]=values;
     const k=key("predge-paid-license-scope-v1",id);
     if(requests.has(k))return null;
     requests.set(k,{request_id:id,request_hash:hash,subject_type:subjectType,subject_id:subjectId,created_at:createdAt,state:"CLAIMED"});
     return {request_id:id};
    }
    if(sql.includes("client_id='predge-paid-license-scope-v1'")){
     const row=requests.get(key("predge-paid-license-scope-v1",values[0]));
     return row?{request_id:values[0]}:null;
    }
    if(sql.includes("UPDATE risk_gate_d1_requests SET state='CLAIMED'")){
     const row=requests.get(key(values[0],values[1]));
     if(!row||row.state!=="PENDING")return null;
     row.state="CLAIMED";return {request_id:values[1]};
    }
    if(sql.includes("UPDATE risk_gate_d1_requests")&&sql.includes("SET state='DONE'")){
     const row=requests.get(key(values[4],values[5]));
     if(!row||row.state!=="CLAIMED")return null;
     row.state="DONE";row.response_json=values[0];row.finished_at=values[1];return {request_id:values[5]};
    }
    if(sql.includes("INSERT INTO risk_gate_d1_quota"))return {used:1};
    if(sql.includes("FROM predge_paid_risk_gate_usage_ledger")){
     const row=ledger.get(values[0])||[...ledger.values()].find(item=>
      values.includes(item.request_id)||values.includes(item.verdict_id));
     return row?{verdict_id:row.verdict_id,request_hash:row.request_hash,
      response_sha256:row.response_sha256,billing_mode:row.billing_mode,
      entry_status:row.entry_status,billable:row.billable,
      geomacro_fee_usdc_cents:row.geomacro_fee_usdc_cents,
      usage_report_due_date:row.usage_report_due_date,
      settlement_due_date:row.settlement_due_date}:null;
    }
    if(sql.includes("FROM risk_gate_audit_receipts")){
     return receipts.get(values[0])??null;
    }
    return null;
   },
   async run(){
    if(sql.includes("INSERT OR IGNORE INTO risk_gate_d1_requests")&&!sql.includes("predge-paid-license-scope-v1")){
     const [client,requestId,requestHash,subjectType,subjectId,createdAt]=values;
     const k=key(client,requestId);
     if(!requests.has(k))requests.set(k,{request_hash:requestHash,subject_type:subjectType,subject_id:subjectId,created_at:createdAt,state:"PENDING"});
     return {success:true};
    }
    if(sql.includes("INSERT INTO predge_paid_risk_gate_usage_ledger")){
     const [ledgerId,verdictId,requestId,channel,tier,structureType,price,contractFee,contractPredge,
       geomacroFee,predgeShare,billable,billingMode,status,requestHash,responseHash,createdAt,usageMonth,reportDate,settlementDate]=values;
     ledger.set(requestId,{ledger_id:ledgerId,verdict_id:verdictId,request_id:requestId,channel,tier,
      structure_type:structureType,customer_price_usdc_cents:price,
      contract_geomacro_fee_usdc_cents:contractFee,contract_predge_share_usdc_cents:contractPredge,
      geomacro_fee_usdc_cents:geomacroFee,predge_share_usdc_cents:predgeShare,billable,
      billing_mode:billingMode,entry_status:status,request_hash:requestHash,response_sha256:responseHash,
      created_at:createdAt,usage_month:usageMonth,usage_report_due_date:reportDate,settlement_due_date:settlementDate});
     return {success:true};
    }
    if(sql.includes("INSERT OR IGNORE INTO risk_gate_audit_receipts")){
     const names=["receipt_id","client_id","request_id","request_hash","subject_type","subject_id","decision",
      "policy_id","policy_version","evaluated_at","response_hash","execution_authorized","audit_receipt_hash",
      "created_at","signature_key_id","signature_scheme","audit_receipt_signature"];
     receipts.set(values[0],Object.fromEntries(names.map((name,i)=>[name,values[i]])));
     return {success:true};
    }
    return {success:true};
   }};
 }};
}

test("paid Risk Gate verdict is signed for one use and rejects replay or resale",async()=>{
 const fixture=JSON.parse(readFileSync("docs/partners/predge/risk-gate-paid-request.json","utf8"));
 const {publicKey,privateKey}=generateKeyPairSync("ed25519");
 const env={PREDGE_RISK_GATE_TOKEN:"a".repeat(64),PREDGE_PAID_RISK_GATE_TOKEN:"b".repeat(64),
  PREDGE_PAID_TRAFFIC_ENABLED:"YES",PREDGE_PAID_GO_LIVE_CROSSCHECK:"PASS",
  RISK_GATE_DECISION_ED25519_KEY_ID:"geomacro-risk-test",
  RISK_GATE_DECISION_ED25519_PRIVATE_KEY_PKCS8_B64:privateKey.export({format:"der",type:"pkcs8"}).toString("base64"),
  RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64:publicKey.export({format:"der",type:"spki"}).toString("base64"),
  RISK_GATE_OBSERVATION_HMAC_KEY:"h".repeat(64),DB:paidRiskGateFixtureDb()};
 const makeRequest=(body,path="/v2/partner/predge/paid-risk-gate")=>new Request("https://worker.example"+path,{
  method:"POST",headers:{authorization:"Bearer "+"b".repeat(64),"content-type":"application/json"},
  body:JSON.stringify(body)});
 const now=Date.parse("2026-11-12T00:00:00Z");
 const first=await predgePaidRiskGateD1(makeRequest(fixture),env,now);
 const firstBody=await first.json();
 assert.equal(first.status,200,JSON.stringify(firstBody));
 assert.equal(firstBody.ok,true);
 assert.equal(Object.hasOwn(firstBody,"error"),false);
 assert.deepEqual(firstBody.decision_signed_payload.license_scope,{
  licensee:"predge",max_uses:1,resale_permitted:false,bound_subject_id:"USA",
  bound_market_id:"123456789",
  bound_condition_id:"0x0000000000000000000000000000000000000000000000000000000000000000"});
 assert.equal(firstBody.decision_signature_scheme,"Ed25519");
 const expectedError="REDISTRIBUTION_OR_RESELL_AUTHORIZATION_FAILED";
 const expectedMessage="Authorization failed: Single-use Risk Gate license already consumed or unauthorized resale/redistribution detected. Explicit permission from Geomacro's end is required. Contact: contact@geomacro.live";
 for(const reused of [fixture,{...fixture,action_context:{...fixture.action_context,metadata:{...fixture.action_context.metadata,market_id:"different-market"}}},
   {...fixture,request_id:"paid-resale-new-request"}]){
  const response=await predgePaidRiskGateD1(makeRequest(reused),env,now);
  const body=await response.json();
  assert.equal(response.status,403);
  assert.equal(body.error,expectedError);
  assert.equal(body.execution_authorized,false);
  assert.equal(body.message,expectedMessage);
 }
 const verify=await verifyPredgePaidVerdictD1(makeRequest({verdict_id:firstBody.verdict_id,
  request_id:undefined,subject:undefined,policy:undefined,tier:undefined,action_context:undefined},
  "/v2/partner/predge/verify-verdict"),env);
 const verifyBody=await verify.json();
 assert.equal(verify.status,403);
 assert.equal(verifyBody.error,expectedError);
 assert.equal(verifyBody.message,expectedMessage);
});

test("paid deployment bindings default to the fail-closed 403 path",()=>{
 const deploy=readFileSync(".github/workflows/deploy-d1-control-plane.yml","utf8");
 const rollout=readFileSync(".github/workflows/geomacro-protected-hot50-worker-rollout.yml","utf8");
 assert.match(deploy,/PREDGE_PAID_TRAFFIC_ENABLED:\s*\$\{\{\s*vars\.PREDGE_PAID_TRAFFIC_ENABLED\s*\|\|\s*'NO'\s*\}\}/u);
 assert.match(deploy,/PREDGE_PAID_GO_LIVE_CROSSCHECK:\s*\$\{\{\s*vars\.PREDGE_PAID_GO_LIVE_CROSSCHECK\s*\|\|\s*''\s*\}\}/u);
 assert.match(deploy,/config\.vars\.PREDGE_PAID_TRAFFIC_ENABLED\s*=\s*paidTrafficEnabled/u);
 assert.match(deploy,/delete config\.vars\.PREDGE_PAID_GO_LIVE_CROSSCHECK/u);
 assert.match(deploy,/PREDGE_PAID_RISK_GATE_TOKEN:\s*\$\{\{\s*secrets\.PREDGE_PAID_RISK_GATE_TOKEN\s*\}\}/u);
 assert.match(deploy,/if test -n "\$\{PREDGE_PAID_RISK_GATE_TOKEN:-\}"; then[\s\S]*?secret put PREDGE_PAID_RISK_GATE_TOKEN[\s\S]*?fi/u);
 assert.match(rollout,/PREDGE_PAID_TRAFFIC_ENABLED:\s*\$\{\{\s*vars\.PREDGE_PAID_TRAFFIC_ENABLED\s*\|\|\s*'NO'\s*\}\}/u);
 assert.match(rollout,/PREDGE_PAID_GO_LIVE_CROSSCHECK:\s*\$\{\{\s*vars\.PREDGE_PAID_GO_LIVE_CROSSCHECK\s*\|\|\s*''\s*\}\}/u);
 assert.equal(predgePaidTrafficEnabled({}, {policy_id:"predge-paid-traffic-addendum-v2"}),false);
 assert.equal(predgePaidTrafficEnabled({PREDGE_PAID_TRAFFIC_ENABLED:"YES"},
  {policy_id:"predge-paid-traffic-addendum-v2"}),false);
});
