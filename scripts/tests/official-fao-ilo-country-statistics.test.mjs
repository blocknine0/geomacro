import {test} from "node:test";
import assert from "node:assert/strict";
import {
  extractExactCountryStatistic,readExactCountryStatistic,
  actualCountryStatisticsReceipt,COUNTRY_STATISTICS_SOURCE_IDS
} from "../../global-intelligence/adapters/official-fao-ilo-country-statistics.mjs";

test("exact FAO row must share code, ISO3, original period and numeric value",()=>{
 const payload="REF_AREA,SDG_SERIES,TIME_PERIOD,OBS_VALUE,UNIT_MEASURE\n"+
   "USA,SN_ITK_DEFC,2023,11.2,PERCENT\n"+
   "GBR,SN_ITK_DEFC,2024,3.1,PERCENT\n"+
   "USA,OTHER,2024,90.2,PERCENT\n";
 const x=extractExactCountryStatistic("faostat",payload);
 assert.equal(x.provider,"FAO");assert.equal(x.indicator,"SN_ITK_DEFC");
 assert.equal(x.country_iso3,"USA");assert.equal(x.reference_period,"2023");
 assert.equal(x.observed_value,11.2);
 assert.equal(x.original_release_at,null);
 assert.equal(x.commercial_rights_verified,false);
 assert.equal(x.raw_customer_distribution,false);
});
test("exact ILO data carries source flags without relabeling indicator or asserting unit",()=>{
 const x=extractExactCountryStatistic("ilostat",{
   data:[{ref_area:"USA",indicator:"EMP_TEMP_SEX_AGE_NB_A",
     time:2024,obs_value:123.4,obs_status:"A"}]
 });
 assert.equal(x.reference_period,"2024");assert.equal(x.source_status_flag,"A");
 assert.equal(x.observed_unit,"provider_defined");
 assert.equal(x.release_timestamp_verified,false);
});
test("foreign/mixed/duplicate/empty output never becomes USA macro release",()=>{
 assert.throws(()=>extractExactCountryStatistic("ilostat",{
   data:[{ref_area:"CHN",indicator:"EMP_TEMP_SEX_AGE_NB_A",time:2024,obs_value:1}]
 }),/COUNTRY_STATS_EXACT_SERIES_NOT_FOUND/);
 assert.throws(()=>extractExactCountryStatistic("faostat",
   "REF_AREA,SDG_SERIES,TIME_PERIOD,OBS_VALUE\nUSA,SN_ITK_DEFC,2023,1\nUSA,SN_ITK_DEFC,2023,2\n"),
   /COUNTRY_STATS_SERIES_SCOPE_AMBIGUOUS/);
 assert.throws(()=>extractExactCountryStatistic("ilostat",{data:[]}),/COUNTRY_STATS_ROWS_LIMIT/);
 assert.throws(()=>extractExactCountryStatistic("unlicensed",{data:[]}),/COUNTRY_STATS_SOURCE_NOT_APPROVED/);
 assert.throws(()=>extractExactCountryStatistic("faostat",
   "REF_AREA,SDG_SERIES,TIME_PERIOD,OBS_VALUE\nUSA,SN_ITK_DEFC,2023,-\n"),
   /COUNTRY_STATS_EXACT_SERIES_NOT_FOUND/);
});
test("bounded provider GET and sanitized receipt never exposes raw numerical data",async()=>{
 const seen=[];
 const x=await readExactCountryStatistic("ilostat",{fetchImpl:async(url,opts)=>{
   seen.push([url,opts]);
   return Response.json({data:[{ref_area:"USA",indicator:"EMP_TEMP_SEX_AGE_NB_A",
     time:2024,obs_value:123.4}]});
 }});
 assert.equal(x.observed_value,123.4);
 assert.equal(new URL(seen[0][0]).hostname,"rplumber.ilo.org");
 assert.equal(seen[0][1].redirect,"error");
 assert.equal(seen[0][1].method,"GET");
 const report=await actualCountryStatisticsReceipt({read:async id=>({
   source_id:id,commercial_rights_verified:false,
   release_timestamp_verified:false,country_iso3:"USA",
   indicator:id==="faostat"?"SN_ITK_DEFC":"EMP_TEMP_SEX_AGE_NB_A",
   reference_period:"2024",observed_unit:"provider_defined",observed_value:87654321
 })});
 assert.equal(report.extracted,2);
 assert.equal(report.paid_eligible,false);
 assert.equal(report.signed_current_intelligence,false);
 assert.doesNotMatch(JSON.stringify(report),/87654321/);
});
test("403/429 and oversized upstream responses rejected without raw body",async()=>{
 await assert.rejects(()=>readExactCountryStatistic("ilostat",{
   fetchImpl:async()=>new Response("private",{status:429})
 }),/COUNTRY_STATS_HTTP_429/);
 await assert.rejects(()=>readExactCountryStatistic("faostat",{
   fetchImpl:async()=>new Response("x",{headers:{"content-length":"2100000"}})
 }),/COUNTRY_STATS_BODY_LIMIT/);
});

test("unmatched provider shape reveals only bounded column names, never values",async()=>{
 const report=await actualCountryStatisticsReceipt({
   read:async id=>extractExactCountryStatistic(id,[{
     COUNTRY:"USA",MEASURE:"wrong-private-code",TIME:"2024",OBS_VALUE:31415926,
     SECRET_TEST_FIELD:"secret-example-value",absurdFieldWithSlash:"secret-again"
   }])
 });
 assert.equal(report.extracted,0);
 for(const row of report.results){
   assert.equal(row.reason,"COUNTRY_STATS_EXACT_SERIES_NOT_FOUND");
   assert.equal(row.shape.total_rows,1);
   assert.ok(row.shape.column_names.includes("COUNTRY"));
   assert.equal(row.shape.country_matches,0);
 }
 assert.doesNotMatch(JSON.stringify(report),/31415926|secret-example-value|secret-again/);
});

test("FAO area numeric key maps only through source-published ISO3 identity",()=>{
 const p="REF_AREA,REF_AREA_ISO3,SERIES,TIME_PERIOD,OBS_VALUE,UNIT_MEASURE\n"+
  "840,USA,SN_ITK_DEFC,2024,3.3,PERCENT\n"+
  "156,CHN,SN_ITK_DEFC,2024,2.8,PERCENT\n";
 const x=extractExactCountryStatistic("faostat",p);
 assert.equal(x.country_iso3,"USA");
 assert.equal(x.reference_period,"2024");
 assert.equal(x.observed_value,3.3);
 assert.equal(x.commercial_rights_verified,false);
});
test("ILOSTAT official categorical dimension census reveals no observation values",async()=>{
 const p=[{ref_area:"USA",indicator:"SOME_OTHER_NATIVE_CODE",
   sex:"SEX_T",classif1:"AGE_TOTAL",time:2024,obs_value:9988123}];
 const r=await actualCountryStatisticsReceipt({read:async id=>
  extractExactCountryStatistic(id==="faostat"?"ilostat":id,p)});
 assert.equal(r.extracted,0);
 assert.equal(r.results[1].shape.indicator_codes[0],"SOME_OTHER_NATIVE_CODE");
 assert.equal(r.results[1].shape.sex_codes[0],"SEX_T");
 assert.equal(r.results[1].shape.classif1_codes[0],"AGE_TOTAL");
 assert.doesNotMatch(JSON.stringify(r),/9988123/);
});
