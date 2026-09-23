import {fetchOfficialDataset} from "../adapters/official-statistics.mjs";

const checks=[{
  source_id:"us_bls_public",country_iso3:"USA",category:"MACRO",
  base_url:"https://api.bls.gov/publicAPI/v2",path:"timeseries/data",
  query:{seriesid:["LNS14000000"],startyear:"2024",endyear:"2025"}
}];

let failures=0;
for(const check of checks){
  try{
    const rows=await fetchOfficialDataset(check);
    if(!rows.length) throw new Error("No normalized observations");
    console.log(JSON.stringify({source_id:check.source_id,country_iso3:check.country_iso3,status:"PASS",observations:rows.length}));
  }catch(error){
    failures++;
    console.error(JSON.stringify({source_id:check.source_id,country_iso3:check.country_iso3,status:"FAIL",error:String(error.message || error)}));
  }
}
process.exitCode=failures ? 1 : 0;
