import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {PREDGE_PAID_RISK_GATE_V2,predgePaidRiskGateTerms,usdcFromCents}
 from "../../workers/control-plane/src/predge-paid-risk-gate-contract.mjs";
import {parseRequest,predgePaidTrafficEnabled} from "../../workers/control-plane/src/predge-risk-gate-d1.mjs";

test("Predge Addendum v2 fee split and Arc settlement are explicit",()=>{
 assert.equal(PREDGE_PAID_RISK_GATE_V2.channel,"predge_b2b");
 assert.equal(PREDGE_PAID_RISK_GATE_V2.settlement_rail,"circle_arc");
 assert.equal(PREDGE_PAID_RISK_GATE_V2.settlement_network,"arc");
 assert.equal(PREDGE_PAID_RISK_GATE_V2.usage_report_due_day,5);
 assert.equal(PREDGE_PAID_RISK_GATE_V2.settlement_due_day,10);
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
 put.run("e".repeat(64),"123e4567-e89b-52d3-a456-426614174003","req-pilot-free",
  "predge_b2b","standard","STANDARD_DUAL_ORIGINAL_GRO_V1",20,15,0,0,0,"PILOT_FREE","PILOT_FREE",
  "d".repeat(64),"e".repeat(64),"2026-11-12T00:00:00Z","2026-11","2026-12-05","2026-12-10");
 for(const status of ["INSUFFICIENT_EVIDENCE","UNDELIVERED","REFUNDED"]){
  assert.throws(()=>put.run("d".repeat(64),"123e4567-e89b-52d3-a456-426614174001",`req-${status}`,
   "predge_b2b","standard","STANDARD_DUAL_ORIGINAL_GRO_V1",20,15,15,5,1,"PAID_ADDENDUM_V2",status,
   "b".repeat(64),"c".repeat(64),"2026-11-12T00:00:00Z","2026-11","2026-12-05","2026-12-10"));
 }
 assert.equal(db.prepare("SELECT billable,geomacro_fee_usdc_cents FROM predge_paid_risk_gate_usage_ledger").get().geomacro_fee_usdc_cents,0);
 db.close();
});

test("D1 ledger permits a delivered pre-go-live pilot entry only as zero-fee",()=>{
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync("workers/control-plane/migrations/0131_predge_paid_risk_gate_addendum_v2.sql","utf8"));
 const put=db.prepare(`INSERT INTO predge_paid_risk_gate_usage_ledger
  (ledger_id,verdict_id,request_id,channel,tier,structure_type,
   customer_price_usdc_cents,contract_geomacro_fee_usdc_cents,
   geomacro_fee_usdc_cents,predge_share_usdc_cents,billable,billing_mode,
   entry_status,request_hash,response_sha256,created_at,usage_month,
   usage_report_due_date,settlement_due_date)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
 put.run("f".repeat(64),"123e4567-e89b-52d3-a456-426614174004","req-prelaunch-free",
  "predge_b2b","basic_focused","BASIC_FOCUSED_FACTS_DERIVED_V1",15,10,0,0,0,
  "PILOT_FREE","PILOT_FREE","f".repeat(64),"e".repeat(64),
  "2026-11-12T00:00:00Z","2026-11","2026-12-05","2026-12-10");
 assert.equal(db.prepare("SELECT billable,geomacro_fee_usdc_cents FROM predge_paid_risk_gate_usage_ledger WHERE request_id='req-prelaunch-free'").get().geomacro_fee_usdc_cents,0);
 assert.equal(db.prepare("SELECT count(*) AS n FROM predge_paid_risk_gate_monthly_usage_report").get().n,0);
 db.close();
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
 const pilot=JSON.parse(readFileSync("config/predge-research-continuity-lock.v1.json","utf8"));
 assert.equal(pilot.pilot_end,"2027-01-17T00:00:00.000Z");
});

test("Stage 3 rehearsal reads account billing through its dedicated token binding",()=>{
 const workflow=readFileSync(".github/workflows/d1-step3-v2-shadow-only-rehearsal.yml","utf8");
 assert.match(workflow,/CLOUDFLARE_BILLING_READ_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_BILLING_READ_TOKEN \}\}/u);
});
