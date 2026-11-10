import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {composeRiskGateThreeTierResponse,RISK_GATE_PRODUCT_TIERS,RISK_GATE_PRODUCT_SCHEMA}
 from "../../workers/control-plane/src/risk-gate-three-tier-product.mjs";
const NOW=Date.parse("2026-11-04T18:00:00.000Z");
const SHA="a".repeat(64);
const snapshot={target_type:"CORRIDOR",target_id:"hormuz",
 categories:{GEOPOLITICS:{source_count:1},MACRO_FX:{source_count:0},
 CRITICAL_MINERALS:{source_count:0}},day_utc:"2026-11-04"};
const observations=[{
 category:"GEOPOLITICS",source_count:1,
 evidence_payload:JSON.stringify({schema:"geomacro.risk-observation.v1",
  sources:[{id:"govuk-1",title_hash:SHA,published_at:"2026-11-04T17:55:00.000Z",
   origin:"D1_ORIGINAL_METADATA"}]}),
}];
function gro(){
 return {object_id:"gro-verified-hormuz-1",risk:{score:72},confidence:0.92,
  verification:{status:"VERIFIED"},commercial_eligibility:{status:"VERIFIED"},
  evidence_summary:{independent_source_count:2},
  evidence:[{event_id:"same-event-1",corroboration_status:"CONFIRMED",
   independent_source_count:2,source_ids:["issuer-A","issuer-B"],
   content_hashes:[SHA,"b".repeat(64)]}],
  attribution:[
   {driver:"conflict",score_contribution:40},
   {driver:"monetary_policy",score_contribution:30},
   {driver:"critical_minerals",score_contribution:20},
  ],
  integrity:{signature_scheme:"Ed25519",signature:"c".repeat(96),
   signing_key_id:"pinned-research-key",payload_hash:"d".repeat(64)},
  generated_at:"2026-11-04T17:30:00.000Z",
  expires_at:"2026-11-04T20:30:00.000Z"};
}
const archive={
 object_id:"gro-verified-hormuz-1",archive_write_acknowledged:1,
 archive_readback_verified:1,archive_sha256:"e".repeat(64),
 archive_key:"geomacro-evidence/v1/private/verified/gro-hormuz-1.json",
};
function render(tier,extra={}){return composeRiskGateThreeTierResponse({
 tier,snapshot,observations,now:NOW,...extra});}
test("exactly three immutable names, prices, decimal atomic amounts",()=>{
 assert.deepEqual(Object.keys(RISK_GATE_PRODUCT_TIERS),[
  "basic_focused","standard","complex_full"]);
 assert.deepEqual(Object.values(RISK_GATE_PRODUCT_TIERS).map(x=>x.usd_per_call),[
  "0.10","0.15","0.25"]);
 assert.deepEqual(Object.values(RISK_GATE_PRODUCT_TIERS).map(x=>x.usdc_atomic),[
  "100000","150000","250000"]);
 const catalog=readFileSync("src/lib/capability-pricing-catalog.ts","utf8");
 for(const x of Object.values(RISK_GATE_PRODUCT_TIERS)){
  assert(catalog.includes(x.legacy_variant+':"'+x.usd_per_call+'"'));
 }
});
test("Basic single unverified observation creates bounded indicative score and fast alert, not signed GRO",()=>{
 const r=render("basic_focused");
 assert.equal(r.schema,RISK_GATE_PRODUCT_SCHEMA);
 assert.equal(r.status,"READY");
 assert.equal(r.price.usd_per_call,"0.10");
 assert.equal(r.indicative_risk_score_0_100,10);
 assert.equal(r.confidence.level,"LOW");
 assert.equal(r.confidence.verification,"PROVISIONAL");
 assert.equal(r.risk_score_kind,"INDICATIVE_UNVERIFIED_ACTIVITY_PROXY");
 assert.equal(r.signal_alerts.length,1);
 assert.equal(r.signal_alerts[0].observed_at,"2026-11-04T17:55:00.000Z");
 assert.equal(r.signed_gro,null);
 assert.equal(r.execution_authorized,false);
 assert.equal(r.charged,false);
 assert.equal(r.payment_required_now,false);
});
test("No observed source is not silently scored as zero or billed",()=>{
 const r=composeRiskGateThreeTierResponse({
  tier:"basic_focused",now:NOW,
  snapshot:{...snapshot,categories:{}},observations:[]});
 assert.equal(r.status,"NO_OBSERVED_SIGNAL");
 assert.equal(r.indicative_risk_score_0_100,null);
 assert.equal(r.confidence,null);
 assert.equal(r.charged,false);
});
test("Basic expired, future and counter-only daily observations cannot stay READY",()=>{
 for(const published_at of ["2026-11-03T17:59:00Z","2026-11-05T18:00:00Z"]){
  const r=render("basic_focused",{observations:[{...observations[0],
   evidence_payload:JSON.stringify({schema:"geomacro.risk-observation.v1",
    sources:[{id:"old",title_hash:SHA,published_at}]})}]});
  assert.equal(r.status,"NO_OBSERVED_SIGNAL");assert.equal(r.chargeable,false);
 }
 assert.equal(render("basic_focused",{observations:[]}).status,"NO_OBSERVED_SIGNAL");
});
test("Standard blocks two unrelated or unverified observations and requires three categories",()=>{
 const missing=render("standard");
 assert.equal(missing.status,"INSUFFICIENT_CORROBORATION");
 assert.equal(missing.risk_score_0_100,null);
 assert.equal(missing.source_references.length,0);
 const unrelated=gro();
 unrelated.evidence[0].corroboration_status="UNCONFIRMED";
 const noSame=render("standard",{verified_gro:unrelated});
 assert.equal(noSame.status,"INSUFFICIENT_CORROBORATION");
 const incomplete=gro();incomplete.attribution.pop();
 assert.equal(render("standard",{verified_gro:incomplete}).status,"INSUFFICIENT_CORROBORATION");
});
test("Standard real three-category corroboration delivers verified fact sheets with source references",()=>{
 const r=render("standard",{verified_gro:gro()});
 assert.equal(r.price.usd_per_call,"0.15");
 assert.equal(r.status,"READY");
 assert.equal(r.corroborated_risk_score_0_100,31.5);
 assert.deepEqual(r.confidence,{level:"MEDIUM",verification:"VERIFIED"});
 assert.deepEqual(r.category_fact_sheets.map(s=>s.category),[
  "GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
 assert.deepEqual(r.category_fact_sheets.map(s=>s.verified_category_score_0_100),[
  40,30,20]);
 assert.deepEqual(r.source_references[0].source_ids,["issuer-A","issuer-B"]);
 assert.equal(r.source_references[0].content_sha256.length,2);
 assert.equal(r.auto_search_enrichment,"EXISTING_D1_FIRST_AND_BOUNDED_RSS_GAP_FILL");
 assert.equal(r.charged,false);
});
test("Standard accepts full-text independent-source corroboration from auto-enrichment",()=>{
 const corroborated={...snapshot,corroborated_risk_facts:Object.fromEntries([
  ["GEOPOLITICS",60],["MACRO_FX",40],["CRITICAL_MINERALS",80],
 ].map(([category,score])=>[category,{score_0_100:score,event_count:1,source_count:2,
  source_references:[{event_id:"c".repeat(64),
   independent_source_count:2,sources:[
    {source_id:"source-one",source_host:"official.example",title_sha256:SHA},
    {source_id:"source-two",source_host:"news.example",title_sha256:"b".repeat(64)},
   ]}]}]))};
 const r=composeRiskGateThreeTierResponse({tier:"standard",snapshot:corroborated,
  observations,now:NOW});
 assert.equal(r.status,"READY");
 assert.equal(r.chargeable,true);
 assert.equal(r.risk_score_0_100,58);
 assert.equal(r.confidence.verification,"VERIFIED");
 assert.equal(r.category_fact_sheets.every(x=>x.evidence_status==="VERIFIED_CORROBORATED"),true);
 assert.equal(r.source_references.length,3);
 assert.deepEqual(r.source_references[0].source_ids,["source-one","source-two"]);
});
test("Complex requires signed GRO, exact B2 archive readback and complete history",()=>{
 const missing=render("complex_full",{verified_gro:gro()});
 assert.equal(missing.status,"SIGNED_GRO_OR_ARCHIVE_NOT_READY");
 assert.equal(missing.gro_signature,null);
 const emptyHistory=render("complex_full",{verified_gro:gro(),archive_proof:archive});
 assert.equal(emptyHistory.status,"SIGNED_GRO_OR_ARCHIVE_NOT_READY");
 assert.equal(emptyHistory.proprietary_institutional_score_0_100,null);
 assert.equal(emptyHistory.seven_day_corridor_friction_history,null);
 const wrong={...archive,archive_readback_verified:0};
 assert.equal(render("complex_full",{verified_gro:gro(),archive_proof:wrong}).status,
  "SIGNED_GRO_OR_ARCHIVE_NOT_READY");
 const country=composeRiskGateThreeTierResponse({
  tier:"complex_full",now:NOW,verified_gro:gro(),
  archive_proof:archive,snapshot:{...snapshot,target_type:"COUNTRY",target_id:"USA"},
  observations});
 assert.equal(country.status,"SIGNED_GRO_OR_ARCHIVE_NOT_READY");
});
test("Complex verified signature, 7-day signed-history holes and private B2 reference",()=>{
 const days=["2026-10-29","2026-10-30","2026-10-31","2026-11-01",
  "2026-11-02","2026-11-03","2026-11-04"].map((day_utc,i)=>({
   entity_type:"CORRIDOR",entity_id:"hormuz",day_utc,
   snapshot:{unified_risk_score:[0.55,0.51,0.48,0.44,0.4,0.38,0.35][i],
    verified_unified_risk_score:[0.55,0.51,0.48,0.44,0.4,0.38,0.35][i],
    signed_gro_payload_sha256:"d".repeat(64)},
   content_sha256:(i+1).toString(16).repeat(64),proof_verified:true,
  }));
 const incomplete=render("complex_full",{
  verified_gro:gro(),archive_proof:archive,history:days.slice(-2)});
 assert.equal(incomplete.status,"SIGNED_GRO_OR_ARCHIVE_NOT_READY");
 assert.equal(incomplete.chargeable,false);
 assert.equal(incomplete.gro_signature,null);
 const provisionalFallback=days.map(x=>({...x,
  snapshot:{...x.snapshot,verified_unified_risk_score:null,
   signed_gro_payload_sha256:null,unified_risk_score:0.9}}));
 const fakeVerifiedHistory=render("complex_full",{
  verified_gro:gro(),archive_proof:archive,history:provisionalFallback});
 assert.equal(fakeVerifiedHistory.status,"SIGNED_GRO_OR_ARCHIVE_NOT_READY");
 assert.equal(fakeVerifiedHistory.chargeable,false);
 const unsignedPastDay=days.map((x,i)=>i===3?{...x,
  snapshot:{...x.snapshot,signed_gro_payload_sha256:null}}:x);
 assert.equal(render("complex_full",{
  verified_gro:gro(),archive_proof:archive,history:unsignedPastDay}).status,
  "SIGNED_GRO_OR_ARCHIVE_NOT_READY");
 const unsigned=gro();
 unsigned.attribution.pop();
 const withIncompleteGro=render("complex_full",{
  verified_gro:unsigned,archive_proof:archive,history:days});
 assert.equal(withIncompleteGro.status,"SIGNED_GRO_OR_ARCHIVE_NOT_READY");
 assert.equal(withIncompleteGro.chargeable,false);
 assert.equal(withIncompleteGro.category_fact_sheets[2].verified_category_score_0_100,null);
 assert.equal(withIncompleteGro.category_fact_sheets[2].evidence_status,"NOT_FULLY_VERIFIED");
 const r=render("complex_full",{verified_gro:gro(),archive_proof:archive,history:days});
 assert.equal(r.status,"READY");
 assert.equal(r.price.usd_per_call,"0.25");
 assert.equal(r.proprietary_institutional_score_0_100,72);
 assert.deepEqual(r.confidence,{level:"HIGH",verification:"CRYPTO_SIGNED"});
 assert.equal(r.gro_signature.scheme,"Ed25519");
 assert.equal(r.gro_signature.payload_sha256,"d".repeat(64));
 assert.equal(r.seven_day_corridor_friction_history.window_days,7);
 assert.equal(r.seven_day_corridor_friction_history.points.length,7);
 assert.equal(r.seven_day_corridor_friction_history.verified_score_days,7);
 assert.equal(r.seven_day_verified_subject_history.verified_score_days,7);
 assert.equal(r.seven_day_corridor_friction_history.trend,"FALLING");
 assert.equal(r.seven_day_corridor_friction_history.latest_minus_earliest,-20);
 assert.equal(r.b2_archive.b2_archive_link,
  "b2://geomacro-private-archive/geomacro-evidence/v1/private/verified/gro-hormuz-1.json");
 assert.equal(r.b2_archive.archive_sha256,"e".repeat(64));
 assert.equal(r.b2_archive.public_download_url,null);
 assert.equal(r.execution_authorized,false);
 assert.equal(r.charged,false);
});
test("Country Complex is allowed only after 7 signed country days with verified GRO + archive",()=>{
 const days=["2026-10-29","2026-10-30","2026-10-31","2026-11-01",
  "2026-11-02","2026-11-03","2026-11-04"].map((day_utc,i)=>({
  entity_type:"COUNTRY",entity_id:"USA",day_utc,
  snapshot:{unified_risk_score:(45+i)/100,
   verified_unified_risk_score:(45+i)/100,
   signed_gro_payload_sha256:"d".repeat(64)},
  content_sha256:(i+2).toString(16).repeat(64),proof_verified:true,
 }));
 const r=composeRiskGateThreeTierResponse({
  tier:"complex_full",now:NOW,verified_gro:gro(),archive_proof:archive,
  snapshot:{...snapshot,target_type:"COUNTRY",target_id:"USA"},
  observations,history:days});
 assert.equal(r.status,"READY");
 assert.equal(r.chargeable,true);
 assert.equal(r.seven_day_country_risk_history.verified_score_days,7);
 assert.equal(r.seven_day_verified_subject_history.verified_score_days,7);
 assert.equal(r.seven_day_corridor_friction_history,null);
 assert.equal(r.execution_authorized,false);
 assert.equal(r.charged,false);
});
test("Invalid product tier and invalid subject fail, no pricing downgrade",()=>{
 assert.throws(()=>render("arbitrary"),/RISK_GATE_THREE_TIER_INPUT_INVALID/);
 assert.throws(()=>composeRiskGateThreeTierResponse({
  tier:"basic_focused",snapshot:{...snapshot,target_type:"BOTH"},now:NOW,
 }),/RISK_GATE_THREE_TIER_INPUT_INVALID/);
});

test("Complex corridor archive proof migration upgrades existing D1 hot rows without minting readback",()=>{
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync("workers/control-plane/migrations/0020_predge_risk_gate_d1.sql","utf8"));
 const payload="f".repeat(64);
 db.prepare("INSERT INTO corridor_gro_verified_hot "+
  "(corridor_id,object_id,schema_version,generated_at,expires_at,"+
  "signing_key_id,payload_hash,record_sha256,archive_write_acknowledged,"+
  "object_json,verified_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
 .run("hormuz","gro-test","gro-1.1","2026-11-04T17:00:00Z",
  "2026-11-04T19:00:00Z","k",payload,payload,1,"{}",
  "2026-11-04T17:01:00Z","2026-11-04T17:01:00Z");
 db.exec(readFileSync(
  "workers/control-plane/migrations/0121_risk_gate_corridor_archive_readback.sql","utf8"));
 const original=db.prepare("SELECT archive_key,archive_sha256,archive_readback_verified "+
  "FROM corridor_gro_verified_hot").get();
 assert.equal(original.archive_key,null);
 assert.equal(original.archive_sha256,null);
 assert.equal(original.archive_readback_verified,0);
 assert.throws(()=>db.prepare(
  "UPDATE corridor_gro_verified_hot SET archive_readback_verified=1 "+
  "WHERE corridor_id='hormuz'").run(),/CORRIDOR_GRO_B2_READBACK_EXACT_PROOF_REQUIRED/);
 const key="geomacro-evidence/v1/live/country-gro/hot-bundles/HOR/"+payload+".json.gz";
 db.prepare("UPDATE corridor_gro_verified_hot SET "+
  "archive_key=?,archive_sha256=?,archive_readback_verified=1 "+
  "WHERE corridor_id='hormuz'").run(key,payload);
 assert.equal(db.prepare("SELECT archive_readback_verified AS v "+
  "FROM corridor_gro_verified_hot").get().v,1);
 db.close();
});

test("Complex accepts independently readback-acknowledged Brotli11 private archive reference, but never without seven true signed days",()=>{
 const archiveProof={object_id:"gro-verified-hormuz-1",archive_write_acknowledged:1,
  archive_readback_verified:1,archive_sha256:"e".repeat(64),
  archive_key:"geomacro-evidence/v1/private/verified/gro-hormuz-1.json.br"};
 const result=render("complex_full",{verified_gro:gro(),archive_proof:archiveProof});
 assert.equal(result.status,"SIGNED_GRO_OR_ARCHIVE_NOT_READY");
 assert.equal(result.chargeable,false);
 assert.equal(result.b2_archive,null);
});
