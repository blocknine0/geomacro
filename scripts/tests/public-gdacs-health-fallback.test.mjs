import test from "node:test";
import assert from "node:assert/strict";
import {probeGdacsPublic} from "../../global-intelligence/adapters/public-sources.mjs";
import {gdacsCountryEventListUrl} from "../../global-intelligence/adapters/gdacs-native-country.mjs";
import {GDACS_EQ_24H_RSS} from "../../global-intelligence/adapters/gdacs-official-eq-rss.mjs";
const now=new Date("2026-10-24T09:00:00Z");
const native={features:[{
 type:"Feature",geometry:{type:"Point",coordinates:[70.2,19.5]},
 properties:{eventid:123456,iso3:"IND",country:"India",fromdate:"2026-10-24T06:00:00Z"}
}]};
const rss='<rss version="2.0" xmlns:gdacs="http://www.gdacs.org"><channel>'+
'<item><gdacs:eventtype>EQ</gdacs:eventtype><gdacs:eventid>123456</gdacs:eventid>'+
'<gdacs:country>India</gdacs:country><gdacs:iso3>IND</gdacs:iso3>'+
'<gdacs:fromdate>Sat, 24 Oct 2026 06:00:00 GMT</gdacs:fromdate>'+
'<geo:lat>19.5</geo:lat><geo:long>70.2</geo:long></item></channel></rss>';

test("public health uses existing GDACS rolling seven-day, 3-item first-party page",async()=>{
 const urls=[];
 const receipt=await probeGdacsPublic({now,fetchImpl:async(url,options)=>{
  urls.push(url);
  assert.equal(options.redirect,"error");
  assert.equal(options.method,"GET");
  return Response.json(native);
 }});
 assert.deepEqual(urls,[gdacsCountryEventListUrl(now)]);
 assert.equal(receipt.observations,1);
 assert.equal(receipt.discovery_only,true);
 assert.equal(receipt.original_publication_verified,false);
 assert.equal(receipt.commercial_rights_verified,false);
 assert.equal(receipt.same_publisher_rss_fallback,false);
 assert.doesNotMatch(JSON.stringify(receipt),/123456|India|IND/);
});

test("transient GDACS timeout falls back to fixed same-issuer RSS exactly once",async()=>{
 const urls=[];
 const r=await probeGdacsPublic({now,fetchImpl:async(url)=>{
  urls.push(url);
  if(urls.length===1)throw new DOMException("PRIVATE_SOURCE_REQUEST","TimeoutError");
  return new Response(rss,{status:200,headers:{"content-type":"application/xml"}});
 }});
 assert.deepEqual(urls,[gdacsCountryEventListUrl(now),GDACS_EQ_24H_RSS]);
 assert.equal(r.source_id,"gdacs_global_disasters");
 assert.equal(r.observations,1);
 assert.equal(r.same_publisher_rss_fallback,true);
 assert.equal(r.verified_geopolitical_events,0);
 assert.equal(r.commercial_rights_verified,false);
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE_SOURCE_REQUEST|123456|India|IND/);
});

test("GDACS server 503 tries its same-issuer RSS, but 403 and 429 never bypass",async()=>{
 let urls=[];
 let receipt=await probeGdacsPublic({now,fetchImpl:async(url)=>{
  urls.push(url);
  return urls.length===1?new Response("unavailable",{status:503}):
   new Response(rss,{status:200});
 }});
 assert.equal(receipt.observations,1);
 assert.deepEqual(urls,[gdacsCountryEventListUrl(now),GDACS_EQ_24H_RSS]);
 for(const status of [401,403,429]){
  urls=[];
  await assert.rejects(probeGdacsPublic({now,fetchImpl:async(url)=>{
   urls.push(url);
   return new Response("denied",{status});
  }}),new RegExp("GDACS_HTTP_"+status));
  assert.deepEqual(urls,[gdacsCountryEventListUrl(now)]);
 }
});
test("upstream bogus native shape never causes RSS fallback or qualified event",async()=>{
 let count=0;
 await assert.rejects(probeGdacsPublic({now,fetchImpl:async()=>{
  count++;return Response.json({events:[{properties:{eventid:"BAD"}}]});
 }}),/GDACS_FEATURE_COLLECTION_INVALID|GDACS_HEALTH_CONTRACT_INVALID/);
 assert.equal(count,1);
});
test("no first-party EQ releases keeps zero, never invents fresh politics",async()=>{
 const r=await probeGdacsPublic({now,fetchImpl:async()=>Response.json({features:[]})});
 assert.equal(r.observations,0);
 assert.equal(r.discovery_only,true);
 assert.equal(r.verified_geopolitical_events,0);
 assert.equal(r.commercial_rights_verified,false);
});
