import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {TRACKED_CORRIDORS,chooseRiskGateProcessingTier,
 buildStrategicCorridorReadiness} from "../../lib/risk-gate-corridor-first.mjs";
import {tickPrivateStrategicRiskGate,readPrivateRiskGateJit}
 from "../../workers/control-plane/src/corridor-risk-gate-jit.mjs";
import {publishContinuousStrategicCorridors}
 from "../ops/publish-risk-gate-corridor-continuity.mjs";
const TIME="2026-11-02T13:06:00.000Z",now=Date.parse(TIME);
const date=n=>new Date(now-n*60000).toISOString();
const sha="f".repeat(64),enc=x=>JSON.stringify(x);
const a={candidate_id:"a".repeat(64),source_id:"cointelegraph_rss",
 native_published_at:date(50),source_title_sha256:sha,
 article_url:"https://cointelegraph.com/news/red-sea-risk",
 candidate_corridor_ids_json:enc(["red_sea"])};
const b={...a,candidate_id:"b".repeat(64),source_id:"coindesk_rss",
 native_published_at:date(15),
 article_url:"https://www.coindesk.com/markets/red-sea-risk"};
class MockD1{
 constructor(rows=[a,b]){this.input=rows;this.snapshots=new Map();this.countryRows=[]}
 prepare(query){return {bind:(...params)=>({
  query,params,
  all:async()=>{
   if(query.includes("FROM phase2h_private_raw_news"))
    return {results:this.countryRows??[]};
   if(query.includes("FROM corridor_native_news_candidates"))
    return {results:this.input.filter(r=>
      r.native_published_at>=params[0]&&r.native_published_at<=params[1]&&
      r.candidate_corridor_ids_json.includes(params[2])).slice(0,60)};
   throw Error("unexpected all query "+query);
  },
  first:async()=>{
   if(query.includes("FROM corridor_risk_gate_strategic_snapshots"))
    return this.snapshots.get(params[0])??null;
   throw Error("unexpected first query");
  },
  run:async()=>{
   if(query.startsWith("DELETE"))return {success:true};
   throw Error("unexpected run query");
  }
 })}}
 async batch(statements){
  for(const s of statements){
   assert.match(s.query,/INSERT INTO corridor_risk_gate_strategic_snapshots/);
   const p=s.params;
   this.snapshots.set(p[0],{corridor_id:p[0],checked_at:p[1],
    content_sha256:p[2],source_candidate_count:p[3],structured_json:p[4]});
  }
  return statements.map(()=>({success:true}));
 }
}
test("exact five user-specified strategic corridors and other long-tail subjects",()=>{
 assert.deepEqual(TRACKED_CORRIDORS.map(x=>x.id),
  ["red-sea","taiwan-strait","hormuz","suez","malacca"]);
 assert.equal(chooseRiskGateProcessingTier({corridor_id:"red-sea"}).tier,
  "STRATEGIC_CONTINUOUS");
 assert.equal(chooseRiskGateProcessingTier({country_iso3:"USA"}).tier,
  "JIT_REQUEST_ONLY");
 assert.throws(()=>chooseRiskGateProcessingTier({country_iso3:"xx"}));
});
test("two different publisher domains within six hours only corroborate a same-title candidate",()=>{
 const result=buildStrategicCorridorReadiness({
  corridor_id:"red-sea",rows:[a,b],checked_at:TIME});
 assert.equal(result.native_evidence_count,2);
 assert.equal(result.potential_corroboration_pairs,1);
 assert.equal(result.two_domain_six_hour_title_matches[0].same_title_hash,true);
 assert.equal(result.two_domain_six_hour_title_matches[0].independently_verified_event,false);
 assert.equal(result.verified_event_count,0);
 assert.equal(result.risk_gate_decision,null);
 assert.equal(result.signed_gro,null);
 assert.equal(result.provisional_impact_score,null);
 assert.equal(result.customer_credit_debited,0);
 assert.equal(result.execution_authorized,false);
});
test("different headlines, same domain, or outside six-hour window cannot corroborate",()=>{
 const variants=[
  [a,{...b,source_title_sha256:"e".repeat(64)}],
  [a,{...b,article_url:"https://cointelegraph.com/news/second"}],
  [a,{...b,native_published_at:date(500)}]
 ];
 for(const rows of variants){
  const p=buildStrategicCorridorReadiness({
   corridor_id:"red-sea",rows,checked_at:TIME});
  assert.equal(p.potential_corroboration_pairs,0);
 }
});
test("D1 continuous tick writes five hashed snapshots and independently reads them",async()=>{
 const db=new MockD1();
 const res=await tickPrivateStrategicRiskGate({DB:db},now);
 assert.equal(res.status,200);
 const json=await res.json();
 assert.equal(json.strategic_corridors_monitored,5);
 assert.equal(json.canonical_d1_readback,true);
 assert.equal(json.source_reference_counts.find(x=>x.corridor_id==="red-sea").article_candidates,2);
 assert.equal(db.snapshots.size,5);
 assert.equal(db.snapshots.get("red-sea").content_sha256.length,64);
 assert.equal(db.snapshots.get("suez").source_candidate_count,0);
 assert.equal(db.snapshots.get("hormuz").source_candidate_count,0);
 assert.equal(json.signed_gro_generated,false);
 assert.equal(json.customer_credits_debited,0);
});
test("admin JIT preflight remains no-charge even when source titles appear to corroborate",async()=>{
 const db=new MockD1();
 const ok=await readPrivateRiskGateJit({DB:db},
  new URLSearchParams("subject_type=corridor&subject_id=red-sea"),now);
 assert.equal(ok.status,200);
 const j=await ok.json();
 assert.equal(j.potential_corroboration_pairs,1);
 assert.equal(j.same_event_verified,false);
 assert.equal(j.signed_gro,null);
 assert.equal(j.customer_credits_debited,0);
 assert.equal(j.risk_gate_decision,null);
 const country=await readPrivateRiskGateJit({DB:db},
  new URLSearchParams("subject_type=country&subject_id=USA"),now);
 assert.equal(country.status,202);
 const c=await country.json();
 assert.equal(c.processing_tier,"JIT_REQUEST_ONLY");
 assert.equal(c.verification_status,"COUNTRY_SPECIFIC_VERIFIED_EVIDENCE_REQUIRED");
 assert.equal(c.chargeable,false);
 assert.equal((await readPrivateRiskGateJit({DB:db},
  new URLSearchParams("subject_type=country&subject_id=BAD!"),now)).status,400);
});
test("long-tail country lookup finds source-linked ORIGINAL headlines without signing or charging",async()=>{
 const db=new MockD1();
 db.countryRows=[{
  record_id:"c".repeat(64),category:"geopolitics",
  original_published_at:date(45),raw_sha256:"e".repeat(64),
  raw_json:JSON.stringify({original:{
   original_title:"United States government issues a new policy announcement",
   original_published_at:date(45)}})
 },{
  record_id:"d".repeat(64),category:"macro",
  original_published_at:date(40),raw_sha256:"e".repeat(64),
  raw_json:JSON.stringify({original:{
   original_title:"India central bank releases statement",
   original_published_at:date(40)}})
 }];
 const j=await readPrivateRiskGateJit({DB:db},
  new URLSearchParams("subject_type=country&subject_id=USA"),now);
 assert.equal(j.status,202);
 const result=await j.json();
 assert.equal(result.discovery_evidence_count,1);
 assert.equal(result.evidence_references[0].record_id,"c".repeat(64));
 assert.equal(result.processing_tier,"JIT_REQUEST_ONLY");
 assert.equal(result.verification_status,"ORIGINAL_HEADLINE_COUNTRY_CANDIDATES_UNVERIFIED");
 assert.equal(result.independently_verified_events,0);
 assert.equal(result.customer_credits_debited,0);
 assert.equal(result.signed_gro,null);
 assert.equal(result.chargeable,false);
 assert.ok(!JSON.stringify(result).includes("United States government"));
});

test("real private publisher performs five corridor JIT checks and longtail safety check",async()=>{
 const db=new MockD1(),secret="a".repeat(64);
 const run=await publishContinuousStrategicCorridors({rootToken:secret,fetchImpl:async(url,opt)=>{
  assert.match(opt.headers.Authorization,/^Bearer [a-f0-9]{64}$/);
  const path=new URL(url);
  if(path.pathname.endsWith("corridor-first-tick"))
   return tickPrivateStrategicRiskGate({DB:db},now);
  return readPrivateRiskGateJit({DB:db},path.searchParams,now);
 }});
 assert.equal(run.continuous_corridors,5);
 assert.equal(run.strategic_jit_live_verified,5);
 assert.equal(run.longtail_jit_fail_closed_no_charge,true);
 assert.equal(run.paid_gate_enabled,false);
});
test("legacy Risk Gate, signed GRO, customer ledger and PREDGE are not modified",()=>{
 const worker=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
 assert.ok(worker.indexOf("const auth = authorized(request, env)")<
   worker.indexOf('if(url.pathname==="/v1/internal/risk-gate/jit")'));
 const pricing=readFileSync(new URL("../../src/lib/capability-pricing-catalog.ts",import.meta.url),"utf8");
 assert.ok(pricing.includes('if(capability==="risk_gate_bundle")return "COMING_SOON";'));
 const workflow=readFileSync(new URL("../../.github/workflows/direct-global-corridor-intake.yml",import.meta.url),"utf8");
 assert.ok(workflow.includes("publish-risk-gate-corridor-continuity.mjs"));
});
