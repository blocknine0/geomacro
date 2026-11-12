import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,createHash,verify as verifyEd25519} from "node:crypto";
import {
 OPEN_FACTS_TIER,OPEN_DERIVED_REDISTRIBUTION_LICENSE_ID,
 OPEN_PUBLIC_FEED_MAPPINGS,openFactsRightsAssessment,
 eventFactsFingerprint,inspectOpenFact,corroborateOpenFactPairs,
 openDerivedTierMatrix,signOpenDerivedAdvisory
} from "../../workers/control-plane/src/risk-stream-open-derived.mjs";
import {planSingleSourceOpenProbe,runSingleSourceOpenProbe}
 from "../../workers/control-plane/src/risk-stream-open-search.mjs";
const NOW=Date.parse("2026-11-12T01:00:00.000Z"),iso=x=>new Date(x).toISOString();
const sha=x=>createHash("sha256").update(x).digest("hex");
const domains={
 GEOPOLITICS:[["whitehouse.gov","GOVERNMENT_WIRE","us_federal_whitehouse"],
  ["cbc.ca","INDEPENDENT_REGIONAL","cbc_media"]],
 MACRO_FX:[["bls.gov","OFFICIAL_STATISTICS","us_bls"],
  ["federalreserve.gov","MARKET_PRICE","us_federal_reserve"]],
 CRITICAL_MINERALS:[["census.gov","TRADE_CUSTOMS","us_census"],
  ["mining.com","INDEPENDENT_INDUSTRY","mining_dot_com"]]
};
const categories=["GEOPOLITICS","GEOPOLITICS","GEOPOLITICS","GEOPOLITICS",
 "MACRO_FX","MACRO_FX","MACRO_FX",
 "CRITICAL_MINERALS","CRITICAL_MINERALS","CRITICAL_MINERALS"];
function rights(domain){
 const us=["whitehouse.gov","bls.gov","federalreserve.gov","census.gov"].includes(domain);
 return us?{basis:"US_FEDERAL_PUBLIC_DOMAIN",original_issuer_confirmed:true,
   third_party_material_excluded:true,terms_url:"https://"+domain+"/terms",
   checked_at:iso(NOW-3600000)}:
  {basis:"REVIEWED_OPEN_LICENSE",original_issuer_confirmed:true,
   third_party_material_excluded:true,license_allows_fact_extraction:true,
   reviewer_receipt_sha256:"a".repeat(64),
   terms_url:"https://"+domain+"/terms",checked_at:iso(NOW-3600000)};
}
async function evidence(category,n,publisher){
 const [domain,source_role,parent]=domains[category][publisher];
 const facts={event_type:category==="GEOPOLITICS"?"SANCTIONS":
   category==="MACRO_FX"?"INFLATION":"EXPORT_RESTRICTION",
   entity:"USA",location:"USA",quantitative_impact:{metric:"OBSERVED_LEVEL",value:n+1,unit:"POINTS"},
   event_at:iso(NOW-2*3600000)};
 const item={
  schema:"geomacro.open-derived-osint-observation.v1",
  country_iso3:"USA",category,
  source_role,feed_origin:publisher===0?"OFFICIAL_API":"RSS",
  event_key:"EVENT_"+String(n).padStart(4,"0"),
  entities:["COUNTRY:USA","EVENT:"+String(n).padStart(4,"0")],
  facts,source_id:"offline_test_"+category.toLowerCase()+"_"+publisher,
  source_url:"https://"+domain+"/offline-test-fixture/"+n,
  publisher_root_domain:domain,parent_media_entity:parent,
  published_at:iso(NOW-(publisher?60:90)*60000),
  access:{original_publisher_endpoint:true,native_publisher_page_verified:true,
   metadata_only_extraction:true,raw_publisher_text_stored:false},
  rights:rights(domain)
 };
 item.event_fingerprint=await eventFactsFingerprint(item);
 return item;
}
async function twenty(){
 const all=[];
 for(let i=0;i<categories.length;i++){
  all.push(await evidence(categories[i],i,0),await evidence(categories[i],i,1));
 }
 return all;
}
test("10 offline open-derived pairs across 4/3/3 categories, without granting commercial release",async()=>{
 const rows=await twenty(),r=await corroborateOpenFactPairs(rows,{now:NOW});
 assert.equal(rows.length,20);
 assert.equal(r.independent_original_pairs,10);
 assert.equal(r.held.length,0);
 assert.equal(r.commercial_release_authorized,false);
 assert.deepEqual(r.eligible_pairs.reduce((out,p)=>(out[p.category]=(out[p.category]||0)+1,out),{}),
  {GEOPOLITICS:4,MACRO_FX:3,CRITICAL_MINERALS:3});
 assert(r.eligible_pairs.every(p=>p.rights_tier===OPEN_FACTS_TIER&&p.original_text_stored===false&&
  p.commercial_eligible===false));
});
test("targeted search on single-source RSS offers discovery leads, never original attestations",async()=>{
 const seed={category:"GEOPOLITICS",target_name:"United States",
  publisher_root_domain:"whitehouse.gov",
  headline:"United States announces significant export tariffs on minerals"};
 const plan=planSingleSourceOpenProbe(seed,{now:NOW});
 assert(plan.url.includes("when%3A2d"));
 assert(plan.url.includes("-site%3Awhitehouse.gov"));
 const rss='<rss><channel><item><title>Minerals export tariffs imposed</title>'+
  '<link>https://news.google.com/rss/articles/test</link>'+
  '<pubDate>Wed, 11 Nov 2026 22:30:00 GMT</pubDate>'+
  '<source url="https://cbc.ca">CBC News</source></item></channel></rss>';
 const r=await runSingleSourceOpenProbe(seed,{now:NOW,
  fetcher:async(_url,request)=>{
   assert.equal(Object.hasOwn(request,"cache"),false);
   return new Response(rss,{status:200,headers:{"content-type":"application/xml"}});
  }});
 assert.equal(r.status,"DISCOVERY_LEADS_FOUND");
 assert.equal(r.original_publications_verified,0);
 assert.equal(r.paid_delivery_authorized,false);
 assert.equal(r.leads[0].source_class,"SEARCH_INDEX_LEAD_ONLY");
});
test("indexed GDELT and Google results cannot attest open publisher originals",async()=>{
 const e=await evidence("GEOPOLITICS",0,0);
 e.feed_origin="GDELT_INDEX";
 await assert.rejects(inspectOpenFact(e,{now:NOW}),/SEARCH_INDEX_IS_NOT_ORIGINAL/);
 e.feed_origin="OFFICIAL_API";
 e.access.original_publisher_endpoint=false;
 await assert.rejects(inspectOpenFact(e,{now:NOW}),/SEARCH_INDEX_IS_NOT_ORIGINAL/);
});
test("independent parent entity, role and 48h window are mandatory",async()=>{
 const a=await evidence("GEOPOLITICS",0,0),b=await evidence("GEOPOLITICS",0,1);
 let r=await corroborateOpenFactPairs([a,{...b,parent_media_entity:a.parent_media_entity}],{now:NOW});
 assert.equal(r.independent_original_pairs,0);
 r=await corroborateOpenFactPairs([a,{...b,source_role:"GOVERNMENT_WIRE"}],{now:NOW});
 assert.equal(r.independent_original_pairs,0);
 b.published_at=iso(NOW-50*3600000);
 r=await corroborateOpenFactPairs([a,b],{now:NOW});
 assert.equal(r.independent_original_pairs,0);
});
test("FRED series and Yahoo Finance are NOT automatically licensed market feeds",()=>{
 assert.equal(OPEN_PUBLIC_FEED_MAPPINGS["api.stlouisfed.org"].license,
  "SERIES_OWNER_AND_API_TERMS_REVIEW_REQUIRED");
 assert.equal(OPEN_PUBLIC_FEED_MAPPINGS["finance.yahoo.com"].license,
  "NO_AUTOMATIC_COMMERCIAL_OR_SCRAPE_APPROVAL");
 const sample={source_role:"MARKET_PRICE",source_url:"https://api.stlouisfed.org/fred/series/observations",
  access:{native_publisher_page_verified:true,metadata_only_extraction:true,
   raw_publisher_text_stored:false},rights:rights("bls.gov")};
 assert.equal(openFactsRightsAssessment(sample,{now:NOW}).commercial_eligible,false);
 assert.match(openFactsRightsAssessment(sample,{now:NOW}).status,/HOLD_/);
});
test("missing independent verified licence, stale source, invalid ISO3 are held",async()=>{
 const e=await evidence("GEOPOLITICS",0,1);
 e.rights.authorization_reference="unverified";
 e.rights.reviewer_receipt_sha256="";
 const d=await inspectOpenFact(e,{now:NOW});
 assert.equal(d.verified,false);
 assert.equal(d.rights.status,"HOLD_RIGHTS_BASIS_UNVERIFIED");
 const b=await evidence("GEOPOLITICS",0,0);
 b.country_iso3="ZZZ";
 await assert.rejects(inspectOpenFact(b,{now:NOW}),/OBSERVATION_SCHEMA_INVALID/);
});
test("advisory signature proves only issuer integrity, and 7-day Complex stays held without real receipts",async()=>{
 const rows=await twenty(),pairs=(await corroborateOpenFactPairs(rows,{now:NOW})).eligible_pairs;
 const key=generateKeyPairSync("ed25519");
 const signed=await signOpenDerivedAdvisory(pairs[0],{
  privatePkcs8B64:key.privateKey.export({format:"der",type:"pkcs8"}).toString("base64"),
  publicSpkiB64:key.publicKey.export({format:"der",type:"spki"}).toString("base64"),now:NOW});
 assert.equal(signed.payload_sha256,sha(JSON.stringify(signed.payload)));
 assert.equal(signed.payload.redistribution_license.id,OPEN_DERIVED_REDISTRIBUTION_LICENSE_ID);
 assert.equal(signed.payload.redistribution_license.commercial_redistribution_authorized,false);
 assert.equal(signed.payload.redistribution_license.third_party_publisher_rights_granted,false);
 assert.deepEqual(signed.payload.source_provenance.publisher_domains,pairs[0].source_domains);
 const signedBytes=payload=>Buffer.from(
  "geomacro.open-derived-osint.advisory.v1\n"+JSON.stringify(payload),"utf8");
 const sig=Buffer.from(signed.signature_b64,"base64");
 assert.equal(verifyEd25519(null,signedBytes(signed.payload),key.publicKey,sig),true);
 const tampered=structuredClone(signed.payload);
 tampered.redistribution_license.commercial_redistribution_authorized=true;
 assert.equal(verifyEd25519(null,signedBytes(tampered),key.publicKey,sig),false);
 assert.equal(signed.payload.customer_delivery_authorized,false);
 assert.equal(signed.payload.certified_risk_index,false);
 assert.equal(signed.signed_gro_originals_proof,false);
 const base=openDerivedTierMatrix({observations:20,pairs,now:NOW});
 assert.equal(base.basic.status,"READY_RESEARCH");
 assert.equal(base.standard.status,"CORROBORATED_OPEN_DERIVED_RESEARCH");
 assert.equal(base.complex.status,"HOLD_SIGNED_SEVEN_DAY_HISTORY");
 const history=Array.from({length:7},(_,i)=>({day_utc:iso(NOW-i*86400000).slice(0,10),
  payload_sha256:sha("offline-test-"+i),ed25519_verified:true,
  private_r2_readback_verified:true,advisory_only:true}));
 assert.equal(openDerivedTierMatrix({observations:20,pairs,history,now:NOW}).complex.status,
  "SEVEN_DAY_SIGNED_ADVISORY_HISTORY");
 history[0].private_r2_readback_verified=false;
 assert.equal(openDerivedTierMatrix({observations:20,pairs,history,now:NOW}).complex.status,
  "HOLD_SIGNED_SEVEN_DAY_HISTORY");
});
