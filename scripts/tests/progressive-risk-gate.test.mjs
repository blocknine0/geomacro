import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {generateKeyPairSync,webcrypto,verify as verifyEd25519,createHash,createHmac} from "node:crypto";
import {admitProgressiveRiskFacts,projectUnverifiedProgressiveObservations} from "../../workers/control-plane/src/news-intake-policy.mjs";
import {
  readProgressiveFacts,progressiveTierMatrix,provisionalRiskGate,
  signProgressiveDecision,canonicalProgressiveJson,sevenDayRollupIsReady,
} from "../../workers/control-plane/src/progressive-risk-gate.mjs";

if(!globalThis.crypto)Object.defineProperty(globalThis,"crypto",{value:webcrypto});
const NOW=Date.parse("2026-11-06T02:00:00.000Z");
const at=new Date(NOW-3600_000).toISOString();
const fprint="a".repeat(64);
function fixture(){
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec(readFileSync(new URL("../../workers/control-plane/migrations/0201_progressive_risk_gate_facts.sql",import.meta.url),"utf8"));
 sqlite.exec(`CREATE TABLE unverified_observations (
   observation_id TEXT PRIMARY KEY CHECK(length(observation_id)=64),
   event_id TEXT NOT NULL CHECK(length(event_id)=64),
   entity_type TEXT NOT NULL CHECK(entity_type IN ('COUNTRY','CORRIDOR')),
   entity_id TEXT NOT NULL,
   category TEXT NOT NULL DEFAULT 'GEOPOLITICS' CHECK(category IN ('GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS')),
   event_at TEXT NOT NULL,source_id TEXT NOT NULL,source_host TEXT NOT NULL,
   title_sha256 TEXT NOT NULL CHECK(length(title_sha256)=64),
   impact_factor REAL CHECK(impact_factor IS NULL OR impact_factor BETWEEN 0 AND 100),
   fact_basis TEXT NOT NULL CHECK(fact_basis IN ('ARTICLE_FULL_TEXT','SEARCH_TITLE_ONLY')),
   original_page_fetched INTEGER NOT NULL CHECK(original_page_fetched IN (0,1)),
   status TEXT NOT NULL DEFAULT 'OBSERVED' CHECK(status IN ('OBSERVED','CORROBORATED')),
   independent_source_count INTEGER NOT NULL DEFAULT 1 CHECK(independent_source_count BETWEEN 1 AND 40),
   discovered_at TEXT NOT NULL,UNIQUE(event_id,source_host)
 )`);
 return {sqlite,env:{DB:{prepare(query){return {bind(...args){const stmt=sqlite.prepare(query);return {
   run:async()=>stmt.run(...args),first:async()=>stmt.get(...args),
   all:async()=>({results:stmt.all(...args)})
 };}}}}}};
}
function fact(publisher,clock_basis="ORIGINAL_PUBLICATION"){
 return {
   country_iso3:"IND",derived_category:"geopolitics",event_fingerprint:fprint,
   publisher_domain:publisher,canonical_source_url:"https://"+publisher+"/world/example",
   event_clock:at,clock_basis,extracted_entities:["IND","conflict_geopolitics"],
 };
}
test("two publisher-native observations promote one event without duplicate writes",async()=>{
 const {sqlite,env}=fixture();
 try{
   const rows=[fact("reuters.com"),fact("aninews.in")];
   await admitProgressiveRiskFacts(env,rows,NOW);
   await admitProgressiveRiskFacts(env,rows,NOW);
   const count=sqlite.prepare("SELECT COUNT(*) AS n FROM progressive_risk_gate_facts").get();
   assert.equal(count.n,2);
   const state=sqlite.prepare("SELECT status,corroboration_sources_count FROM progressive_risk_gate_cell_state").get();
   assert.equal(state.status,"CORROBORATED");
   assert.equal(state.corroboration_sources_count,2);
   const observed=await readProgressiveFacts(env.DB,{type:"country",id:"IND"},NOW);
   assert.equal(observed.standard_ready,true);
   assert.equal(observed.corroboration_sources_count,2);
   const matrix=progressiveTierMatrix(observed,false,false);
   assert.equal(matrix.standard.status,"ACTIVE");
   assert.equal(matrix.complex.status,"LOCKED");
 }finally{sqlite.close()}
});
test("Complex cannot become active or billable without Standard, current signed GRO and verified seven-day history",()=>{
 const facts={standard_ready:true,corroboration_sources_count:2};
 for(const [standard,gro,history] of [
  [false,true,true],[true,false,true],[true,true,false],[false,true,false]
 ]){
  const matrix=progressiveTierMatrix({...facts,standard_ready:standard},gro,history);
  assert.equal(matrix.complex.active,false);
  assert.equal(matrix.complex.status,"LOCKED");
  assert.ok(matrix.complex.missing?.length>0);
 }
 const ready=progressiveTierMatrix(facts,true,true);
 assert.equal(ready.standard.active,true);
 assert.equal(ready.complex.active,true);
 assert.equal(ready.complex.status,"ACTIVE");
 assert.equal(Object.hasOwn(ready.complex,"missing"),false);
});

test("Google-index attribution never becomes verified source corroboration",async()=>{
 const {sqlite,env}=fixture();
 try{
   await admitProgressiveRiskFacts(env,[fact("reuters.com","INDEX_OBSERVED"),
     fact("aninews.in","INDEX_OBSERVED")],NOW);
   const state=sqlite.prepare("SELECT status,corroboration_sources_count FROM progressive_risk_gate_cell_state").get();
   assert.equal(state.status,"OBSERVED");
   assert.equal(state.corroboration_sources_count,0);
   const observed=await readProgressiveFacts(env.DB,{type:"country",id:"IND"},NOW);
   assert.equal(observed.standard_ready,false);
   assert.equal(progressiveTierMatrix(observed,false,false).standard.status,"PENDING");
 }finally{sqlite.close()}
});
test("existing continuously polled news index produces Basic without a signed GRO",async()=>{
 const {sqlite,env}=fixture();
 try{
   sqlite.prepare("INSERT INTO unverified_observations(event_id,entity_type,entity_id,event_at,status,fact_basis,original_page_fetched,independent_source_count,source_host) VALUES (?,?,?,?,?,?,?,?,?)")
     .run("index-event-1","COUNTRY","IND",at,"OBSERVED","SEARCH_TITLE_ONLY",0,1,"reuters.com");
   const observed=await readProgressiveFacts(env.DB,{type:"country",id:"IND"},NOW);
   assert.equal(observed.distinct_events,1);
   const provisional=provisionalRiskGate({
     request_id:"sample-id",subject:{type:"country",id:"IND"},
     policy:{policy_id:"p",policy_version:"v"}
   },observed,NOW);
   assert.ok(Number.isFinite(provisional.risk.score));
   assert.equal(provisional.execution_authorized,false);
   assert.equal(provisional.risk_metric_semantics,"OBSERVATION_DENSITY_PROXY");
 }finally{sqlite.close()}
});
test("native original-page corroboration from the existing 20m collector auto-promotes Standard",async()=>{
 const {sqlite,env}=fixture();
 try{
   const add=sqlite.prepare("INSERT INTO unverified_observations(event_id,entity_type,entity_id,event_at,status,fact_basis,original_page_fetched,independent_source_count,source_host) VALUES (?,?,?,?,?,?,?,?,?)");
   add.run("native-event-1","COUNTRY","IND",at,"CORROBORATED","ARTICLE_FULL_TEXT",1,2,"reuters.com");
   add.run("native-event-1","COUNTRY","IND",at,"CORROBORATED","ARTICLE_FULL_TEXT",1,2,"aninews.in");
   const observed=await readProgressiveFacts(env.DB,{type:"country",id:"IND"},NOW);
   assert.equal(observed.corroboration_sources_count,2);
   assert.equal(observed.standard_ready,true);
   assert.equal(progressiveTierMatrix(observed,false,false).standard.active,true);
 }finally{sqlite.close()}
});
test("a single claimed two-publisher counter never promotes Standard without two true page rows for the same event",async()=>{
 const {sqlite,env}=fixture();
 try{
  const add=sqlite.prepare("INSERT INTO unverified_observations(event_id,entity_type,entity_id,event_at,status,fact_basis,original_page_fetched,independent_source_count,source_host) VALUES (?,?,?,?,?,?,?,?,?)");
  // One real original page with a forged or stale second-publisher count.
  add.run("shared-event","COUNTRY","IND",at,"CORROBORATED","ARTICLE_FULL_TEXT",1,2,"reuters.com");
  let r=await readProgressiveFacts(env.DB,{type:"country",id:"IND"},NOW);
  assert.equal(r.distinct_events,1);
  assert.equal(r.standard_ready,false);
  assert.equal(r.corroboration_sources_count,0);
  // An index-only repost from another host is not an original-page proof.
  add.run("shared-event","COUNTRY","IND",at,"CORROBORATED","SEARCH_TITLE_ONLY",0,2,"index.example");
  r=await readProgressiveFacts(env.DB,{type:"country",id:"IND"},NOW);
  assert.equal(r.standard_ready,false);
  // A real page from a different event still cannot corroborate this event.
  add.run("other-event","COUNTRY","IND",at,"CORROBORATED","ARTICLE_FULL_TEXT",1,2,"bbc.com");
  r=await readProgressiveFacts(env.DB,{type:"country",id:"IND"},NOW);
  assert.equal(r.standard_ready,false);
  // Only a second genuine page FROM ANOTHER publisher for the SAME event.
  add.run("shared-event","COUNTRY","IND",at,"CORROBORATED","ARTICLE_FULL_TEXT",1,2,"apnews.com");
  r=await readProgressiveFacts(env.DB,{type:"country",id:"IND"},NOW);
  assert.equal(r.standard_ready,true);
  assert.equal(r.corroboration_sources_count,2);
  const matrix=progressiveTierMatrix(r,false,false);
  assert.equal(matrix.standard.active,true);
  assert.equal(matrix.complex.status,"LOCKED");
 }finally{sqlite.close()}
});

test("zero news returns numeric no-data sentinel without granting execution",async()=>{
 const {sqlite,env}=fixture();
 try{
   const observed=await readProgressiveFacts(env.DB,{type:"country",id:"IND"},NOW);
   const result=provisionalRiskGate({request_id:"a",subject:{type:"country",id:"IND"},
     policy:{policy_id:"p",policy_version:"v"}},observed,NOW);
   assert.equal(result.decision,"PAUSE");
   assert.equal(result.risk.score,100);
   assert.equal(result.risk_metric_semantics,"NO_DATA_POLICY_SENTINEL");
 }finally{sqlite.close()}
});
test("Supabase 7-count alone cannot authorize Complex without seven separately HMAC-signed 3-domain originals",async()=>{
 const now=Date.parse("2026-11-11T12:00:00.000Z");
 const secret="test-observation-hmac-secret-".padEnd(64,"q");
 const gro="c".repeat(64);
 const days=Array.from({length:7},(_,i)=>
  new Date(Date.parse("2026-11-05T00:00:00.000Z")+i*86400000).toISOString().slice(0,10));
 const mk=(day,verified=true)=>{
  const generated_at=day+"T01:00:00.000Z";
  const snapshot={schema:"geomacro.unified-risk-gate.v1",schema_epoch:"v2",
   target_type:"COUNTRY",target_id:"IND",day_utc:day,generated_at,
   signed_gro_payload_sha256:verified?gro:null,
   verified_unified_risk_score:verified?0.52:null,
   categories:Object.fromEntries(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"].map(c=>[
     c,{risk_score:verified?0.52:null}]))};
  const content_sha256=createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  const proof={schema_epoch:"v2",key_id:"obs-hmac-v2",content_sha256,
   timestamp_utc:generated_at,signature_scope:"SNAPSHOT_INTEGRITY_NOT_EVENT_VERIFICATION",
   signature:"hmac_sha256:"+createHmac("sha256",secret).update(JSON.stringify({
     schema:"geomacro.unified-risk-gate.v1",schema_epoch:"v2",
     key_id:"obs-hmac-v2",content_sha256,timestamp_utc:generated_at
   })).digest("hex")};
  return {entity_type:"COUNTRY",entity_id:"IND",day_utc:day,
   snapshot_json:JSON.stringify(snapshot),audit_proof_json:JSON.stringify(proof),
   content_sha256,generated_at};
 };
 const genuine=days.map(day=>mk(day));
 const latest=genuine.at(-1);
 const rolls=["geopolitics","macro_fx","critical_minerals"].map(domain=>({
  domain,rollup_day:days.at(-1),scored_days:7,verification_status:"VERIFIED",
  source_snapshot_sha256:latest.content_sha256,verified_gro_sha256:gro
 }));
 const subject={type:"country",id:"IND"};
 const fetcher=async(url,opts)=>{
  assert.match(String(url),/geomacro_risk_signal_7d/);
  assert.match(String(url),/verified_gro_sha256/);
  assert.equal(opts.headers.apikey,"test-service-role-secret-".padEnd(40,"a"));
  return Response.json(rolls);
 };
 const envFor=history=>({RISK_GATE_SUPABASE_URL:"https://test.supabase.co",
  RISK_GATE_SUPABASE_SERVICE_ROLE_KEY:"test-service-role-secret-".padEnd(40,"a"),
  RISK_GATE_OBSERVATION_HMAC_KEY:secret,
  DB:{prepare(sql){
   assert.match(sql,/FROM unified_risk_snapshots/u);
   return {bind(country,from,through){
    assert.equal(country,"IND");assert.equal(from,days[0]);assert.equal(through,days.at(-1));
    return {all:async()=>({results:history})};
   }};
  }}});
 assert.equal(await sevenDayRollupIsReady(envFor(genuine),subject,now,fetcher),true);
 assert.equal(await sevenDayRollupIsReady(envFor(genuine.slice(1)),subject,now,fetcher),false);
 assert.equal(await sevenDayRollupIsReady(envFor(
  genuine.map((x,i)=>i===3?{...x,content_sha256:"f".repeat(64)}:x)
 ),subject,now,fetcher),false);
 assert.equal(await sevenDayRollupIsReady(envFor(
  genuine.map((x,i)=>i===3?mk(days[i],false):x)
 ),subject,now,fetcher),false);
 assert.equal(await sevenDayRollupIsReady(envFor(genuine),subject,now,
  async()=>Response.json(rolls.map(x=>({...x,source_snapshot_sha256:"f".repeat(64)})))),false);
 assert.equal(await sevenDayRollupIsReady(envFor(genuine),subject,now,
  async()=>Response.json(rolls.map(x=>({...x,verification_status:"OBSERVED_UNVERIFIED"})))),false);
});

test("Ed25519 signature binds complete canonical progressive decision payload",async()=>{
 const {privateKey,publicKey}=generateKeyPairSync("ed25519");
 const env={
   RISK_GATE_DECISION_ED25519_KEY_ID:"test-progressive-v1",
   RISK_GATE_DECISION_ED25519_PRIVATE_KEY_PKCS8_B64:
     privateKey.export({type:"pkcs8",format:"der"}).toString("base64"),
   RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64:
     publicKey.export({type:"spki",format:"der"}).toString("base64"),
 };
 const payload={schema:"geomacro.progressive-risk-gate-decision.v1",
   request_id:"a",tier:"BASIC_0_10",risk_gate:{decision:"PAUSE"},
   execution_authorized:false};
 const signed=await signProgressiveDecision(payload,env);
 const canonical=canonicalProgressiveJson(payload);
 assert.equal(signed.decision_payload_sha256,
   createHash("sha256").update(canonical).digest("hex"));
 assert.equal(verifyEd25519(null,Buffer.from(canonical),publicKey,
   Buffer.from(signed.decision_signature_b64,"base64")),true);
 assert.equal(verifyEd25519(null,Buffer.from(canonical.replace("PAUSE","CONTINUE")),publicKey,
   Buffer.from(signed.decision_signature_b64,"base64")),false);
});

test("D1 projection persists unverified metadata but cannot satisfy Standard rights/corroboration gates",async()=>{
 const {sqlite,env}=fixture();
 try{
  const candidate={
   country_iso3:"IND",derived_category:"geopolitics",
   event_fingerprint:"b".repeat(64),publisher_domain:"example.gov.in",
   canonical_source_url:"https://example.gov.in/news/release-1",
   event_clock:at,clock_basis:"INDEX_OBSERVED",
   extracted_entities:["IND"],source_id:"example.gov.in",
   title_sha256:"c".repeat(64),fact_basis:"SEARCH_TITLE_ONLY",
   original_page_fetched:false,rights_verified:false,commercial_eligible:false,
  };
  const receipt=await projectUnverifiedProgressiveObservations(env,[candidate],NOW);
  assert.equal(receipt.accepted,1);
  assert.equal(receipt.unverified_observations,1);
  assert.equal(receipt.rights_verified,false);
  assert.equal(receipt.commercial_eligible,false);
  assert.equal(receipt.standard_corroboration_admitted,false);
  const row=sqlite.prepare("SELECT status,fact_basis,original_page_fetched,independent_source_count FROM unverified_observations").get();
  assert.deepEqual({...row},{status:"OBSERVED",fact_basis:"SEARCH_TITLE_ONLY",
   original_page_fetched:0,independent_source_count:1});
  const facts=await readProgressiveFacts(env.DB,{type:"country",id:"IND"},NOW);
  assert.equal(facts.distinct_events,1);
  assert.equal(facts.standard_ready,false);
  assert.equal(progressiveTierMatrix(facts,false,false).standard.status,"LOCKED");
 }finally{sqlite.close()}
});
