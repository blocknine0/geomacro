import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {buildPrivateCorridorStructuredResearch}
 from "./corridor-derived-structured-research.mjs";
import {evidenceFromCorridorObservations,hashStructuredEvidence}
 from "./corridor-source-evidence-proof.mjs";
const clock="2026-11-02T02:06:00.000Z";
const row=(source_id,metric_id,numeric_value,period="2026-11-01",corridor_ids=[])=>({
 id:createHash("sha256").update([source_id,metric_id,period,String(numeric_value)]
   .join("\x1f")).digest("hex"),
 source_id,metric_id,observation_period:period,numeric_value,
 observed_at:clock,source_native_publication_at:null,
 source_observation_is_not_live_event:true,corridor_ids,
 context_only:true,independently_verified_event:false,
 commercial_rights_verified:false,customer_delivery_enabled:false
});
const make=(observations=[])=>({
 channel:"CORRIDOR_ONLY",checked_at:clock,
 news_candidate_count:2,official_reference_observations:observations
});
test("numeric source evidence yields five original analysis parts with reproducible provenance",()=>{
 const receipt=make([
  row("imf_portwatch","portwatch_daily_transit_pct_change",-7.2,"2026-11-01",["suez_canal"]),
  row("world_bank_wdi","wdi_gdp_growth_in",6.7,"2025"),
  row("ecb_data","ecb_usd_eur_spot",1.15,"2026-10-30")
 ]);
 const output=buildPrivateCorridorStructuredResearch({sourceReceipt:receipt});
 assert.equal(output.structured_record_count,3);
 assert.equal(output.evidence_bundle.proof_count,3);
 assert.match(output.analysis_manifest_sha256,/^[a-f0-9]{64}$/u);
 for(const d of output.structured_records){
  assert.ok(d.what_happened.length>25);
  assert.ok(d.why_it_matters.length>25);
  assert.ok(d.market_relevance.length>25);
  assert.ok(d.what_to_watch.length>25);
  assert.ok(d.evidence_and_confidence.source_url.startsWith("https://"));
  assert.match(d.source_proof_sha256,/^[a-f0-9]{64}$/u);
  assert.equal(d.evidence_and_confidence.source_observation_checksum_verified,true);
  assert.equal(d.evidence_and_confidence.source_native_publication_time_verified,false);
  assert.equal(d.evidence_and_confidence.independent_event_corroboration,false);
  assert.equal(d.evidence_and_confidence.confidence,"SOURCE_METADATA_ONLY");
  assert.equal(d.verified_news_event,false);
  assert.equal(d.customer_delivery_authorized,false);
  assert.equal(d.commercial_eligible,false);
 }
 assert.equal(output.source_article_candidates_not_converted,2);
 assert.equal(output.independent_event_evidence_verified,false);
 assert.equal(output.website_intelligence_writes,0);
 assert.equal(output.predge_writes,0);
});
test("hash proof is recomputed and tampered source measurements are rejected",()=>{
 const expected=row("fred_api","fred_wti_usd_per_barrel",77.25);
 const r=make([expected]);
 assert.equal(buildPrivateCorridorStructuredResearch({sourceReceipt:r}).evidence_bundle.proof_count,1);
 for(const patch of [
  {numeric_value:100000000},
  {id:"e".repeat(64)},
  {source_id:"fake"},
  {commercial_rights_verified:true},
  {independently_verified_event:true},
  {observed_at:"2026-09-01T00:00:00.000Z"},
  {customer_delivery_enabled:true},
  {corridor_ids:["../secrets"]}
 ]){
  assert.throws(()=>buildPrivateCorridorStructuredResearch({sourceReceipt:
    make([{...expected,...patch}])}),/CORRIDOR_EVIDENCE_PROVENANCE_UNVERIFIED|CORRIDOR_DERIVED_SOURCE_PROVENANCE_INVALID/u);
 }
 assert.throws(()=>buildPrivateCorridorStructuredResearch({sourceReceipt:
   make([expected,expected])}),/CORRIDOR_EVIDENCE_PROVENANCE_UNVERIFIED/u);
});
test("same source values do not count as independent corroboration",()=>{
 const input=make([row("fred_api","fred_dgs10_yield_percent",4.2)]);
 const a=buildPrivateCorridorStructuredResearch({sourceReceipt:input});
 const p=a.evidence_bundle.proofs[0];
 assert.equal(p.evidence_status,"SINGLE_SOURCE_OBSERVATION_ONLY");
 assert.equal(p.independently_corroborated,false);
 assert.equal(p.independent_sources_checked,0);
 assert.equal(p.event_facts_verified,false);
 assert.equal(p.source_record_id_recomputed,true);
 assert.equal(p.proof_sha256,hashStructuredEvidence(
  Object.fromEntries(Object.entries(p).filter(([k])=>k!=="proof_sha256"))));
});
test("independent source numeric conflict flags disagreement and never fabricates event proof",()=>{
 const receipt=make([row("publisher_one","shared_metric",4.2),
  row("publisher_two","shared_metric",9.2)]);
 const proof=evidenceFromCorridorObservations({
  receipt,sourceLookup:id=>({source_url:id==="publisher_one"?
   "https://one.example.org/official":"https://two.example.org/data"})
 });
 assert.equal(proof.proof_count,2);
 assert.ok(proof.proofs.every(p=>p.evidence_status==="CONFLICTING_SOURCE_OBSERVATIONS"&&
   p.conflicting_source_records===1&&p.independently_corroborated===false&&
   p.event_facts_verified===false));
});
test("independent matching values only corroborate numeric assertion, not physical event",()=>{
 const receipt=make([row("publisher_one","shared_metric",4.2),
  row("publisher_two","shared_metric",4.2)]);
 const proof=evidenceFromCorridorObservations({
  receipt,sourceLookup:id=>({source_url:id==="publisher_one"?
   "https://one.example.org/official":"https://two.example.org/data"})
 });
 assert.equal(proof.proof_count,2);
 assert.ok(proof.proofs.every(p=>p.evidence_status==="MULTISOURCE_NUMERIC_CLAIM_MATCH"&&
   p.independently_corroborated===true&&p.event_facts_verified===false));
});
test("empty source evidence never generates fake news or proof",()=>{
 const output=buildPrivateCorridorStructuredResearch({sourceReceipt:make([])});
 assert.equal(output.structured_record_count,0);
 assert.equal(output.evidence_bundle.proof_count,0);
 assert.equal(output.source_article_candidates_not_converted,2);
 assert.equal(output.commercial_eligible,false);
});
