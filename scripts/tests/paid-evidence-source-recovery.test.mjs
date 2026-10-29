import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {planPaidEvidenceRecovery,planPaidEvidenceFromAvailability,verifyRoutingCatalog} from "../ops/plan-paid-evidence-source-recovery.mjs";
const data=JSON.parse(readFileSync("config/paid-evidence-recovery-routes.v1.json","utf8"));
const now=new Date("2026-10-29T00:00:00.000Z");
test("all commercial module names map to EXISTING verified producer filenames; no new writer",()=>{
 const out=verifyRoutingCatalog(data);
 assert.equal(out.verified_module_routes,14);
 assert.ok(out.existing_producer_workflows>=7);
 assert.equal(out.d1_reads,0);
 assert.equal(out.b2_reads,0);
 assert.equal(out.predge_paths_touched,0);
 assert.equal(data.new_source_fetches_authorized,false);
 assert.equal(data.new_d1_writers_authorized,false);
});
test("real USA macro and security gaps get specific upstream routes while minerals is already data eligible",()=>{
 const plan=planPaidEvidenceRecovery({catalog:data,currentNow:now});
 assert.equal(plan.schema,"geomacro.paid-evidence-gap-owner-plan.v1");
 assert.equal(plan.selected_gaps,2);
 assert.equal(plan.first_sale_data_eligible_category,"critical_minerals");
 assert.equal(plan.first_sale_payment_rail,"LOCKED");
 assert.equal(plan.initial_real_sale_possible,false);
 assert.equal(plan.tasks[0].required_module,"macro_monetary");
 assert.equal(plan.tasks[0].existing_producer,"world-bank-ppg-global-shadow-census.yml");
 assert.equal(plan.tasks[1].required_module,"geopolitical_security");
 assert.equal(plan.tasks[1].existing_producer,"three-domain-30m-original-publisher-pulse.yml");
 assert.equal(plan.tasks[0].commercial_data_verified,false);
 assert.equal(plan.tasks[1].signed_output_verified,false);
 assert.equal(plan.guardrails.source_publisher_rights_automatically_granted,false);
});
test("globally route all 195 countries x 3 topics as unverified source needs, without fetching or implying sale",()=>{
 const raw=readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
 const m=raw.match(/const COUNTRY_ROWS=`([\s\S]*?)`;/);
 assert.ok(m);
 const countries=m[1].split("\n").filter(Boolean).map(s=>s.split("|")[0]);
 assert.equal(countries.length,195);
 assert.equal(new Set(countries).size,195);
 let n=0;
 for(const country of countries){
  const plan=planPaidEvidenceRecovery({catalog:data,requestCountries:[country],
    observedMissingModules:["geopolitical_security","macro_monetary","critical_minerals"],currentNow:now});
  assert.equal(plan.tasks.length,3);
  assert.ok(plan.tasks.every(t=>t.commercial_data_verified===false));
  assert.ok(plan.tasks.every(t=>t.subject.country_iso3===country));
  n+=plan.tasks.length;
 }
 assert.equal(n,585);
});
test("no fake publisher, missing proof or unbounded read can make an automatic sale",()=>{
 for(const input of [
   {observedMissingModules:["invented"]},
   {observedMissingModules:Array.from({length:50},()=> "macro_monetary")},
   {requestCountries:["US"]},
   {requestCountries:Array.from({length:10},()=> "USA")},
 ]){
  assert.throws(()=>planPaidEvidenceRecovery({catalog:data,currentNow:now,...input}),/PAID_SOURCE_RECOVERY_/);
 }
 assert.throws(()=>verifyRoutingCatalog({...data,predge_immutable:false}),/CATALOG_POLICY/);
 assert.throws(()=>verifyRoutingCatalog({...data,new_d1_writers_authorized:true}),/CATALOG_POLICY/);
 assert.throws(()=>verifyRoutingCatalog({...data,modules:{...data.modules,
  macro_monetary:{...data.modules.macro_monetary,producer_workflow:"predge-research-continuity.yml"}}}),/SOURCE_ROUTE_NOT_VERIFIED/);
});

test("same current missing modules from real future agent/user availability route dynamically; no paid status",()=>{
 const checkedAt="2026-10-28T23:41:00.000Z";
 const rows=[
  {availability:{deliverable:false,checked_at:checkedAt,
    missing_modules:["macro_monetary","geopolitical_security"],stale_modules:[],
    subjects:[{subject:{type:"country",country_iso3:"USA"}}]}},
  {availability:{deliverable:false,checked_at:checkedAt,
    missing_modules:["critical_minerals"],stale_modules:["macro_monetary"],
    subjects:[{subject:{type:"corridor",origin_country_iso3:"CHN",
      destination_country_iso3:"AUS"}}]}},
  {availability:{deliverable:true,checked_at:checkedAt,
    missing_modules:[],stale_modules:[],subjects:[]}},
 ];
 const q=planPaidEvidenceFromAvailability(rows,{catalog:data,now});
 assert.equal(q.candidate_gap_count,6);
 assert.equal(q.ignored.non_missing,1);
 assert.ok(q.candidate_gaps.every(v=>v.qualified_commercial_evidence===false));
 assert.ok(q.candidate_gaps.some(v=>v.country_iso3==="AUS"&&v.module==="macro_monetary"&&
   v.reason==="STALE_SOURCE_PROOF"));
 assert.ok(q.candidate_gaps.some(v=>v.country_iso3==="USA"&&v.module==="geopolitical_security"));
 assert.equal(q.d1_reads,0);assert.equal(q.payments,0);
});
