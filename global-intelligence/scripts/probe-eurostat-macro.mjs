import {fetchEurostatDataset, eurostatGeoForCountry} from "../adapters/eurostat.mjs";

const checks = [
  {countryIso3:"DEU",datasetCode:"nama_10_gdp",filters:{na_item:"B1GQ",unit:"CLV10_EUR_HAB",freq:"A"},startPeriod:"2022",endPeriod:"2024"},
  {countryIso3:"FRA",datasetCode:"prc_hicp_manr",filters:{unit:"RCH_A",coicop:"CP00"},startPeriod:"2023",endPeriod:"2025"},
  {countryIso3:"ITA",datasetCode:"une_rt_m",filters:{sex:"T",age:"Y15-74",unit:"PC_ACT",s_adj:"SA"},startPeriod:"2024",endPeriod:"2025"}
];

let failures=0;
for (const check of checks) {
  try {
    const result=await fetchEurostatDataset(check.datasetCode,check);
    if (!eurostatGeoForCountry(check.countryIso3)) throw new Error("No Eurostat geography mapping");
    if (!result.rows.length) throw new Error("No decoded observations");
    console.log(JSON.stringify({source_id:"eurostat",country_iso3:check.countryIso3,dataset_code:check.datasetCode,status:"PASS",observations:result.rows.length}));
  } catch (error) {
    failures++;
    console.error(JSON.stringify({source_id:"eurostat",country_iso3:check.countryIso3,dataset_code:check.datasetCode,status:"FAIL",error:String(error.message || error)}));
  }
}
process.exitCode=failures ? 1 : 0;
