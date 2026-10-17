import {test} from "node:test";
import assert from "node:assert/strict";
import {inspectGdacsCountryNative,fetchGdacsNativeCountry} from "../../global-intelligence/adapters/gdacs-native-country.mjs";
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
