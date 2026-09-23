import {getJson} from "../adapters/http.mjs";
const probes=[
 {id:"world_bank_indicators",category:"MACRO",url:"https://api.worldbank.org/v2/country/IND/indicator/NY.GDP.MKTP.CD?format=json&mrv=1"},
 {id:"gdelt_v2",category:"GEOPOLITICS",url:"https://api.gdeltproject.org/api/v2/doc/doc?query=country:IN&mode=ArtList&format=json&maxrecords=1"},
 {id:"imf_sdmx",category:"MACRO",url:"https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/IND"},
 {id:"eurostat",category:"MACRO",url:"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo_pjan?geo=DE&sex=T&age=TOTAL"},
 {id:"usgs_mcs",category:"CRITICAL_MINERALS",url:"https://www.usgs.gov/centers/national-minerals-information-center/data"}
];
for(const p of probes){
  const started=Date.now();
  try { const body=await getJson(p.url); console.log(JSON.stringify({source_id:p.id,category:p.category,status:"PASS",latency_ms:Date.now()-started,shape:typeof body})); }
  catch(e){ console.log(JSON.stringify({source_id:p.id,category:p.category,status:"FAIL",latency_ms:Date.now()-started,error:String(e.message)})); }
}
