import { probeSource } from "./source-health.mjs";

const checks = [
  {sourceId:"world_bank_indicators",category:"MACRO",country_iso3:"IND",url:"https://api.worldbank.org/v2/country/IND/indicator/NY.GDP.MKTP.CD?format=json&mrv=1",validate:b=>{const x=JSON.parse(b);return Array.isArray(x)&&Array.isArray(x[1])&&x[1].length>0;}},
  {sourceId:"gdelt_v2",category:"GEOPOLITICS",country_iso3:"IND",url:"https://api.gdeltproject.org/api/v2/doc/doc?query=country:IN&mode=ArtList&format=json&maxrecords=1",validate:b=>Array.isArray(JSON.parse(b).articles)},
  {sourceId:"imf_sdmx",category:"MACRO",country_iso3:"IND",url:"https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/IND",validate:b=>Boolean(JSON.parse(b)?.values)},
  {sourceId:"eurostat",category:"MACRO",country_iso3:"DEU",url:"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo_pjan?geo=DE&sex=T&age=TOTAL",validate:b=>Boolean(JSON.parse(b)?.value)},
  {sourceId:"us_bls_public",category:"MACRO",country_iso3:"USA",url:"https://api.bls.gov/publicAPI/v2/timeseries/data/LNS14000000?startyear=2024&endyear=2025",validate:b=>{const x=JSON.parse(b);return x.status==="REQUEST_SUCCEEDED"&&x.Results?.series?.length>0;}},
  {sourceId:"un_comtrade",category:"MACRO",country_iso3:"IND",url:"https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=699&period=2024&cmdCode=TOTAL&flowCode=M&partnerCode=0&partner2Code=0&motCode=0&customsCode=C00&breakdownMode=classic&includeDesc=true&aggregateBy=cmdCode",validate:b=>Array.isArray(JSON.parse(b).data)},
  {sourceId:"usgs_mcs",category:"CRITICAL_MINERALS",url:"https://www.sciencebase.gov/catalog/file/get/696a75d5d4be0228872d3bf8/MCS2026_Commodities_Data.csv",validate:b=>b.includes("Commodity")&&b.length>200},
  {sourceId:"usgs_mrp",category:"CRITICAL_MINERALS",url:"https://www.usgs.gov/centers/national-minerals-information-center/data",validate:b=>/mineral|data/i.test(b)}
];

function classify(result){
  if(result.status==="PASS") return "LIVE_DATA";
  if(result.status==="AUTH_REQUIRED") return "CONFIGURED";
  if(result.status==="DEGRADED") return "DEGRADED";
  if(result.status==="FAIL") return "NO_DATA";
  return result.status;
}

const results=[];
for(const check of checks){
  const result=await probeSource(check);
  results.push({...result,country_iso3:check.country_iso3||null,coverage_status:classify(result)});
}
const counts={};
for(const row of results) counts[row.coverage_status]=(counts[row.coverage_status]||0)+1;
console.log(JSON.stringify({
  version:"1.0",
  generated_at:new Date().toISOString(),
  mode:"bounded_public_runtime_probe",
  scope:"representative source health; not a claim that every country-cell has live data",
  counts,
  results
},null,2));
