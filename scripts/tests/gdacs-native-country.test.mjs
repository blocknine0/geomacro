import {test} from "node:test";
import assert from "node:assert/strict";
import {inspectGdacsCountryNative,fetchGdacsNativeCountry,gdacsCountryEventListUrl} from "../../global-intelligence/adapters/gdacs-native-country.mjs";
const good={features:[{type:"Feature",geometry:{type:"Point",coordinates:[70.2,19.5]},
  properties:{eventid:123456,iso3:"IND",country:"India",fromdate:"2026-09-21T06:24:00Z"}}]};
test("GDACS native country and event time never certify whole affected-country set",()=>{
 const r=inspectGdacsCountryNative(good);
 assert.equal(r.event_count,1);
 assert.equal(r.native_country_identifiers,1);
 assert.equal(r.native_event_time_count,1);
 assert.equal(r.point_geometry_valid_count,1);
 assert.equal(r.all_affected_countries_verified,false);
 assert.equal(r.native_release_clock_verified,false);
 assert.equal(r.commercial_paid_eligible,false);
 assert.doesNotMatch(JSON.stringify(r),/123456|2026-09-21|IND/);
});
test("no guessed country from disaster coordinates or arbitrary country string",()=>{
 const r=inspectGdacsCountryNative({features:[{type:"Feature",
  geometry:{type:"Point",coordinates:[70.2,19.5]},
  properties:{eventid:123,country:"India",fromdate:"not-a-date"}}]});
 assert.equal(r.native_country_identifiers,0);
 assert.equal(r.point_geometry_valid_count,1);
 assert.equal(r.native_event_time_count,0);
 assert.equal(r.verified_current_geopolitical_events,0);
});
test("duplicate/invalid country and altered source shape fail closed",()=>{
 const result=inspectGdacsCountryNative({features:[good.features[0],good.features[0],
 {type:"Feature",geometry:{type:"Point",coordinates:[200,90]},
  properties:{eventid:124,iso3:"XX",country:"Unknown"}}]});
 assert.equal(result.event_count,2);
 assert.equal(result.native_country_identifiers,1);
 assert.equal(result.point_geometry_valid_count,1);
 assert.throws(()=>inspectGdacsCountryNative({results:[]}),/GDACS_FEATURE_COLLECTION_INVALID/);
});
test("bounded official read, independent 429/oversize and parser failures",async()=>{
 let u,o;
 const r=await fetchGdacsNativeCountry({fetchImpl:async(url,opts)=>{
   u=url;o=opts;return Response.json(good);
 }});
 assert.match(u,/^https:\/\/www\.gdacs\.org\/gdacsapi\/api\/events\/geteventlist/);
 assert.equal(o.redirect,"error");
 assert.equal(r.native_country_identifiers,1);
 await assert.rejects(()=>fetchGdacsNativeCountry({fetchImpl:async()=>new Response("429",{status:429})}),/GDACS_HTTP_429/);
 await assert.rejects(()=>fetchGdacsNativeCountry({fetchImpl:async()=>new Response("{}",{
   headers:{"content-length":"600000"}
 })}),/GDACS_BODY_LIMIT/);
});

test("rolling dates are bounded, non-future, and advanced by the caller clock",()=>{
  const first=new URL(gdacsCountryEventListUrl(new Date("2026-10-20T10:00:00Z")));
  assert.equal(first.hostname,"www.gdacs.org");
  assert.equal(first.pathname,"/gdacsapi/api/events/geteventlist/SEARCH");
  assert.equal(first.searchParams.get("eventlist"),"EQ");
  assert.equal(first.searchParams.get("pageSize"),"25");
  assert.equal(first.searchParams.get("pageNumber"),"1");
  assert.equal(first.searchParams.get("fromdate"),"2026-10-13");
  assert.equal(first.searchParams.get("todate"),"2026-10-20");
  const next=new URL(gdacsCountryEventListUrl(new Date("2026-11-02T00:01:00Z")));
  assert.equal(next.searchParams.get("fromdate"),"2026-10-26");
  assert.equal(next.searchParams.get("todate"),"2026-11-02");
  assert.throws(()=>gdacsCountryEventListUrl(new Date("invalid")),/GDACS_CLOCK_INVALID/);
  assert.throws(()=>gdacsCountryEventListUrl("2026-10-20"),/GDACS_CLOCK_INVALID/);
});
test("network fetch uses the same rolling native-date query; invalid clock makes zero requests",async()=>{
  let count=0,requestUrl;
  await fetchGdacsNativeCountry({
    now:new Date("2026-10-20T23:59:00Z"),
    fetchImpl:async(url)=>{count++;requestUrl=new URL(url);return Response.json(good);}
  });
  assert.equal(count,1);
  assert.equal(requestUrl.searchParams.get("fromdate"),"2026-10-13");
  assert.equal(requestUrl.searchParams.get("todate"),"2026-10-20");
  assert.equal(requestUrl.searchParams.get("pageSize"),"25");
  assert.equal(requestUrl.searchParams.get("pageNumber"),"1");
  await assert.rejects(()=>fetchGdacsNativeCountry({
    now:new Date("invalid"),fetchImpl:async()=>{count++;return Response.json(good);}
  }),/GDACS_CLOCK_INVALID/);
  assert.equal(count,1);
});
