import test from "node:test";
import assert from "node:assert/strict";
import {
 auditThreeDomainLive,verifyStructuredDeliveryEnvelope,
 STRUCTURED_API,CONTINUITY_API,FACTUAL_API,
} from "../ops/audit-three-domain-machine-delivery-live.mjs";

const NOW=Date.parse("2026-10-30T01:00:00.000Z");
const STAMP="2026-10-30T00:58:00.000Z";
const CATS=["geopolitics","macro","rare_earth"];
const news=(c)=>({
 record_id:c+"-deadbeef",category:c,record_kind:"native_dated_source_release",
 topic:c==="geopolitics"?"foreign policy":c==="macro"?"monetary policy":"rare-earth supply",
 development_type:"official release observation",
 original_published_at:"2026-10-29T22:20:00.000Z",
 original_publication_day:"2026-10-29",date_precision:"exact",
 observation_period:null,clock_semantics:"issuer_native_datetime",
 what_changed:"Issuer-native dated original source observation captured in the category.",
 why_it_matters:c==="geopolitics"?
  "This statement may affect diplomatic exposure, but independently corroborated impact is not established.":
  c==="macro"?"Central-bank material may inform FX and financing assumptions without an observed causal market claim.":
  "The minerals release may inform supply-chain scenarios without independently verified physical shipments.",
 country_iso3:null,corroboration_status:"NOT_INDEPENDENTLY_VERIFIED",
 severity:null,market_direction:null,commercially_qualified:false,
});
const reference=(c)=>({
 record_id:"official:2025:"+c,category:c,
 record_kind:"official_statistical_or_reference_context",
 topic:"annual_statistical_reference",observation_period:"2025",
 clock_semantics:"reference_year",original_published_at:null,
 what_changed:"An official year-dated historical reference is present for this domain.",
 why_it_matters:"Year-dated context is a historical baseline and does not certify any new original event.",
 country_iso3:null,corroboration_status:"NOT_INDEPENDENTLY_VERIFIED",
 severity:null,market_direction:null,commercially_qualified:false,
});
function structured({noNews=[],missing=[],stale=[]}={}){
 const categories={};
 for(const c of CATS){
  const records=noNews.includes(c)||missing.includes(c)?[]:[news(c)];
  const refs=missing.includes(c)?[]:[reference(c)];
  const has=records.length+refs.length>0;
  categories[c]={
   category:c,label:c,delivery_state:!has?"NO_OBSERVATION_AVAILABLE":
    stale.includes(c)?"OBSERVATIONS_WITHOUT_CURRENT_SOURCE_CHECK":
    "OBSERVATIONS_WITH_CURRENT_SOURCE_CHECK",
   source_check_current:!stale.includes(c),
   last_source_check_at:stale.includes(c)?"2026-10-29T17:00:00.000Z":STAMP,
   publication_window_hours:72,native_release_records:records,
   official_reference_records:refs,
   native_release_records_count:records.length,
   official_reference_records_count:refs.length,
   source_credits_required:[],source_data_present:has,
   qualified_paid_records_count:0,signed_risk_available:false,
   no_new_release_is_not_a_source_failure:true,
  };
 }
 return {ok:true,schema:"geomacro.three-domain-structured-delivery.v1",
  generated_at:STAMP,product:"geomacro_source_derived_three_domain_observations",
  delivery_channel:"PUBLIC_READ_ONLY_STRUCTURED_JSON",
  delivery_state:CATS.every(c=>categories[c].source_data_present)?
   "THREE_CATEGORIES_WITH_MEASURED_OBSERVATIONS":"PARTIAL_OR_EMPTY_SOURCE_OBSERVATIONS",
  categories,category_count:3,original_news_window_complete:true,
  data_quality:{open_reference_is_not_current_news:true,
   issuer_country_does_not_prove_event_country:true,
   paid_store_delivery_verified:false},
  commercial:{chargeable:false,payment_required:false,
   payment_authorized:false,commercially_qualified:false,
   paid_evidence_must_be_separately_verified:true},
  raw_upstream_delivered:false,upstream_source_ids_delivered:false,
 };
}
const continuation=()=>({
 ok:true,schema:"geomacro.three-domain-evidence-continuity.v1",
 chargeable:false,three_domains_returned:true,raw_upstream_delivered:false,
 categories:Object.fromEntries(CATS.map(c=>[c,{}])),
});
const factual=()=>({ok:true,schema:"geomacro.reusable-source-news-feed.v1",
 commercial_product_ready:false,public_raw_article_delivery:false,
 article_licenses_automatically_granted:false,window_hours:25,items:[],
 has_more:false});
const deep=x=>structuredClone(x);
const fakeFetch=(doc=structured(),ctx=continuation(),facts=factual())=>{
 const urls=[],methods=[],options=[];
 const fetchImpl=async(url,opts)=>{
  urls.push(url);methods.push(opts.method);options.push(opts);
  if(opts.method==="POST"||url.includes("?country="))
   return new Response("This method/query is unsupported",{status:404});
  if(url===STRUCTURED_API)return Response.json(doc);
  if(url===CONTINUITY_API)return Response.json(ctx);
  if(url===FACTUAL_API)return Response.json(facts);
  throw Error("UNEXPECTED_NETWORK_TARGET");
 };
 return {fetchImpl,urls,methods,options};
};
test("separates 3 category analyses, real native clocks and historical reference periods",()=>{
 const x=verifyStructuredDeliveryEnvelope(structured(),NOW);
 assert.equal(x.all_categories_with_data,true);
 assert.equal(x.all_categories_with_native_news,true);
 assert.equal(x.native_news_total,3);
 assert.equal(x.reference_total,3);
 for(const c of CATS)assert.equal(x.categories[c].delivery_state,
  "OBSERVATIONS_WITH_CURRENT_SOURCE_CHECK");
});
test("3-domain reference-only output succeeds but cannot be described as current original news",()=>{
 const x=verifyStructuredDeliveryEnvelope(
  structured({noNews:["macro","rare_earth"]}),NOW);
 assert.equal(x.all_categories_with_data,true);
 assert.equal(x.all_categories_with_native_news,false);
 assert.equal(x.categories.macro.native_news,0);
 assert.equal(x.categories.rare_earth.official_reference,1);
});
test("partial and stale categories are explicitly represented; no manufactured events",()=>{
 const x=verifyStructuredDeliveryEnvelope(
  structured({missing:["rare_earth"],stale:["macro"]}),NOW);
 assert.equal(x.all_categories_with_data,false);
 assert.equal(x.categories.rare_earth.delivery_state,"NO_OBSERVATION_AVAILABLE");
 assert.equal(x.categories.macro.delivery_state,"OBSERVATIONS_WITHOUT_CURRENT_SOURCE_CHECK");
});
test("rejects paid fields, forged category and source clock, mismatched counts",()=>{
 const mutators=[
  x=>{x.commercial.chargeable=true},
  x=>{x.commercial.payment_authorized=true},
  x=>{x.data_quality.paid_store_delivery_verified=true},
  x=>{x.categories.geopolitics.qualified_paid_records_count=1},
  x=>{x.categories.macro.signed_risk_available=true},
  x=>{x.categories.macro.native_release_records_count=100},
  x=>{x.categories.macro.native_release_records[0].category="geopolitics"},
  x=>{x.categories.macro.native_release_records[0].country_iso3="USA"},
  x=>{x.categories.macro.native_release_records[0].severity=99},
  x=>{x.categories.macro.native_release_records[0].commercially_qualified=true},
  x=>{x.categories.macro.native_release_records[0].original_published_at="2099-01-01T00:00:00.000Z"},
  x=>{x.categories.macro.official_reference_records[0].original_published_at=STAMP},
  x=>{x.categories.macro.official_reference_records[0].raw_article="private bytes"},
  x=>{x.generated_at="2026-10-25T00:00:00.000Z"},
  x=>{x.categories.macro.source_check_current=true;x.categories.macro.last_source_check_at="2026-10-28T00:00:00.000Z"},
  x=>{x.categories.rare_earth.native_release_records[0].what_changed="Read https://private.invalid for proof"},
 ];
 for(const mutate of mutators){
  const x=structured();mutate(x);
  assert.throws(()=>verifyStructuredDeliveryEnvelope(x,NOW));
 }
});
test("repeated identical full release analysis in every domain is detected",()=>{
 const x=structured();
 for(const c of ["macro","rare_earth"]){
  x.categories[c].native_release_records[0].what_changed=x.categories.geopolitics.native_release_records[0].what_changed;
  x.categories[c].native_release_records[0].why_it_matters=x.categories.geopolitics.native_release_records[0].why_it_matters;
 }
 assert.throws(()=>verifyStructuredDeliveryEnvelope(x,NOW),/SAME_NATIVE_NEWS_ANALYSIS_ALL_THREE_CATEGORIES/);
});
test("real-API audit uses 4 GETs + negative query and POST, no signed headers/funds",async()=>{
 const f=fakeFetch();
 const receipt=await auditThreeDomainLive({fetchImpl:f.fetchImpl,now:NOW});
 assert.equal(receipt.status,"PASS_WITH_SOURCE_COVERAGE_REPORTED_SEPARATELY");
 assert.equal(receipt.total_upstream_requests,6);
 assert.deepEqual(f.urls,[STRUCTURED_API,STRUCTURED_API,CONTINUITY_API,FACTUAL_API,
  STRUCTURED_API+"?country=USA",STRUCTURED_API]);
 assert.deepEqual(f.methods,["GET","GET","GET","GET","GET","POST"]);
 assert.equal(f.options[1].headers["Cache-Control"],"no-cache");
 assert.equal(f.options[2].headers["Cache-Control"],"no-cache");
 assert.equal(f.options.some(x=>x.headers?.Authorization||x.headers?.["PAYMENT-SIGNATURE"]),false);
 assert.equal(receipt.payment_settlement_attempts,0);
 assert.equal(receipt.paid_delivery_verified,false);
});
test("D1 503, malformed source proof or commercial news cannot become positive acceptance",async()=>{
 const f=fakeFetch();
 const fail=async(url,opts)=>url===STRUCTURED_API?
  Response.json({ok:false,error:"D1_QUOTA"},{status:503}):f.fetchImpl(url,opts);
 await assert.rejects(()=>auditThreeDomainLive({fetchImpl:fail,now:NOW}),/HTTP_503/);
 const badFactual=factual();badFactual.commercial_product_ready=true;
 await assert.rejects(()=>auditThreeDomainLive({
  fetchImpl:fakeFetch(structured(),continuation(),badFactual).fetchImpl,now:NOW
 }));
 const badContinuity=continuation();badContinuity.raw_upstream_delivered=true;
 await assert.rejects(()=>auditThreeDomainLive({
  fetchImpl:fakeFetch(structured(),badContinuity).fetchImpl,now:NOW
 }));
});
test("invalid filters or POST unexpectedly succeeding fails the live security audit",async()=>{
 const f=fakeFetch();
 const bypass=async(url,opts)=>url.includes("?country=")?
  Response.json(structured()):f.fetchImpl(url,opts);
 await assert.rejects(()=>auditThreeDomainLive({fetchImpl:bypass,now:NOW}),
  /UNSCOPED_FILTER_MUST_NOT_SUCCEED/);
});


test("diagnoses a production cached 503 separately from healthy canonical no-cache projection",async()=>{
 const f=fakeFetch();
 let requests=0;
 const firstCached503=async(url,opts)=>{
  requests++;
  if(url===STRUCTURED_API&&!opts.headers?.["Cache-Control"]&&opts.method==="GET")
   return Response.json({ok:false,error:"CANONICAL_THREE_DOMAIN_READBACK_UNAVAILABLE"},{status:503});
  return f.fetchImpl(url,opts);
 };
 await assert.rejects(
  ()=>auditThreeDomainLive({fetchImpl:firstCached503,now:NOW}),
  /STRUCTURED_CACHED_HTTP_503_UNCACHED_HTTP_200_/
 );
 assert.equal(requests,4);
 assert.equal(f.urls.every(url=>[STRUCTURED_API,CONTINUITY_API].includes(url)),true);
});


test("27 real-contract 3-domain matrices preserve empty, reference-only and news-plus-reference independently",()=>{
 let tested=0;
 const states=["NEWS_AND_REFERENCE","REFERENCE_ONLY","EMPTY"];
 for(const a of states)for(const b of states)for(const d of states){
  const selected=[a,b,d];
  const missing=CATS.filter((_,i)=>selected[i]==="EMPTY");
  const noNews=CATS.filter((_,i)=>selected[i]!=="NEWS_AND_REFERENCE");
  const x=verifyStructuredDeliveryEnvelope(structured({missing,noNews}),NOW);
  assert.equal(x.all_categories_with_data,missing.length===0);
  for(let i=0;i<CATS.length;i++){
   const cat=x.categories[CATS[i]];
   assert.equal(cat.native_news,selected[i]==="NEWS_AND_REFERENCE"?1:0);
   assert.equal(cat.official_reference,selected[i]==="EMPTY"?0:1);
   assert.equal(cat.delivery_state,selected[i]==="EMPTY"?
    "NO_OBSERVATION_AVAILABLE":"OBSERVATIONS_WITH_CURRENT_SOURCE_CHECK");
  }
  tested++;
 }
 assert.equal(tested,27);
});
