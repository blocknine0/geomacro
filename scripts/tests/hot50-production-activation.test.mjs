import test from "node:test";
import assert from "node:assert/strict";
import {RISK_GATE_HOT50} from "../../workers/control-plane/src/risk-gate-hot50-scope.mjs";
import {readHot50ActivationCensus,readP0bParityManifest} from "../../workers/control-plane/src/hot50-production-activation-census.mjs";
import {serveReviewedSignedRiskIndices} from "../../workers/control-plane/src/reviewed-risk-indices-delivery.mjs";
const now=Date.parse("2026-11-06T04:00:00.000Z");
const when=new Date(now).toISOString();
const result=(rows)=>({results:rows});
function mockDb({outbox=0,queue=[],bundles=[],r2=[],historical=0,events=[]}={}){
 const coverage=RISK_GATE_HOT50.flatMap(iso3=>
   ["geopolitics","macro","rare_earth"].map(category=>{
     const entry=events.find(e=>e.country_iso3===iso3&&e.category===category);
     return {country_iso3:iso3,category,observed_events:entry?.observed_events??0,
       original_dated_events:entry?.original_dated_events??0,
       two_publisher_same_event:entry?.two_publisher_same_event??0,
       max_independent_publishers:entry?.max_independent_publishers??0,
       latest_event_clock:entry?.latest_event_clock??null};
   }));
 return {prepare(query){
   let args=[];
   return {bind(...input){args=input;return this},
    async first(){
      if(query.includes("FROM p0b_archive_outbox"))
        return {total:outbox,pending:outbox,replaying:0,expired_leases:0,
          archived:0,journal_mismatch:0};
      if(query.includes("FROM phase2h_private_raw_news"))
        return {total:historical,unarchived:historical};
      throw Error("UNEXPECTED_SINGLE_QUERY");
    },
    async all(){
      if(query.includes("FROM ingestion_spool_queue GROUP"))return result(queue);
      if(query.includes("FROM ingestion_spool_bundles GROUP"))return result(bundles);
      if(query.includes("FROM p0b_private_r2_fallback"))return result(r2);
      if(query.includes("WITH hot(iso3)"))return result(coverage);
      if(query.includes("FROM p0b_archive_outbox"))return result([]);
      throw Error("UNEXPECTED_LIST_QUERY:"+query.slice(0,50));
    }}},
 };
}
const env=(db,metrics)=>({DB:db,INGEST_QUEUE:{metrics}});
async function json(r){return r.json()}
test("Exactly 50 owner-selected countries and 150 category cells, not inferred certification",async()=>{
 assert.equal(RISK_GATE_HOT50.length,50);
 assert.equal(new Set(RISK_GATE_HOT50).size,50);
 const census=await json(await readHot50ActivationCensus(env(mockDb(),async()=>({backlogCount:0})),now));
 assert.equal(census.ok,true);
 assert.equal(census.coverage.cells.length,150);
 assert.equal(census.coverage.empty_cells,150);
 assert.equal(census.coverage.qualified_certified_cells,0);
 assert.equal(census.backlog.zero_unhandled_proven,true);
 assert.equal(census.b2_physical_get_hash_parity_proven,false);
});
test("queue and historical D1 pending always block exact zero-backlog proof",async()=>{
 const census=await json(await readHot50ActivationCensus(
   env(mockDb({outbox:3,queue:[{state:"RETRY",n:2}],historical:11}),
     async()=>({backlogCount:1})),now));
 assert.equal(census.backlog.total_unhandled,16);
 assert.equal(census.backlog.zero_unhandled_proven,false);
});
test("unknown queue provider metric never certifies zero even when all tables empty",async()=>{
 const census=await json(await readHot50ActivationCensus(
   env(mockDb(),async()=>{throw Error("provider unavailable")}),now));
 assert.equal(census.backlog.total_unhandled,0);
 assert.equal(census.backlog.provider_metric_obtained,false);
 assert.equal(census.backlog.zero_unhandled_proven,false);
});
test("same-event two source originals are only metadata readiness, never reviewer certification",async()=>{
 const c=await json(await readHot50ActivationCensus(env(mockDb({events:[{
  country_iso3:"IND",category:"macro",observed_events:1,
  original_dated_events:1,two_publisher_same_event:1,max_independent_publishers:2,
  latest_event_clock:when}]}),async()=>({backlogCount:0})),now));
 assert.equal(c.coverage.observed_cells,1);
 assert.equal(c.coverage.multi_publisher_cells,1);
 assert.equal(c.coverage.qualified_certified_cells,0);
 assert.equal(c.coverage.cells.find(x=>x.country_iso3==="IND"&&x.category==="macro").reviewer_certified,false);
});
test("malformed keyset cursor and raw object selectors are rejected",async()=>{
 const db=mockDb();
 for(const path of ["/v1/internal/p0b/parity-manifest?limit=30",
   "/v1/internal/p0b/parity-manifest?after=not-hex",
   "/v1/internal/p0b/parity-manifest?raw=true"]){
   const r=await readP0bParityManifest({DB:db},new URL("https://example.org"+path));
   assert.equal(r.status,400);
 }
 const pass=await json(await readP0bParityManifest({DB:db},
   new URL("https://example.org/v1/internal/p0b/parity-manifest?limit=25")));
 assert.equal(pass.ok,true);assert.equal(pass.complete,true);
});
test("signed public indices cannot be issued from absent or self-certified triage inputs",async()=>{
 let calls=[];
 const onlyNews=async product=>{
   calls.push(product);
   return Response.json({ok:true,product,schema:"geomacro.self-certified-news-severity-gri.v1",
    verification_mode:"internal-score",generated_at:when});
 };
 const response=await serveReviewedSignedRiskIndices({},onlyNews,now);
 assert.equal(response.status,503);
 assert.deepEqual(calls.sort(),["global-risk","risk-indices"]);
 const obj=await json(response);
 assert.equal(obj.certification_missing_is_not_zero_risk,true);
});
test("source code never couples reviewed numerical signing to raw news severity/Groq",async()=>{
 const {readFileSync}=await import("node:fs");
 const index=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
 const api=readFileSync(new URL("../../workers/control-plane/src/reviewed-risk-indices-delivery.mjs",import.meta.url),"utf8");
 const core=readFileSync(new URL("../../src/lib/ask-answer.server.ts",import.meta.url),"utf8");
 assert.ok(index.indexOf('/v1/public/reviewed-risk-indices')<
   index.indexOf("const auth = authorized(request, env)"));
 assert.match(api,/EXISTING_PROTECTED_GRI_V1_2_PUBLISHER/);
 assert.match(core,/readCurrentReviewedSignedIndices/);
 assert.doesNotMatch(api,/geomacro-news-severity-gri|unverified_observations|groq.com/);
});
