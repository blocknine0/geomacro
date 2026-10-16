import {test} from "node:test";
import assert from "node:assert/strict";
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
test("OECD official query pins one USA unemployment population and no raw broad download",async()=>{
 let u;
 const result=await fetchOecdExactReference({fetchImpl:async(url,opts)=>{
  u=new URL(url);
  assert.equal(opts.redirect,"error");
  return new Response([
   "REF_AREA,FREQ,TIME_PERIOD,OBS_VALUE,COMBINED_MEASURE,ADJUSTMENT,SEX,AGE",
   "USA,M,2025-06,4.5,UNE_LF_M,Y,_T,Y_GE15"
  ].join(String.fromCharCode(10)));
 });
 assert.equal(r.verified,0);
 assert.equal(r.readers[0].reason,"IMF_HTTP_403");
 assert.equal(r.readers[1].reason,"OECD_HTTP_500");
 assert.equal(r.paid_eligible,false);
 assert.equal(r.payments,0);
});
