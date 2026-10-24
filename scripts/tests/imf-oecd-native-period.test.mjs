import {test} from "node:test";
import assert from "node:assert/strict";
import {wdiIndiaGrowthUrl,extractWdiIndiaGrowth,extractBlsUsUnemployment,fetchWdiIndiaGrowth,fetchBlsUsUnemployment} from "../../global-intelligence/adapters/imf-oecd-free-reference-alternates.mjs";
import {fetchImfDataMapper} from "../../global-intelligence/adapters/imf-sdmx.mjs";
import {extractOecdUsMonthlyUnemployment,fetchOecdExactReference,verifyImfOecdReference} from "../../global-intelligence/adapters/imf-oecd-exact-reference.mjs";
test("IMF exact country-year has no invented publication clock and no fresh news claim",async()=>{
 const calls=[];const rows=await fetchImfDataMapper({
   countryIso3:"IND",indicator:"NGDP_RPCH",periods:["2024","2025"],
   fetchImpl:async(url,opts)=>{
     calls.push({url,opts});
     return Response.json({values:{NGDP_RPCH:{IND:{"2024":6.5,"2025":"6.2","2026":null},USA:{"2025":3}}}});
   }});
 assert.equal(rows.length,2);
 assert.equal(rows[0].country_iso3,"IND");
 assert.equal(rows[0].published_at,null);
 assert.equal(rows[0].raw.native_release_at,null);
 assert.equal(rows[0].raw.reference_period,"2024");
 assert.equal(rows[1].raw.commercial_rights_verified,false);
 assert.equal(calls[0].opts.redirect,"error");
 assert.equal(calls[0].opts.signal.aborted,false);
 assert.match(calls[0].url,/NGDP_RPCH\/IND\?periods=/);
 assert.equal(new URL(calls[0].url).pathname,"/external/datamapper/api/v1/NGDP_RPCH/IND");
 assert.equal(calls[0].opts.headers.Authorization,undefined);
 assert.equal(calls[0].opts.headers.authorization,undefined);
 await assert.rejects(()=>fetchImfDataMapper({indicator:"bad/flow",countryIso3:"IND"}),/IMF_INDICATOR_INVALID/);
 await assert.rejects(()=>fetchImfDataMapper({indicator:"NGDP_RPCH",countryIso3:"IND",periods:["2024","invalid"]}),/IMF_PERIOD_FILTER_INVALID/);
});
test("IMF excludes null, untrusted periods, NaN and other country",async()=>{
 const rows=await fetchImfDataMapper({countryIso3:"IND",indicator:"NGDP_RPCH",
   fetchImpl:async()=>Response.json({values:{NGDP_RPCH:{
     USA:{"2025":20},IND:{"2024":null,"2025":"5.6","2026":"-","foreign":"12"}
   }}})});
 assert.equal(rows.length,1);
 assert.equal(rows[0].raw.reference_period,"2025");
});
test("OECD exact native USA/month key does not invent a release timestamp",()=>{
 const csv="REF_AREA,FREQ,TIME_PERIOD,OBS_VALUE,UNIT_MEASURE\n"+
   "CAN,M,2025-06,5.9,PT\nUSA,M,2025-06,4.4,PT\nUSA,M,2025-05,4.6,PT\n";
 const r=extractOecdUsMonthlyUnemployment(csv);
 assert.equal(r.country_iso3,"USA");
 assert.equal(r.reference_period,"2025-06");
 assert.equal(r.observation_value,4.4);
 assert.equal(r.original_published_at,null);
 assert.equal(r.commercial_rights_verified,false);
 assert.equal(r.paid_eligible,false);
 assert.throws(()=>extractOecdUsMonthlyUnemployment(
   csv+"USA,M,2025-06,10,PT\n"),/OECD_EXACT_SERIES_UNVERIFIED/);
});
test("OECD bounded network rejects 429/oversize, never follows redirects",async()=>{
 let opts;
 const r=await fetchOecdExactReference({fetchImpl:async(u,o)=>{
   opts=o;return new Response(
     "REF_AREA,FREQ,TIME_PERIOD,OBS_VALUE\nUSA,M,2025-06,4.5\n");
 }});
 assert.equal(r.observation_value,4.5);
 assert.equal(opts.redirect,"error");
 assert.equal(opts.headers.accept,"text/csv");
 await assert.rejects(()=>fetchOecdExactReference({fetchImpl:async()=>new Response("denied",{status:429})}),/OECD_HTTP_429/);
 await assert.rejects(()=>fetchOecdExactReference({fetchImpl:async()=>new Response("{}",{
   headers:{"content-length":"1100000"}
 })}),/OECD_BODY_LIMIT/);
});
test("production receipt is independently fail-closed and never returns values",async()=>{
 const imf=async()=>[{source_id:"imf_sdmx",category:"MACRO",country_iso3:"IND",
   published_at:null,raw:{native_release_at:null,commercial_rights_verified:false,reference_period:"2024"}}];
 const oecd=async()=>({source_id:"oecd_sdmx",country_iso3:"USA",
   reference_period:"2025-06",native_release_at_verified:false,
   commercial_rights_verified:false,observation_value:19434988});
 const ok=await verifyImfOecdReference({imf,oecd});
 assert.equal(ok.verified,2);
 assert.equal(ok.signed_current_publications,0);
 assert.equal(ok.payments,0);
 assert.doesNotMatch(JSON.stringify(ok),/19434988/);
 const fail=await verifyImfOecdReference({imf:async()=>{throw Error("private URL?secret=untrusted");},oecd});
 assert.equal(fail.verified,1);
 assert.doesNotMatch(JSON.stringify(fail),/secret=untrusted/);
});

test("OECD exact combined indicator rejects incorrect sex/age/adjustment or duplicate scope",()=>{
 const header="REF_AREA,FREQ,TIME_PERIOD,COMBINED_MEASURE,ADJUSTMENT,SEX,AGE,OBS_VALUE\n";
 const good="USA,M,2025-06,UNE_LF_M,Y,_T,Y_GE15,4.3\n";
 const row=extractOecdUsMonthlyUnemployment(header+good);
 assert.equal(row.observation_value,4.3);
 for(const bad of [
   "USA,M,2025-06,UNE_LF_M,Y,F,Y_GE15,4.3\n",
   "USA,M,2025-06,UNE_LF_M,N,_T,Y_GE15,4.3\n",
   "USA,M,2025-06,UNE_LF_M,Y,_T,Y15T24,4.3\n",
   "USA,M,2025-06,UNE_M,Y,_T,Y_GE15,4.3\n"
 ])assert.throws(()=>extractOecdUsMonthlyUnemployment(header+bad),/OECD_EXACT_SERIES_UNVERIFIED/);
 assert.throws(()=>extractOecdUsMonthlyUnemployment(header+good+good),/OECD_EXACT_SERIES_UNVERIFIED/);
});
test("IMF upstream 403 is a sanitized denial class and cannot trigger a paywall workaround",async()=>{
 const r=await verifyImfOecdReference({
  imf:async()=>{throw Error("HTTP 403 for bounded credentialed request");},
  oecd:async()=>{throw Error("OECD_HTTP_500");}
 });
 assert.equal(r.verified,0);
 assert.equal(r.readers[0].reason,"IMF_HTTP_403");
 assert.equal(r.readers[1].reason,"OECD_HTTP_500");
 assert.equal(r.paid_eligible,false);
 assert.equal(r.payments,0);
});

test("OECD official query is bounded to USA and uses standard CSV negotiation",async()=>{
 let u;
 const row=await fetchOecdExactReference({fetchImpl:async(url,opts)=>{
   u=new URL(url);
   assert.equal(opts.redirect,"error");
   assert.equal(opts.headers.accept,"text/csv");
   return new Response([
     "REF_AREA,FREQ,TIME_PERIOD,OBS_VALUE,COMBINED_MEASURE,ADJUSTMENT,SEX,AGE",
     "USA,M,2025-06,4.5,UNE_LF_M,Y,_T,Y_GE15"
   ].join(String.fromCharCode(10)));
 }});
 assert.equal(row.country_iso3,"USA");
 assert.equal(row.observation_value,4.5);
 assert.equal(u.hostname,"sdmx.oecd.org");
 assert.ok(u.pathname.includes("/USA.UNE_LF_M...Y._T.Y_GE15..M"));
 assert.equal(u.searchParams.get("startPeriod"),"2025-06");
 assert.equal(u.searchParams.get("endPeriod"),"2025-06");
 assert.equal(u.searchParams.get("format"),"csvfile");
});

const fixtureNow=new Date("2026-10-24T12:00:00Z");
const wdiFixture=[
 {page:1,pages:1,total:2},
 [{countryiso3code:"IND",indicator:{id:"NY.GDP.MKTP.KD.ZG"},date:"2024",value:6.2},
  {countryiso3code:"IND",indicator:{id:"NY.GDP.MKTP.KD.ZG"},date:"2025",value:7.1}]
];
const blsFixture={status:"REQUEST_SUCCEEDED",Results:{series:[{
 seriesID:"LNS14000000",data:[
  {year:"2026",period:"M09",periodName:"September",value:"4.2"},
  {year:"2025",period:"M06",periodName:"June",value:"4.1"},
 ]}]}};
test("WDI fallback is pinned IND real GDP growth annual and explicit separate methodology",async()=>{
 assert.equal(new URL(wdiIndiaGrowthUrl(fixtureNow)).searchParams.get("date"),"2024:2025");
 let opts,u;
 const x=await fetchWdiIndiaGrowth({now:fixtureNow,fetchImpl:async(url,o)=>{
  u=url;opts=o;return Response.json(wdiFixture);
 }});
 assert.equal(x.country_iso3,"IND");
 assert.deepEqual(x.reference_periods,["2024","2025"]);
 assert.equal(x.commercial_rights_attested,false);
 assert.equal(x.native_release_time_verified,false);
 assert.equal(x.source_methodology_equivalent_to_imf,false);
 assert.equal(opts.redirect,"error");
 assert.equal(new URL(u).hostname,"api.worldbank.org");
 assert.throws(()=>extractWdiIndiaGrowth([wdiFixture[0],[
  {...wdiFixture[1][0],countryiso3code:"USA"}]],fixtureNow),/ALT_WDI_/);
 assert.throws(()=>extractWdiIndiaGrowth([wdiFixture[0],[
  wdiFixture[1][0],wdiFixture[1][0]]],fixtureNow),/ALT_WDI_DUPLICATE/);
 const later=wdiIndiaGrowthUrl(new Date("2029-05-01T00:00:00Z"));
 assert.equal(new URL(later).searchParams.get("date"),"2027:2028");
});
test("BLS first-party public v1 unemployment preserves own 16+ CPS population and month",async()=>{
 let addr,opts;
 const x=await fetchBlsUsUnemployment({now:fixtureNow,fetchImpl:async(u,o)=>{
  addr=u;opts=o;return Response.json(blsFixture);
 }});
 assert.equal(addr,"https://api.bls.gov/publicAPI/v1/timeseries/data/LNS14000000");
 assert.equal(opts.redirect,"error");
 assert.equal(x.reference_period,"2026-09");
 assert.equal(x.country_iso3,"USA");
 assert.equal(x.age_population,"16_PLUS");
 assert.equal(x.harmonization_equivalent_to_oecd,false);
 assert.equal(x.paid_eligible,false);
 assert.throws(()=>extractBlsUsUnemployment({...blsFixture,
  Results:{series:[{seriesID:"LAUCN040010000000005",data:blsFixture.Results.series[0].data}]}},
  fixtureNow),/ALT_BLS_SHAPE_INVALID/);
 const duplicate={...blsFixture,Results:{series:[{...blsFixture.Results.series[0],
  data:[...blsFixture.Results.series[0].data,blsFixture.Results.series[0].data[0]]}]}};
 assert.throws(()=>extractBlsUsUnemployment(duplicate,fixtureNow),/ALT_BLS_DUPLICATE_PERIOD/);
});
test("official fallback transport refuses 403, private payload and oversized bytes",async()=>{
 await assert.rejects(()=>fetchWdiIndiaGrowth({fetchImpl:async()=>
  new Response("denied",{status:403})}),/ALT_DENIED_OR_QUOTA/);
 await assert.rejects(()=>fetchBlsUsUnemployment({fetchImpl:async()=>
  new Response("{}",{headers:{"content-type":"text/plain"}})}),/ALT_MIME_INVALID/);
 await assert.rejects(()=>fetchBlsUsUnemployment({fetchImpl:async()=>
  new Response("{}",{headers:{"content-type":"application/json","content-length":"270000"}})}),/ALT_BODY_LIMIT/);
});
test("IMF 403 and OECD 500 route to different real official macro references, never paid",async()=>{
 let wdiReads=0,blsReads=0;
 const report=await verifyImfOecdReference({
  imf:async()=>{throw Error("HTTP 403 for bounded credentialed request");},
  oecd:async()=>{throw Error("OECD_HTTP_500");},
  alternates:{
   wdi:async()=>{wdiReads++;return extractWdiIndiaGrowth(wdiFixture,fixtureNow);},
   bls:async()=>{blsReads++;return extractBlsUsUnemployment(blsFixture,fixtureNow);}
  },
 });
 assert.equal(report.verified,0);
 assert.equal(report.alternates_verified,2);
 assert.equal(report.reference_portfolio_available,true);
 assert.equal(report.primary_imf_oecd_exact_sources_both_verified,false);
 assert.deepEqual([wdiReads,blsReads],[1,1]);
 assert.equal(report.paid_eligible,false);
 assert.equal(report.signed_current_publications,0);
 assert.equal(report.payments,0);
 assert.equal(report.official_alternates.every(x=>x.state===
  "INDEPENDENT_REFERENCE_AVAILABLE"&&x.paid_eligible===false),true);
 assert.doesNotMatch(JSON.stringify(report),/7\\.1|4\\.2|private\/url/);
});
test("blocked alternate cannot turn denied IMF into a false source pass",async()=>{
 const report=await verifyImfOecdReference({
  imf:async()=>{throw Error("HTTP 403 for bounded credentialed request");},
  oecd:async()=>({source_id:"oecd_sdmx",country_iso3:"USA",
   reference_period:"2025-06",native_release_at_verified:false,
   commercial_rights_verified:false}),
  alternates:{
   wdi:async()=>{throw Error("secret host private leak");},
   bls:async()=>{throw Error("UNNECESSARY_BLS_GET");}
  },
 });
 assert.equal(report.verified,1);
 assert.equal(report.alternates_verified,0);
 assert.equal(report.reference_portfolio_available,false);
 assert.equal(report.official_alternates.length,1);
 assert.equal(report.official_alternates[0].reason,"ALT_TRANSPORT_OR_SCHEMA_UNKNOWN");
 assert.doesNotMatch(JSON.stringify(report),/secret host|UNNECESSARY_BLS_GET/);
});

test("missing newer World Bank calendar year is not fabricated or treated as a total outage",()=>{
 const fixture=[{page:1,pages:1,total:2},[
  {countryiso3code:"IND",indicator:{id:"NY.GDP.MKTP.KD.ZG"},date:"2024",value:6.3},
  {countryiso3code:"IND",indicator:{id:"NY.GDP.MKTP.KD.ZG"},date:"2025",value:null},
 ]];
 const r=extractWdiIndiaGrowth(fixture,fixtureNow);
 assert.deepEqual(r.reference_periods,["2024"]);
 assert.equal(r.native_release_time_verified,false);
 assert.equal(r.paid_eligible,false);
 fixture[1][0].value=null;
 assert.throws(()=>extractWdiIndiaGrowth(fixture,fixtureNow),/ALT_WDI_OBSERVATION_MISSING/);
});
