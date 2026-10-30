import test from "node:test";
import assert from "node:assert/strict";
import {reconcileAcknowledgedDerivedNews} from "../lib/phase2g-per-id-d1-reconciliation.mjs";
const now=Date.parse("2026-10-30T06:00:00.000Z");
const sourceSha="a".repeat(40);
function sample(category,id){
 return {id:category+"-"+id,category,
  title:"Geomacro finds an original official policy release",
  what_changed:"An official institution published a policy update for "+category+".",
  why_it_matters:"The statement may affect future decisions, but independent causal evidence is not yet available.",
  topic:{geopolitics:"foreign policy",macro:"monetary policy",rare_earth:"critical-minerals policy"}[category],
  development_type:"policy update",geography:"India",
  published_at:"2026-10-30T05:00:00.000Z",date_precision:"exact",
  observed_release_count:1,sources_credited:[],
  status:"official_release_observed_unscored",
  same_event_corrob_verified:false,severity:null};
}
const geo=sample("geopolitics","1234abcd");
const macro=sample("macro","2345abcd");
const mineral=sample("rare_earth","3456abcd");
const priorMacro={...macro,why_it_matters:"The statement has not yet established a measured market effect."};
const prior=[priorMacro,mineral];
const latest=[geo,macro,mineral];
const args={before:prior,after:latest,acknowledged:latest,now,sourceSha};
test("exact three-category IDs classify newly observed, revised and unchanged",()=>{
 const receipt=reconcileAcknowledgedDerivedNews(args);
 assert.equal(receipt.actual_acknowledged_ids,3);
 assert.equal(receipt.complete_independent_get,true);
 assert.equal(receipt.counts.geopolitics.newly_observed,1);
 assert.equal(receipt.counts.macro.updated_observed,1);
 assert.equal(receipt.counts.rare_earth.unchanged_observed,1);
 for(const row of receipt.ids){
  assert.match(row.id_sha256,/^[0-9a-f]{64}$/u);
  assert.match(row.payload_sha256,/^[0-9a-f]{64}$/u);
  assert.equal(row.native_publication_time_preserved,true);
  assert.equal(row.published_at,"2026-10-30T05:00:00.000Z");
  assert.equal(row.paid_eligible,false);
  assert.equal(row.independent_get_exact_match,true);
 }
 assert.equal(receipt.sqlite_physical_change_counters_not_inferred,true);
 assert.equal(receipt.commercial_rights_verified,false);
 assert.equal(receipt.predge_modified,false);
 assert.equal(receipt.payments,0);
});
test("missing, duplicate, stale, forged or divergent post-write IDs fail closed",()=>{
 const bad=[
  {...args,after:[macro,mineral]},
  {...args,acknowledged:[geo,geo]},
  {...args,after:[{...geo,published_at:"2026-10-29T05:00:00.000Z"},macro,mineral]},
  {...args,before:[{...geo,published_at:"2026-10-29T05:00:00.000Z"},priorMacro,mineral]},
  {...args,after:[{...geo,why_it_matters:"Forged interpretation"},macro,mineral]},
  {...args,acknowledged:[{...geo,source_url:"https://example.invalid"},macro,mineral]},
  {...args,sourceSha:"invalid"},
  {...args,before:Array.from({length:601},(_,i)=>sample("macro",String(i).padStart(8,"0")))}
 ];
 for(const x of bad)assert.throws(()=>reconcileAcknowledgedDerivedNews(x),
  /PHASE2G_D1_RECONCILIATION_/u);
});
test("does not invent successful readback when no acknowledgement exists",()=>{
 assert.throws(()=>reconcileAcknowledgedDerivedNews({
  before:[],after:[],acknowledged:[],now,sourceSha
 }),/PHASE2G_D1_RECONCILIATION_INPUT_INVALID/u);
});
