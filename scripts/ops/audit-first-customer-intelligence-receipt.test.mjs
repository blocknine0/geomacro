import test from "node:test";
import assert from "node:assert/strict";
import {auditFirstCustomerResearchReceipt as audit}
 from "./audit-first-customer-intelligence-receipt.mjs";

const CATEGORIES=["geopolitics","macro","rare_earth"];
function fixture(at="2026-10-29T13:05:00.000Z"){
  const items=[];
  for(const [category,n] of [["geopolitics",7],["macro",8],["rare_earth",6]]){
    for(let i=0;i<n;i++){
      const attributed=items.length<13;
      const unverified=items.length<11;
      items.push({id:category+"-"+i,category,
        original_published_at:"2026-10-29T12:00:00.000Z",
        confidence_state:unverified?"MONITORED_SOURCE_REPORT_UNVERIFIED":
          "OFFICIAL_RELEASE_OBSERVED_UNSCORED",
        commercial_derived_rights_verified:false,signed_product_verified:false,
        raw_upstream_delivered:false,chargeable:false,payable:false,
        ...(attributed?{sources_credited:["Official source"],
          attribution_required:true,attribution_notices:["Official source"]}:{}),
      });
    }
  }
  const counts=Object.fromEntries(CATEGORIES.map(c=>[c,items.filter(x=>x.category===c).length]));
  return {ok:true,schema:"geomacro.derived-news-structural-feed.v1",
    partner_delivery_schema:"geomacro.predge.research-news-delivery.v1",
    partner_delivery_scope:"PRIVATE_NONCOMMERCIAL_RESEARCH_PILOT",
    authentication:"DEDICATED_BEARER_ONLY",
    attribution_must_be_preserved:true,attribution_is_not_a_grant_of_source_rights:true,
    daily_utc_request_hard_cap:500,execution_authorized:false,
    journal_origin:"SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE",
    retention_hours:72,original_release_delay_minutes:0,
    raw_upstream_delivered:false,commercial_rights_verified:false,
    partner_resale_or_commercial_redistribution_authorized:false,
    signed:false,chargeable:false,projection:"attributed_research",
    generated_at:at,counts,items};
}
function publicSubset(partner,at=partner.generated_at){
  const items=partner.items.filter(i=>!(i.sources_credited?.length));
  return {ok:true,schema:partner.schema,projection:"source_neutral",
    journal_origin:partner.journal_origin,retention_hours:72,
    original_release_delay_minutes:0,raw_upstream_delivered:false,
    commercial_rights_verified:false,
    partner_resale_or_commercial_redistribution_authorized:false,
    signed:false,chargeable:false,generated_at:at,items,
    counts:Object.fromEntries(CATEGORIES.map(c=>[c,items.filter(x=>x.category===c).length]))};
}
test("synthetic 21 partner items/13 credited/11 unverified remain research only",()=>{
  const result=audit(fixture());
  assert.equal(result.partner_total,21);
  assert.deepEqual(result.partner_by_category,{geopolitics:7,macro:8,rare_earth:6});
  assert.equal(result.partner_required_attribution_items,13);
  assert.equal(result.partner_by_confidence_state.MONITORED_SOURCE_REPORT_UNVERIFIED
    .geopolitics+result.partner_by_confidence_state.MONITORED_SOURCE_REPORT_UNVERIFIED
    .macro+result.partner_by_confidence_state.MONITORED_SOURCE_REPORT_UNVERIFIED
    .rare_earth,11);
  assert.equal(result.research_preview_capacity_by_category.rare_earth.research_candidates,6);
  assert.equal(result.production_signed_50_per_category_verified,false);
  assert.equal(result.commercial_payment_authorized,false);
  assert.equal(JSON.stringify(result).includes("geopolitics-0"),false);
});
test("same-time source-neutral subset accepted; credited records not leaked",()=>{
  const p=fixture(), result=audit(p,publicSubset(p));
  assert.equal(result.public_total,8);
  assert.equal(result.public_same_cohort_comparison,"PASS_SOURCE_NEUTRAL_IDS_SUBSET_OF_ATTRIBUTED");
});
test("different 72h snapshots cannot be asserted as ID parity",()=>{
  const p=fixture(),pub=publicSubset(p,"2026-10-29T12:00:00.000Z");
  const result=audit(p,pub);
  assert.equal(result.public_same_cohort_comparison,"DIFFERENT_SNAPSHOT_TIMES_INCONCLUSIVE");
});
test("same-time public IDs not in authenticated feed must fail",()=>{
  const p=fixture(),pub=publicSubset(p);
  pub.items[0]={...pub.items[0],id:"unproven-extra"};
  assert.throws(()=>audit(p,pub),/SAME_COHORT_PUBLIC_SUBSET_MISMATCH/);
});
test("reject a forged commercial/paid flag or signed status",()=>{
  const p=fixture();
  p.items[0]={...p.items[0],payable:true};
  assert.throws(()=>audit(p),/RECORD_INVALID/);
  const q=fixture();q.signed=true;
  assert.throws(()=>audit(q),/CONTRACT_INVALID/);
});
test("reject duplicate or incomplete feed without guessing counts",()=>{
  const p=fixture();p.items[1].id=p.items[0].id;
  assert.throws(()=>audit(p),/RECORD_INVALID/);
  const q=fixture();q.counts.macro--;
  assert.throws(()=>audit(q),/COUNTS_OR_UNFILTERED_COHORT_INVALID/);
});
