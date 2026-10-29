import test from "node:test";
import assert from "node:assert/strict";
import {reconcileHistoricalSnapshots as reconcile,auditProvenanceAndPreview as audit,
 validateProposedNewsContext as draft} from "./verify-owner-partner-four-gates.mjs";
const C=["geopolitics","macro","rare_earth"];
function feed(utc="2026-10-29T12:05:00.000Z",n=3){
 const items=C.flatMap(category=>Array.from({length:n},(_,i)=>({
  id:category+"-"+i,category,
  original_published_at:"2026-10-29T10:00:00.000Z",
  confidence_state:i===0?"MONITORED_SOURCE_REPORT_UNVERIFIED":
    i===1?"DATED_OFFICIAL_FEED_CANDIDATE_UNCLASSIFIED":"OFFICIAL_RELEASE_OBSERVED_UNSCORED",
  ...(i===0?{sources_credited:["Example issuer"],
   attribution_required:true,attribution_notices:["Example issuer"]}:{}),
  event_detail_verified:false,independent_same_event_verified:false,
  numeric_impact_established:false,signed_product_verified:false,
  payable:false,commercial_derived_rights_verified:false
 })));
 return {ok:true,schema:"geomacro.derived-news-structural-feed.v1",
  journal_origin:"SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE",
  projection:"attributed_research",generated_at:utc,
  retention_hours:72,raw_upstream_delivered:false,signed:false,
  chargeable:false,partner_resale_or_commercial_redistribution_authorized:false,
  items,counts:Object.fromEntries(C.map(c=>[c,items.filter(i=>i.category===c).length]))};
}
test("missing historical ID cohort is explicitly inconclusive",()=>{
 const x=reconcile(null,feed());
 assert.equal(x.exact_historical_reconciliation_verified,false);
 assert.equal(x.partner_outage_inferred,false);
});
test("exact ID deltas, category changes and native clock integrity",()=>{
 const a=feed(),b=feed("2026-10-29T13:05:00.000Z");
 b.items=b.items.filter(x=>x.id!=="rare_earth-0");
 b.items.push({...a.items[0],id:"geopolitics-3"});
 b.counts={geopolitics:4,macro:3,rare_earth:2};
 const v=reconcile(a,b);
 assert.equal(v.by_category.entered.geopolitics,1);
 assert.equal(v.by_category.left.rare_earth,1);
 assert.equal(v.source_native_identity_preserved_for_retained_ids,true);
 assert.equal(v.publisher_cause_or_delivery_outage_verified,false);
});
test("historical snapshots must be same projection, IDs and native clocks",()=>{
 const a=feed(),b=feed();b.projection="source_neutral";
 assert.throws(()=>reconcile(a,b),/DIFFERENT_PROJECTIONS|SOURCE_NEUTRAL_CREDIT/);
 const c=feed(),d=feed();d.items[0].original_published_at="2026-10-29T11:00:00Z";
 assert.throws(()=>reconcile(c,d),/ID_NATIVE_IDENTITY_CHANGED/);
});
test("source-credit missing is not legally proven violation; OSINT remains unverified",()=>{
 const a=audit(feed());
 assert.equal(a.source_credit_notice_present.geopolitics,1);
 assert.equal(a.source_credit_absent_not_proven_defect.geopolitics,2);
 assert.equal(a.monitored_osint_unverified.macro,1);
 assert.equal(a.official_observed_unscored.rare_earth,1);
 assert.equal(a.signed_50_each_verified,false);
 assert.equal(a.commercial_permission_verified,false);
 assert.equal(a.current_risk_gate_schema_has_news_context,false);
});
test("research 50/category capacity is not signed capability",()=>{
 const a=audit(feed("2026-10-29T12:05:00Z",50));
 assert.equal(a.fifty_each_advisory_possible,true);
 assert.equal(a.signed_50_each_verified,false);
 assert.equal(a.production_gro_proof_verified,false);
});
test("no silent research item scoring or payable privilege escalation",()=>{
 const v=feed();v.items[0].numeric_impact_established=true;
 assert.throws(()=>audit(v),/RESEARCH_ITEM_INCORRECTLY_CERTIFIED/);
 const w=feed();w.items[0].payable=true;
 assert.throws(()=>audit(w),/SNAPSHOT_ITEM/);
});
test("draft news_context may not pretend to be signed or production compatible",()=>{
 const f=feed(),candidate={
  schema:"geomacro.news-context.draft.v1",research_only:true,
  signed_news:false,execution_authorized:false,retention_hours:72,
  partner_validator_approved:false,commercial_rights_verified:false,
  categories:{geopolitics:["geopolitics-0"],macro:["macro-2"],rare_earth:[]}
 };
 const p=draft(candidate,f);
 assert.equal(p.status,"VALID_OFFLINE_DRAFT_NOT_RISK_GATE_1_0_COMPATIBLE");
 assert.equal(p.signed_news_verified,false);
 assert.throws(()=>draft({...candidate,signed_news:true},f),/NEWS_CONTEXT_DRAFT_INVALID/);
 assert.throws(()=>draft({...candidate,categories:{...candidate.categories,macro:["rare_earth-0"]}},f),/NEWS_CONTEXT_ID_NOT_IN_CURRENT_FEED/);
 assert.throws(()=>draft({...candidate,categories:{...candidate.categories,macro:Array(51).fill("macro-0")}},f),/NEWS_CONTEXT_CATEGORY_CAP/);
});
test("different 72-hour retention windows cannot prove delivery loss",()=>{
 const p=feed("2026-10-26T10:00:00Z"),c=feed("2026-10-29T12:05:00Z");
 assert.equal(reconcile(p,c).status,"DIFFERENT_72H_WINDOWS_NO_DATA_LOSS_INFERENCE");
});
