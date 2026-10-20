import test from "node:test";
import assert from "node:assert/strict";
import {parseGdacsOfficialEqRss,GDACS_EQ_24H_RSS} from "../../global-intelligence/adapters/gdacs-official-eq-rss.mjs";
import {fetchGdacsNativeCountry} from "../../global-intelligence/adapters/gdacs-native-country.mjs";
const now=new Date("2026-10-20T08:00:00Z");
const item=(id,iso="IND",date="Tue, 20 Oct 2026 06:00:00 GMT")=>
 "<item><gdacs:eventtype>EQ</gdacs:eventtype><gdacs:eventid>"+id+"</gdacs:eventid>"+
 "<gdacs:country>India</gdacs:country><gdacs:iso3>"+iso+"</gdacs:iso3>"+
 "<gdacs:fromdate>"+date+"</gdacs:fromdate><geo:lat>19.5</geo:lat>"+
 "<geo:long>70.2</geo:long></item>";
const rss=(body)=>'<?xml version="1.0"?><rss version="2.0" xmlns:gdacs="http://www.gdacs.org">'+
 '<channel><title>GDACS EQ</title>'+body+'</channel></rss>';
test("pinned exact GDACS first-party feed emits native fields only",()=>{
 assert.equal(GDACS_EQ_24H_RSS,"https://data.gdacs.org/xml/rss_eq_24h.xml");
 const r=parseGdacsOfficialEqRss(rss(item(123456)),now);
 assert.equal(r.features.length,1);
 assert.equal(r.features[0].properties.iso3,"IND");
 assert.equal(r.features[0].properties.country,"India");
 assert.equal(r.features[0].properties.fromdate,"2026-10-20T06:00:00.000Z");
 assert.deepEqual(r.features[0].geometry.coordinates,[70.2,19.5]);
});
test("duplicate, future-date and absent ISO3 do not fabricate country/time verification",()=>{
 const r=parseGdacsOfficialEqRss(rss(item(123456,"", "Tue, 20 Oct 2026 10:00:00 GMT")+
   item(123456)+item(123457,"ZZ")+item(123458,"DEU","2026-10-20")),now);
 assert.equal(r.features.length,3);
 assert.equal(r.features[0].properties.iso3,null);
 assert.equal(r.features[0].properties.fromdate,null);
 assert.equal(r.features[1].properties.iso3,null);
 assert.equal(r.features[2].properties.fromdate,null);
});
test("publisher invalid shape / no EQ event rejected, never invented",()=>{
 assert.throws(()=>parseGdacsOfficialEqRss("<html>login</html>",now),/GDACS_RSS_SHAPE_INVALID/);
 assert.throws(()=>parseGdacsOfficialEqRss(rss("<item><gdacs:eventtype>WF</gdacs:eventtype></item>"),now),/GDACS_RSS_NO_EQ_EVENTS/);
 assert.throws(()=>parseGdacsOfficialEqRss(rss(item(1)),new Date("invalid")),/GDACS_CLOCK_INVALID/);
});
test("single same-publisher fallback on oversized GeoJSON, zero bypass on 403",async()=>{
 let calls=0;const urls=[];
 const result=await fetchGdacsNativeCountry({now,fetchImpl:async(url,opt)=>{
    calls++;urls.push({url,opt});
    return calls===1?new Response("{}",{headers:{"content-length":"700000"}}):
       new Response(rss(item(123456)));
 }});
 assert.equal(calls,2);
 assert.equal(urls[1].url,GDACS_EQ_24H_RSS);
 assert.equal(urls[1].opt.redirect,"error");
 assert.equal(result.native_country_identifiers,1);
 assert.equal(result.event_count,1);
 assert.equal(result.same_publisher_24h_rss_used,true);
 assert.equal(result.all_affected_countries_verified,false);
 assert.equal(result.commercial_paid_eligible,false);
 assert.equal(result.verified_current_geopolitical_events,0);
 assert.doesNotMatch(JSON.stringify(result),/123456|India|IND/);
 await assert.rejects(()=>fetchGdacsNativeCountry({now,fetchImpl:async()=>{
    calls++;return new Response("denied",{status:403});
 }}),/GDACS_HTTP_403/);
 assert.equal(calls,3);
});
