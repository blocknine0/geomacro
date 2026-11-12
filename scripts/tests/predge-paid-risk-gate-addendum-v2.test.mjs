import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {PREDGE_PAID_RISK_GATE_V2,predgePaidRiskGateTerms,usdcFromCents}
 from "../../workers/control-plane/src/predge-paid-risk-gate-contract.mjs";
import {parseRequest} from "../../workers/control-plane/src/predge-risk-gate-d1.mjs";

test("Predge Addendum v2 fee split and Arc settlement are explicit",()=>{
 assert.equal(PREDGE_PAID_RISK_GATE_V2.channel,"predge_b2b");
 assert.equal(PREDGE_PAID_RISK_GATE_V2.settlement_rail,"circle_arc");
 assert.equal(PREDGE_PAID_RISK_GATE_V2.settlement_network,"arc");
 assert.equal(PREDGE_PAID_RISK_GATE_V2.usage_report_due_day,5);
 assert.equal(PREDGE_PAID_RISK_GATE_V2.settlement_due_day,10);
 assert.equal(PREDGE_PAID_RISK_GATE_V2.term,"INDEFINITE_UNTIL_TERMINATED");
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
 const request=JSON.parse(readFileSync("docs/partners/predge/risk-gate-request.json","utf8"));
 assert.equal(parseRequest(request)?.tier,"basic_focused");
 const {tier,...withoutTier}=request;
 assert.equal(parseRequest(withoutTier),null);
});

test("D1 usage ledger rejects charges on insufficient, undelivered, and refunded outcomes",()=>{
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync("workers/control-plane/migrations/0131_predge_paid_risk_gate_addendum_v2.sql","utf8"));
 const put=db.prepare(`INSERT INTO predge_paid_risk_gate_usage_ledger
  (ledger_id,verdict_id,request_id,channel,tier,structure_type,
   customer_price_usdc_cents,contract_geomacro_fee_usdc_cents,
   geomacro_fee_usdc_cents,predge_share_usdc_cents,billable,entry_status,
   request_hash,response_sha256,created_at,usage_month)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
 const common=["a".repeat(64),"123e4567-e89b-52d3-a456-426614174000","req-1",
  "predge_b2b","standard","STANDARD_DUAL_ORIGINAL_GRO_V1",20,15];
 put.run(...common,0,0,0,"INSUFFICIENT_EVIDENCE","b".repeat(64),"c".repeat(64),"2026-11-12T00:00:00Z","2026-11");
 for(const status of ["INSUFFICIENT_EVIDENCE","UNDELIVERED","REFUNDED"]){
  assert.throws(()=>put.run("d".repeat(64),"123e4567-e89b-52d3-a456-426614174001",`req-${status}`,
   "predge_b2b","standard","STANDARD_DUAL_ORIGINAL_GRO_V1",20,15,15,5,1,status,
   "b".repeat(64),"c".repeat(64),"2026-11-12T00:00:00Z","2026-11"));
 }
 assert.equal(db.prepare("SELECT billable,geomacro_fee_usdc_cents FROM predge_paid_risk_gate_usage_ledger").get().geomacro_fee_usdc_cents,0);
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
