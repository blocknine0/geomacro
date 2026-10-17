import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizeBgsWorldMineralsFeature,fetchBgsWorldMinerals} from "../../global-intelligence/adapters/bgs-world-minerals.mjs";

const feature=(overrides={})=>({type:"Feature",id:"f1",
  properties:{year:2022,country:"Guyana",commodity:"Gold",
    "statistic type":"Production",quantity:100,unit:"tonnes",...overrides}});
const response=(body,status=200)=>new Response(JSON.stringify(body),
  {status,headers:{"content-type":"application/json"}});
test("historical BGS rows preserve unit and unknown country instead of inventing ISO3",()=>{
  const x=normalizeBgsWorldMineralsFeature(feature());
  assert.equal(x.evidence_type,"PRODUCTION");
  assert.equal(x.value,100);assert.equal(x.year,2022);
  assert.equal(x.country_iso3,null);
  assert.equal(x.native_publication_at,null);
  assert.equal(x.historical_reference_only,true);
  assert.equal(normalizeBgsWorldMineralsFeature(feature({country_iso3_code:"GUY"})).country_iso3,"GUY");
});
test("bounded official response remains research context with no commercial activation",async()=>{
  let requested;
  const x=await fetchBgsWorldMinerals({limit:1,fetchImpl:async(u,opts)=>{
    requested={url:u.toString(),opts};
    return response({type:"FeatureCollection",features:[feature()]});
  }});
  assert.match(requested.url,/ogcapi\.bgs\.ac\.uk/);
  assert.equal(requested.opts.redirect,"error");
  assert.equal(x.count,1);assert.equal(x.rows[0].evidence_type,"PRODUCTION");
  assert.equal(x.commercial_terms_review_required,true);
  assert.equal(x.native_current_publication_proven,false);
  assert.equal(x.country_iso3_certified,false);
});
test("missing-year rows never satisfy a requested historical year",async()=>{
  const x=await fetchBgsWorldMinerals({yearFrom:2020,fetchImpl:async()=>response({
    type:"FeatureCollection",features:[feature({year:null}),feature({year:2021})]
  })});
  assert.equal(x.count,1);assert.equal(x.rows[0].year,2021);
});
test("unsafe host, oversized data, provider denial, and bad shape fail closed",async()=>{
  await assert.rejects(()=>fetchBgsWorldMinerals({baseUrl:"https://untrusted.example",fetchImpl:async()=>{throw Error("network");}}),/BGS_SOURCE_SCOPE_UNVERIFIED/);
  await assert.rejects(()=>fetchBgsWorldMinerals({fetchImpl:async()=>response({features:[]})}),/BGS_FEATURE_COLLECTION_UNVERIFIED/);
  await assert.rejects(()=>fetchBgsWorldMinerals({fetchImpl:async()=>response({},429)}),/BGS_HTTP_429/);
  await assert.rejects(()=>fetchBgsWorldMinerals({fetchImpl:async()=>new Response("{}",{
    headers:{"content-length":"1048577"}
  })}),/BGS_BODY_UNVERIFIED/);
});

test("official BGS native OGC feature uses year timestamp, country and commodity nomenclature",()=>{
 const item={type:"Feature",id:"1-106-596-18-2024",
   properties:{
     year:"2024-01-01 00:00:00",
     country_trans:"Guatemala",country_iso3_code:"GTM",
     bgs_commodity_trans:"bentonite and fuller's earth",
     bgs_sub_commodity_trans:"Bentonite",
     bgs_statistic_type_trans:"Production",
     quantity:2024,units:"tonnes (metric)",
     sdmx_translation:"Normal value",
     data_precision_description:"None"}};
 const r=normalizeBgsWorldMineralsFeature(item);
 assert.equal(r.year,2024);
 assert.equal(r.country,"Guatemala");
 assert.equal(r.country_iso3,"GTM");
 assert.equal(r.commodity,"bentonite and fuller's earth");
 assert.equal(r.sub_commodity,"Bentonite");
 assert.equal(r.evidence_type,"PRODUCTION");
 assert.equal(r.value,2024);
 assert.equal(r.native_sdmx_translation,"Normal value");
 assert.equal(r.native_publication_at,null);
 assert.equal(r.historical_reference_only,true);
 const invalid=normalizeBgsWorldMineralsFeature({
   properties:{year:"2024-05-31",country_iso3_code:"GTM"}});
 assert.equal(invalid.year,null);
});
test("official BGS request sorts latest native reporting years but never calls them releases",async()=>{
 let url;
 const r=await fetchBgsWorldMinerals({limit:1,fetchImpl:async target=>{
   url=new URL(target);
   return new Response(JSON.stringify({type:"FeatureCollection",features:[
     {type:"Feature",id:"m1",properties:{
       year:"2024-01-01 00:00:00",country_trans:"Guatemala",
       country_iso3_code:"GTM",bgs_commodity_trans:"Bentonite",
       bgs_statistic_type_trans:"Production",quantity:210,units:"tonnes"
     }}
   ]}));
 }});
 assert.equal(url.searchParams.get("sortby"),"-year");
 assert.equal(r.rows[0].year,2024);
 assert.equal(r.rows[0].country_iso3,"GTM");
 assert.equal(r.native_current_publication_proven,false);
 assert.equal(r.commercial_terms_review_required,true);
});
