import test from "node:test";
import assert from "node:assert/strict";
import {prepareDerivedNewsBatches} from "./derived-news-d1-batches.mjs";

// The real free website journal has always been a DIFFERENT contract from
// third-party reviewed GRO/GRI. Source news is converted to Geomacro-owned
// *unscored derived* records. No blanket upstream commercial licence claimed.
function card(category,id){
 return {
  id:category+"-"+id,
  category,title:"Geomacro finds a new official publication",
  topic:"country policy and supply update",
  what_changed:"An official release was observed in the source newsroom for this category.",
  why_it_matters:"The development may inform monitoring; effects and quantification need confirmation.",
  geography:null,development_type:"official publication",
  published_at:"2026-10-22T00:00:00Z",date_precision:"exact",
  observed_release_count:1,sources_credited:[],
  status:"official_release_observed_unscored",
  same_event_corrob_verified:false,severity:null
 };
}
test("geopolitics macro and minerals facts-only D1 batches work without a commercial rights cert",()=>{
 const cards=[card("geopolitics","01234567"),card("macro","01234567"),
  card("rare_earth","01234567")];
 for(const x of cards){
  assert.equal(Object.hasOwn(x,"source_raw_html"),false);
  assert.equal(Object.hasOwn(x,"commercial_rights_attested"),false);
  assert.equal(Object.hasOwn(x,"reviewer_signature"),false);
  assert.equal(x.same_event_corrob_verified,false);
  assert.equal(x.severity,null);
 }
 const r=prepareDerivedNewsBatches(cards);
 assert.equal(r.signals.length,3);
 assert.equal(r.chunks.flat().length,3);
 const out=JSON.stringify(r);
 assert.equal(out.includes("http"),false);
 assert.equal(out.includes("source_raw_html"),false);
 assert.equal(out.includes("license_granted"),false);
 assert.equal(out.includes("independent_reviewer_signed"),false);
});
test("duplicate IDs with contradictory facts fail closed and do not authorize commercial claims",()=>{
 const a=card("macro","01234567"),b={...a,what_changed:"Contradictory later description"};
 assert.throws(()=>prepareDerivedNewsBatches([a,b]),/DERIVED_NEWS_DUPLICATE_ID_CONFLICT/);
 assert.equal(prepareDerivedNewsBatches([a,a]).signals.length,1);
});
