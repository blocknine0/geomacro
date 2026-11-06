import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {buildProgressiveGateState} from "../../workers/control-plane/src/risk-gate-progressive-state.mjs";
import {signRiskGateFastTick} from "../../workers/control-plane/src/risk-gate-fast-tick-sign.mjs";
import {partitionRiskGateSubjects,runRiskGatePartitioned}
 from "../../workers/control-plane/src/risk-gate-partitioned-concurrency.mjs";
import {classifyRiskGateCorroboration,runRiskGateAutonomousCorroborator}
 from "../../workers/control-plane/src/risk-gate-autonomous-corrob.mjs";
import {runRiskGateIncompleteWatchdog} from "../../workers/control-plane/src/risk-gate-incomplete-watchdog.mjs";
const NOW=Date.parse("2026-11-06T12:00:00Z"),ISO=new Date(NOW).toISOString();
const SHA="a".repeat(64),EV="b".repeat(64);
const product=(tier,price,status,score)=>({
 tier,price:{usd_per_call:price},status,risk_score_0_100:score,
 chargeable:status==="READY",confidence:status==="READY"?
  {verification:tier==="BASIC_FOCUSED"?"PROVISIONAL":"VERIFIED"}:null,
 risk_score_kind:tier==="BASIC_FOCUSED"?"INDICATIVE_UNVERIFIED_ACTIVITY_PROXY":"CORROBORATED_RISK_SCORE",
 activation_triggers:{pending_conditions:status==="READY"?[]:["NEEDS_REAL_EVIDENCE"],
 category_triggers:[]},
});
const products=()=>({
 basic_focused:product("BASIC_FOCUSED","0.10","READY",10),
 standard:product("STANDARD","0.15","INSUFFICIENT_CORROBORATION",null),
 complex_full:product("COMPLEX_FULL","0.25","SIGNED_GRO_OR_ARCHIVE_NOT_READY",null),
});
const input=(extra={})=>({subject:{type:"COUNTRY",id:"IND"},requestedTier:"complex_full",
 products:products(),now:NOW,...extra});
test("higher tier transparently downgrades to real available Basic, never bills or invents Standard",()=>{
 const p=buildProgressiveGateState(input());
 assert.equal(p.current_evaluation.active_tier,"DISCOVERY_BASIC");
 assert.equal(p.current_evaluation.unified_risk_score,10);
 assert.equal(p.downgraded,true);
 assert.equal(p.current_evaluation.chargeable_amount_usd,"0.10");
 assert.equal(p.current_evaluation.charged,false);
 assert.equal(p.current_evaluation.decision,"REQUIRE_APPROVAL");
 assert.equal(p.tier_activation_matrix.standard_corroborated_0_15.status,"PENDING");
 assert.equal(p.tier_activation_matrix.complex_institutional_0_25.status,"LOCKED");
});
test("never return zero score for no evidence, never upgrade beyond requested price",()=>{
 const absent=products();absent.basic_focused=product("BASIC_FOCUSED","0.10","NO_OBSERVED_SIGNAL",null);
 const no=buildProgressiveGateState(input({products:absent}));
 assert.equal(no.current_evaluation.active_tier,"NO_QUALIFIED_TIER");
 assert.equal(no.current_evaluation.unified_risk_score,null);
 assert.equal(no.current_evaluation.chargeable_amount_usd,null);
 const rich=products();rich.standard=product("STANDARD","0.15","READY",48);
 rich.complex_full=product("COMPLEX_FULL","0.25","READY",61);
 const basic=buildProgressiveGateState(input({requestedTier:"basic_focused",products:rich}));
 assert.equal(basic.current_evaluation.active_tier,"DISCOVERY_BASIC");
 assert.equal(basic.current_evaluation.chargeable_amount_usd,"0.10");
 const standard=buildProgressiveGateState(input({requestedTier:"standard",products:rich}));
 assert.equal(standard.current_evaluation.active_tier,"STANDARD_CORROBORATED");
});
test("fast-tick fails honestly when no separately provisioned Ed25519 key exists",async()=>{
 const p=buildProgressiveGateState(input());
 const x=await signRiskGateFastTick(p,{});
 assert.equal(x.status,"FAST_TICK_KEY_UNAVAILABLE");
 assert.equal(x.ed25519_signature,null);
 assert.match(x.canonical_hash,/^sha256:[a-f0-9]{64}$/);
 assert.equal(x.signature_scope,"RESPONSE_AUTHENTICITY_NOT_SOURCE_VERIFICATION");
});
test("exact 207 nodes run in ten 20-21 subject partitions; one exception does not halt unrelated slots",async()=>{
 const subjects=[...Array.from({length:195},(_,i)=>({type:"COUNTRY",id:"C"+String(i).padStart(3,"0")})),
  ...Array.from({length:12},(_,i)=>({type:"CORRIDOR",id:"corridor"+i}))];
 const groups=partitionRiskGateSubjects(subjects);
 assert.equal(groups.length,10);
 assert.deepEqual(groups.map(x=>x.length),[21,21,21,21,21,21,21,20,20,20]);
 const completed=await runRiskGatePartitioned(subjects,async x=>{
  if(x.id==="C010")throw Error("UNKNOWN_UPSTREAM");
  return x.id;
 });
 assert.equal(completed.succeeded,206);
 assert.equal(completed.failed,1);
 assert.equal(completed.receipts.length,207);
});
function sqliteDb(){
 const db=new DatabaseSync(":memory:");
 db.exec(readFileSync("workers/control-plane/migrations/0123_risk_gap_enrichment.sql","utf8"));
 db.exec(readFileSync("workers/control-plane/migrations/0131_risk_gate_evidence_autonomy.sql","utf8"));
 const D1={prepare(sql){return {bind(...args){return {
  async first(){return db.prepare(sql).get(...args)??null;},
  async all(){return {results:db.prepare(sql).all(...args)};},
  async run(){return {...db.prepare(sql).run(...args),success:true};}
 }}}}};
 return {db,D1};
}
function putEvent(db,at,independent){
 const eventId=EV,source=(id,host,eventAt,fact)=>({
  observation_id:id.repeat(64),event_id:eventId,entity_type:"COUNTRY",
  entity_id:"IND",category:"GEOPOLITICS",event_at:eventAt,source_id:host,
  source_host:host,title_sha256:SHA,impact_factor:fact?72:null,
  fact_basis:fact?"ARTICLE_FULL_TEXT":"SEARCH_TITLE_ONLY",
  original_page_fetched:fact?1:0,status:"OBSERVED",
  independent_source_count:1,discovered_at:ISO,
 });
 const items=[source("c","bbc.com","2026-11-06T02:00:00Z",independent),
  source("d","dw.com","2026-11-06T10:00:00Z",independent)];
 const insert=db.prepare("INSERT INTO unverified_observations "+
  "(observation_id,event_id,entity_type,entity_id,category,event_at,source_id,source_host,"+
  "title_sha256,impact_factor,fact_basis,original_page_fetched,status,independent_source_count,discovered_at) "+
  "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
 for(const x of items)insert.run(...Object.values(x));
 db.prepare("INSERT INTO risk_gate_progressive_event_outbox "+
  "(event_key,observation_id,event_id,subject_type,subject_id,category,"+
  "first_seen_at,last_seen_at,event_at,next_attempt_at,updated_at) "+
  "VALUES(?,?,?,?,?,?,?,?,?,?,?)")
 .run("c".repeat(64),"c".repeat(64),EV,"COUNTRY","IND","GEOPOLITICS",
  ISO,ISO,ISO,ISO,ISO);
}
test("72-hour event auto-promotes only two genuine independently fetched original pages",async()=>{
 const {db,D1}=sqliteDb();putEvent(db,NOW,true);
 const result=await runRiskGateAutonomousCorroborator({DB:D1,RISK_GATE_COUNTRY_SCOPE:"HOT50"},{now:NOW});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.corroborated,1);
 const row=db.prepare("SELECT evidence_status,corroborated_events,derived_impact_0_100 "+
  "FROM risk_gate_progressive_cell_state WHERE subject_id='IND'").get();
 assert.equal(row.evidence_status,"CORROBORATED_ORIGINAL_EVIDENCE");
 assert.equal(row.corroborated_events,1);
 assert.equal(row.derived_impact_0_100,72);
 db.close();
});
test("Reuters/AP/ANI index headlines alone remain observed and retryable, never signed as verified facts",async()=>{
 const {db,D1}=sqliteDb();putEvent(db,NOW,false);
 const result=await runRiskGateAutonomousCorroborator({DB:D1,RISK_GATE_COUNTRY_SCOPE:"HOT50"},{now:NOW});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.corroborated,0);
 const row=db.prepare("SELECT state FROM risk_gate_progressive_event_outbox").get();
 assert.equal(row.state,"WAITING_EVIDENCE");
 const facts=db.prepare("SELECT COUNT(*) AS n FROM unverified_observations WHERE status='CORROBORATED'").get();
 assert.equal(facts.n,0);
 db.close();
});
test("same event sent by two apparent index hosts cannot manufacture original corroboration",()=>{
 const result=classifyRiskGateCorroboration([
  {event_id:EV,source_host:"reuters.com",event_at:"2026-11-06T02:00:00Z",
   fact_basis:"SEARCH_TITLE_ONLY",original_page_fetched:0,impact_factor:80},
  {event_id:EV,source_host:"aninews.in",event_at:"2026-11-06T10:00:00Z",
   fact_basis:"SEARCH_TITLE_ONLY",original_page_fetched:0,impact_factor:80},
 ],NOW);
 assert.equal(result.metadata_publishers,2);
 assert.equal(result.corroborated,false);
 assert.equal(result.derived_impact_0_100,null);
});

test("self-healing watchdog enqueues exactly twelve missing Hot50 cells over ten bounded partitions",async()=>{
 const {db,D1}=sqliteDb();
 const first=await runRiskGateIncompleteWatchdog(
  {DB:D1,RISK_GATE_COUNTRY_SCOPE:"HOT50"},{now:NOW});
 assert.equal(first.ok,true,JSON.stringify(first));
 assert.equal(first.registered_subjects,207);
 assert.equal(first.active_subjects,50);
 assert.equal(first.partitions,10);
 assert.equal(first.missing_cells,150);
 assert.equal(first.priority_slots_enqueued,12);
 const rows=db.prepare("SELECT subject_type,category,priority,due_at FROM "+
  "risk_gate_priority_feed_queue").all();
 assert.equal(rows.length,12);
 assert.equal(rows.every(x=>x.subject_type==="COUNTRY"&&x.priority==="MISSING"),true);
 db.close();
});
