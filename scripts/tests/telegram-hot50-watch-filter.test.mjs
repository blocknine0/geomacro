import test from "node:test";
import assert from "node:assert/strict";
import {hot50RiskGateWatchMatch,isHot50RiskGateWatchItem} from "../../workers/control-plane/src/hot50-telegram-watch-filter.mjs";
import {verifyTelegramLeadEnvelope,TELEGRAM_PROTOCOL_CONTRACT_SHA256} from "../verify-telegram-lead-envelope.mjs";
import {validateTelegramDurableIntake} from "../ops/intake-telegram-b2-d1-leads.mjs";
import {classifyHot50TelegramText} from "../../workers/control-plane/src/hot50-telegram-watch-filter.mjs";

const item=(country_iso3,category,headline)=>({country_iso3,category,headline});
test("only active Hot 50 cells and scoped Risk Gate event types pass",()=>{
 const cases=[
  [item("USA","GEOPOLITICS","Armed conflict escalates after border attack"),"conflict"],
  [item("IND","MACRO","Currency devaluation causes foreign exchange crisis"),"fx_sovereign_stress"],
  [item("CHL","CRITICAL_MINERALS","Lithium supply shock after export ban"),"critical_mineral_supply_shock"],
  [item("GBR","GEOPOLITICS","New sanctions target shipping through the strait"),"sanctions"],
 ];
 for(const [value,event] of cases){
  const result=hot50RiskGateWatchMatch(value);
  assert.equal(result.accepted,true);
  assert.equal(result.event,event);
 }
 assert.equal(isHot50RiskGateWatchItem(item("FJI","GEOPOLITICS","Armed conflict after attack")),false);
 assert.equal(isHot50RiskGateWatchItem(item("USA","GEOPOLITICS","Local sports event and road closure")),false);
 assert.equal(isHot50RiskGateWatchItem(item("USA","MACRO","Armed conflict after attack")),false);
 assert.equal(isHot50RiskGateWatchItem(item("USA","CRITICAL_MINERALS","Routine lithium mine production update")),false);
});
test("Telegram envelope admits only scoped UNVERIFIED watch leads",()=>{
 const base={schema:"geomacro.telegram-lead-envelope.v2",
  protocol_contract_sha256:TELEGRAM_PROTOCOL_CONTRACT_SHA256,
  source_id:"telegram_authorized_publisher_feed",source_channel_key:"approvedgov",
  source_record_id:12,published_at:"2026-11-14T20:00:00Z",category:"MACRO",
  verification_status:"UNVERIFIED",scoring_eligible:false,commercial_eligible:false,
  content_hash:"a".repeat(64),event_family_key:"b".repeat(64),
  headline:"Sovereign debt crisis triggers foreign exchange reserve stress",
  country_iso3:"IND"};
 const accepted=verifyTelegramLeadEnvelope(base);
 assert.equal(accepted.watch_event,"fx_sovereign_stress");
 assert.equal(accepted.verification_status,"UNVERIFIED");
 assert.equal(accepted.country_iso3,"IND");
 assert.throws(()=>verifyTelegramLeadEnvelope({...base,country_iso3:"FJI"}),
  /TELEGRAM_HOT50_WATCH_FILTERED/);
 assert.throws(()=>verifyTelegramLeadEnvelope({...base,headline:"Local meeting update"}),
  /TELEGRAM_HOT50_WATCH_FILTERED/);
});

test("D1 intake rejects out-of-watch scope before it can construct a persistence row",()=>{
 const signal="tg_"+"a".repeat(32),sha="b".repeat(64);
 const item={delivery_id:signal+"_"+sha.slice(0,16),signal_id:signal,
  source_channel_key:"approvedgov",source_record_id:12,
  b2_object_key:"telegram/leads/2026/11/14/approvedgov/12-"+sha.slice(0,16)+".json.gz",
  b2_sha256:sha,queue_state:"PENDING",verification_status:"UNVERIFIED",
  scoring_eligible:false,commercial_eligible:false,
  published_at:"2026-11-14T20:00:00Z"};
 const payload={source_id:"telegram_authorized_publisher_feed",
  source_channel_key:item.source_channel_key,source_record_id:12,
  published_at:item.published_at,headline:"TELEGRAM_LEAD_METADATA_ONLY",
  signal_category:"GEOPOLITICS",country_iso3:"USA",watch_event:"conflict",
  verification_status:"UNVERIFIED",raw_payload:null};
 const accepted=validateTelegramDurableIntake(item,payload,JSON.stringify(payload));
 assert.equal(accepted.source_id,"telegram_authorized_publisher_feed");
 assert.throws(()=>validateTelegramDurableIntake(item,{...payload,country_iso3:"FJI"},
  JSON.stringify({...payload,country_iso3:"FJI"})),/TELEGRAM_D1_INTAKE_WATCH_FILTERED/);
 assert.throws(()=>validateTelegramDurableIntake(item,{...payload,watch_event:"not_a_gate"},
  JSON.stringify({...payload,watch_event:"not_a_gate"})),/TELEGRAM_D1_INTAKE_WATCH_FILTERED/);
});

test("webhook prefilter resolves only explicit Hot50-country event signals",()=>{
 assert.deepEqual(classifyHot50TelegramText("India faces foreign exchange crisis after reserve shortfall"),
  {accepted:true,reason:"HOT50_RISK_GATE_TRIGGER",country_iso3:"IND",
   category:"macro",event:"fx_sovereign_stress"});
 assert.equal(classifyHot50TelegramText("Fiji armed conflict after attack"),null);
 assert.equal(classifyHot50TelegramText("India local sports result"),null);
 assert.equal(classifyHot50TelegramText("India sanctions China over trade"),null);
 assert.equal(classifyHot50TelegramText("This strait was mentioned without a disruption"),null);
});
