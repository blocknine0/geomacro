import test from "node:test";
import assert from "node:assert/strict";
import {verifyOneShotLiveParity} from "../ops/verify-website-predge-one-shot-live-parity.mjs";
import {buildDerivedNewsStructural} from "../../src/lib/derived-news-structural-bridge.ts";
import {verifyDerivedStory} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import {isPermanentArchiveSignal} from "../ops/publish-permanent-derived-news-archive.mjs";

const now=Date.parse("2026-10-29T10:00:00.000Z");
const cats=["geopolitics","macro","rare_earth"];
const credits=["","Federal Reserve Board","Natural Resources Canada"];
function row(category,i,credit=credits[i]){
 return {id:category+"-"+(i+1).toString(16).padStart(8,"0"),
  category,title:"Geomacro finds an original policy update affecting "+category,
  what_changed:"An original government issuer publicly released a dated policy development for research.",
  why_it_matters:"The source announcement informs risk context without independently verifying impact.",
  topic:["foreign policy","monetary policy","critical-minerals policy"][i],
  geography:null,development_type:"policy update",
  published_at:"2026-10-29T09:00:00.000Z",date_precision:"exact",
  observed_release_count:1,sources_credited:credit?[credit]:[],
  status:"official_release_observed_unscored",same_event_corrob_verified:false,severity:null,
 };
}
function fixture(){
 const archive=cats.map((c,i)=>row(c,i));
 const items=buildDerivedNewsStructural(archive,now,"attributed_research");
 const counts=Object.fromEntries(cats.map(c=>[c,items.filter(x=>x.category===c).length]));
 return {archive,now,observedAt:now,
 canonicalBundle:{ok:true,schema:"geomacro.website-derived-news-bundle.v1",
  checked_at:new Date(now).toISOString(),delivery_scope:"free_website_only",
  complete:true,item_cap:600,retention_hours:72,original_release_delay_minutes:0,
  returned_rows:archive.length,signals:archive},
 partner:{ok:true,generated_at:new Date(now).toISOString(),
  partner_delivery_schema:"geomacro.predge.research-news-delivery.v1",
  authentication:"DEDICATED_BEARER_ONLY",
  partner_delivery_scope:"PRIVATE_NONCOMMERCIAL_RESEARCH_PILOT",
  projection:"attributed_research",
  journal_origin:"SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE",
  attribution_must_be_preserved:true,attribution_is_not_a_grant_of_source_rights:true,
  daily_utc_request_hard_cap:500,distributed_rate_governor:"ATOMIC_CLOUDFLARE_D1_FAIL_CLOSED",
  retention_hours:72,original_release_delay_minutes:0,raw_upstream_delivered:false,
  chargeable:false,execution_authorized:false,
  partner_resale_or_commercial_redistribution_authorized:false,
  unrecognized_source_credits_still_withheld:true,items,counts},
 };
}
test("same bounded 72h cohort exactly delivers all three categories and source credits",()=>{
 const f=fixture();
 for(const s of f.archive){
  assert.equal(verifyDerivedStory(s,now),true);
  assert.equal(isPermanentArchiveSignal(s,now,{allowHistorical:false}),true);
 }
 const r=verifyOneShotLiveParity(f);
 assert.equal(r.production_acceptance,"PASS_EXACT_SOURCE_NATIVE_ID_AND_ATTRIBUTION");
 assert.equal(r.covered_eligible_archive_ids,3);
 assert.deepEqual(r.eligible_archive_by_category,
  {geopolitics:1,macro:1,rare_earth:1});
 assert.deepEqual(r.withheld_unknown_credits_by_category,
  {geopolitics:0,macro:0,rare_earth:0});
 assert.equal(r.exact_complete_canonical_d1_journal_projection_verified,true);
 assert.equal(r.authenticated_partner_readback_verified,true);
 assert.equal(r.additional_partner_gets,1);
 assert.equal(r.canonical_bundle_gets,1);
 assert.equal(r.payments,0);
});
test("unknown attribution credit remains withheld; release never promoted",()=>{
 const f=fixture();
 const unknown=row("rare_earth",2,"Unknown Mineral Data Syndicator");
 f.archive[2]=unknown;f.canonicalBundle.signals[2]=unknown;
 f.partner.items=buildDerivedNewsStructural(f.canonicalBundle.signals,now,"attributed_research");
 f.partner.counts=Object.fromEntries(cats.map(c=>[c,f.partner.items.filter(x=>x.category===c).length]));
 const r=verifyOneShotLiveParity(f);
 assert.equal(r.withheld_unknown_credits_by_category.rare_earth,1);
 assert.equal(r.authenticated_partner_by_category.rare_earth,0);
});
test("missing archive ID, changed native clock, partner payload change always fail closed",()=>{
 for(const mutate of [
  f=>{f.canonicalBundle.signals=f.canonicalBundle.signals.slice(1);f.canonicalBundle.returned_rows=2},
  f=>{f.canonicalBundle.signals=[{...f.canonicalBundle.signals[0],
    published_at:"2026-10-29T09:00:01.000Z"},...f.canonicalBundle.signals.slice(1)]},
  f=>{f.partner.items[0]={...f.partner.items[0],observed_change:"altered text"}},
  f=>{f.partner.items=f.partner.items.slice(1)},
  f=>{f.partner.daily_utc_request_hard_cap=501},
  f=>{f.partner.attribution_must_be_preserved=false},
 ]){
  const f=fixture();mutate(f);
  assert.throws(()=>verifyOneShotLiveParity(f));
 }
});
test("captures more than 90 seconds apart cannot be certified as exact cohort",()=>{
 const f=fixture();f.partner.generated_at=new Date(now+120_000).toISOString();
 assert.throws(()=>verifyOneShotLiveParity(f),/COHORT_CLOCK_SPLIT_OR_STALE/);
});
test("never count archival static candidate or unverified OSINT as commercially qualified",()=>{
 const f=fixture();
 const s={...row("macro",1),"status":"official_feed_candidate_unscored",
  topic:"macro publisher candidate",development_type:"unclassified publisher update",
  geography:null};
 f.archive[1]=s;f.canonicalBundle.signals[1]=s;
 f.partner.items=buildDerivedNewsStructural(f.canonicalBundle.signals,now,"attributed_research");
 f.partner.counts=Object.fromEntries(cats.map(c=>[c,f.partner.items.filter(x=>x.category===c).length]));
 const r=verifyOneShotLiveParity(f);
 assert.equal(r.paid_or_signed_products_verified,false);
 assert.equal(f.partner.items.find(x=>x.id===s.id).qualifying_topic_release_verified,false);
});
