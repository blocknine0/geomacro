import test from "node:test";
import assert from "node:assert/strict";
import {auditEmailResearchSnapshots as audit} from "./audit-predge-29oct-email.mjs";
const C=["geopolitics","macro","rare_earth"];
const count=xs=>Object.fromEntries(C.map(c=>[c,xs.filter(x=>x.category===c).length]));
function pair(){
 let n=0;
 const items=C.flatMap(c=>Array.from({length:5},(_,k)=>{
  const id="synthetic-"+n++,credited=k%2===0;
  return {id,category:c,original_published_at:"2026-10-29T12:00:00.000Z",
   confidence_state:k<4?"MONITORED_SOURCE_REPORT_UNVERIFIED":
    "OFFICIAL_RELEASE_OBSERVED_UNSCORED",commercial_derived_rights_verified:false,
   signed_product_verified:false,payable:false,raw_upstream_delivered:false,chargeable:false,
   ...(credited?{sources_credited:["TEST ONLY"],
    attribution_required:true,attribution_notices:["TEST ONLY"]}:{})};
 }));
 const common={ok:true,schema:"geomacro.derived-news-structural-feed.v1",
  journal_origin:"SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE",
  retention_hours:72,original_release_delay_minutes:0,
  generated_at:"2026-10-29T13:05:00.000Z",
  raw_upstream_delivered:false,chargeable:false,signed:false,commercial_rights_verified:false,
  partner_resale_or_commercial_redistribution_authorized:false};
 const auth={...common,projection:"attributed_research",items,counts:count(items),
  partner_delivery_schema:"geomacro.predge.research-news-delivery.v1",
  partner_delivery_scope:"PRIVATE_NONCOMMERCIAL_RESEARCH_PILOT",
  authentication:"DEDICATED_BEARER_ONLY",attribution_must_be_preserved:true,
  attribution_is_not_a_grant_of_source_rights:true,
  execution_authorized:false,daily_utc_request_hard_cap:500,
  distributed_rate_governor:"ATOMIC_CLOUDFLARE_D1_FAIL_CLOSED"};
 const publicItems=items.filter(i=>!i.sources_credited?.length);
 const pub={...common,projection:"source_neutral",items:publicItems,counts:count(publicItems)};
 return {auth,pub};
}
test("safe partner/public three-domain parity, no signed or paid inference",()=>{
 const {auth,pub}=pair(),r=audit(auth,pub);
 assert.equal(r.private_items,15);assert.equal(r.public_items,6);
 assert.equal(r.credited_count,9);assert.equal(r.no_source_credit_count,6);
 assert.equal(r.unverified_osint_count,12);
 assert.equal(r.public_subset_comparison,
  "PUBLIC_SOURCE_NEUTRAL_IS_SUBSET_OF_PRIVATE_ATTRIBUTED");
 assert.equal(r.historical_comparison,"REQUIRES_OWNER_HELD_SAME_COHORT_BASELINE_ID_SET");
 assert.equal(r.signed_flow_50_per_category_verified,false);
 assert.equal(r.no_source_credit_is_proven_attribution_defect,false);
 assert.ok(!JSON.stringify(r).includes("synthetic-"));
});
test("different snapshot clocks never yield exact parity claim",()=>{
 const {auth,pub}=pair();pub.generated_at="2026-10-29T12:00:00.000Z";
 assert.equal(audit(auth,pub).public_subset_comparison,
  "DIFFERENT_SNAPSHOT_TIMES_INCONCLUSIVE");
});
test("same-cohort unknown public id fails closed",()=>{
 const {auth,pub}=pair();pub.items[0]={...pub.items[0],id:"not-in-partner"};
 assert.throws(()=>audit(auth,pub),/SAME_COHORT_PUBLIC_SUBSET_MISMATCH/);
});
test("reject counted duplicate, invalid credits, impossible payable or signed",()=>{
 let p=pair();p.auth.items[1].id=p.auth.items[0].id;
 assert.throws(()=>audit(p.auth,p.pub),/RECORD_INVALID/);
 p=pair();p.auth.items[0].attribution_notices=[];
 assert.throws(()=>audit(p.auth,p.pub),/RECORD_INVALID/);
 p=pair();p.auth.items[0].payable=true;
 assert.throws(()=>audit(p.auth,p.pub),/RECORD_INVALID/);
 p=pair();p.auth.signed=true;
 assert.throws(()=>audit(p.auth,p.pub),/CONTRACT_INVALID/);
 p=pair();p.auth.counts.macro=99;
 assert.throws(()=>audit(p.auth,p.pub),/CATEGORY_COUNTS_MISMATCH/);
});
