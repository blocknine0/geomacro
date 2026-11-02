import test from "node:test";
import assert from "node:assert/strict";
import {projectCorridorDerivedSevenDay,syncCorridorSevenDay}
 from "../../workers/control-plane/src/corridor-seven-day-cache.mjs";
const ID="a".repeat(64),SHA="b".repeat(64),NOW=Date.parse("2026-11-02T12:00:00Z");
function sample(){
 const data={record:{
  id:ID,verified_news_event:false,signed_gro:false,
  commercial_eligible:false,customer_delivery_authorized:false,
  analysis_at:"2026-11-02T11:00:00Z",
  what_happened:"One official corridor observation has been ingested.",
  why_it_matters:"Relevant to potential supply chain exposure analysis.",
  market_relevance:"Potential market scenario; no verified causal claim.",
  what_to_watch:"Monitor independent official incident confirmation.",
  candidate_corridor_ids:["red_sea"],metric_id:"ship_count",metric_value:12,unit:"ships",
  source_url:"https://private-original.example.invalid/"},
  proof:{independent_sources_checked:1,original_url:"https://secret.invalid"}};
 return {research_id:ID,analysis_sha256:SHA,
  created_at:"2026-11-02T11:00:00.000Z",structured_json:JSON.stringify(data)};
}
test("projects five-part private corridor cache without originals or unearned confidence",()=>{
 const record=projectCorridorDerivedSevenDay(sample(),NOW);
 assert.ok(record);
 const body=JSON.stringify(record);
 assert.equal(body.includes("private-original"),false);
 assert.equal(body.includes("secret.invalid"),false);
 assert.equal(record.verified_event,false);
 assert.equal(record.structured_json.risk_gate_metrics.confidence,null);
 assert.equal(record.structured_json.risk_gate_metrics.gate_passed,false);
 assert.equal(record.structured_json.corridor_impact.impact_verified,false);
 assert.equal(record.expires_at,"2026-11-09T11:00:00.000Z");
});
test("rejects source-claim promotion, expired rows and raw URLs in derived paragraphs",()=>{
 const promoted=sample(),d=JSON.parse(promoted.structured_json);
 d.record.verified_news_event=true;promoted.structured_json=JSON.stringify(d);
 assert.equal(projectCorridorDerivedSevenDay(promoted,NOW),null);
 const unsafe=sample(),v=JSON.parse(unsafe.structured_json);
 v.record.what_happened="News at https://private.invalid";
 unsafe.structured_json=JSON.stringify(v);
 assert.equal(projectCorridorDerivedSevenDay(unsafe,NOW),null);
 assert.equal(projectCorridorDerivedSevenDay(sample(),NOW+8*86400000),null);
});
test("missing acceptance or wrong Supabase host never touches network",async()=>{
 let called=0;
 const fake=async()=>{called++;throw Error("network use denied")};
 const a=await syncCorridorSevenDay({},{now:NOW,fetcher:fake});
 assert.equal(a.enabled,false);assert.equal(called,0);
 const b=await syncCorridorSevenDay({
  GEOMACRO_SUPABASE_7D_ACCEPTANCE:"ACCEPTED_NEW_PRIVATE_SUPABASE_7D",
  GEOMACRO_SUPABASE_7D_URL:"https://attacker.invalid",
  GEOMACRO_SUPABASE_7D_SERVICE_ROLE_KEY:"abc".repeat(20)
 },{now:NOW,fetcher:fake});
 assert.equal(b.enabled,false);assert.equal(called,0);
});
