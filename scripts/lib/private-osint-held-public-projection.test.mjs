import test from "node:test";
import assert from "node:assert/strict";
import {buildHeldPrivateOsintProjection,projectHeldPrivateOsintItem} from "./private-osint-held-public-projection.mjs";
import {isPermanentArchiveSignal} from "../ops/publish-permanent-derived-news-archive.mjs";

const NOW=Date.parse("2026-11-16T12:00:00.000Z");
const categories=["geopolitics","macro","rare_earth"];
function item(category,index){
 return {
  schema:"geomacro.reusable-news-json.v1",id:"news-"+String(index).padStart(64,"a"),
  id_is_cryptographic_proof:false,category,country_iso3:"IND",
  source:{publisher_name:null,original_url:null,
   original_published_at:new Date(NOW-index*60_000).toISOString()},
  facts:{event_types:[category],action_terms:[category],named_organizations:[],
   numeric_mentions:[],fact_extraction_status:"MACHINE_EXTRACTED_UNVERIFIED"},
  usage_rights:{declared_source_license:"unknown",declaration_is_verified:false,
   article_specific_permission_verified:false,commercial_reuse_authorized:false,
   attribution_and_scope_review_required:true,factual_analysis_only:true},
  verification:{original_page_verified:false,independent_event_verified:false,
   facts_reviewed:false,source_licence_verified:false},
  delivery:{raw_article_included:false,raw_headline_included:false,
   downstream_paid_product_authorized:false,signing_authorized:false,
   user_submission_persisted:false},
 };
}

test("held private observations project to source-neutral cards in all three existing Website Intelligence categories",()=>{
 const items=categories.map((category,index)=>item(category,index));
 const projection=buildHeldPrivateOsintProjection(items,NOW);
 assert.equal(projection.signals.length,3);
 assert.deepEqual(new Set(projection.signals.map(row=>row.category)),new Set(categories));
 assert.ok(projection.signals.every(row=>isPermanentArchiveSignal(row,NOW,{allowHistorical:false})));
 assert.equal(projection.raw_source_text_included,false);
 assert.equal(projection.source_urls_included,false);
 assert.equal(projection.private_items_included,false);
 assert.equal(projection.scored,false);
 assert.equal(projection.chargeable,false);
 assert.equal(projection.paid_eligible,false);
 const serialized=JSON.stringify(projection);
 for(const forbidden of ["publisher_name","original_url","source.example","country_iso3","IND","raw headline"])
  assert.ok(!serialized.includes(forbidden),`projection leaked ${forbidden}`);
 assert.ok(projection.signals.every(row=>!row.title.includes("UNVERIFIED WATCH · NO SCORE")));
});

test("held projection retains native publication clocks, caps rows, and rejects invalid/expired normalized records",()=>{
 const rows=Array.from({length:8},(_,index)=>item(categories[index%3],index));
 const bounded=buildHeldPrivateOsintProjection(rows,NOW,4);
 assert.equal(bounded.signals.length,4);
 assert.deepEqual(bounded.signals.slice(0,3).map(row=>row.category),categories);
 assert.equal(bounded.signals[0].published_at,new Date(NOW).toISOString());
 const expired=item("macro",9);
 expired.source.original_published_at=new Date(NOW-26*60*60_000).toISOString();
 assert.throws(()=>projectHeldPrivateOsintItem(expired,NOW),/REUSABLE_SOURCE_NEWS_INVALID/);
});
