import {
  parseUsGSMineralsYearbookProductionCsv,
  parseUsGSMineralsYearbookFacilitiesCsv
} from "../adapters/usgs-minerals-yearbook.mjs";

const productionCsv=[
  "Country,Commodity,Unit,2024,2023",
  ""India","Copper","metric tons","100","90"",
  ""United States","Nickel","metric tons","50","45""
].join("\n");

const facilitiesCsv=[
  "Country,Commodity,Facility,Annual Capacity,Unit",
  ""India","Copper","Example Mine","1000","metric tons/year""
].join("\n");

const production=parseUsGSMineralsYearbookProductionCsv(productionCsv,{countryIso3:"IND"});
const facilities=parseUsGSMineralsYearbookFacilitiesCsv(facilitiesCsv,{countryIso3:"IND"});

if(production.length!==4) throw new Error(`USGS production parser expected 4 observations, got ${production.length}`);
if(facilities.length!==1) throw new Error(`USGS facility parser expected 1 observation, got ${facilities.length}`);
if(production.some(row=>row.raw?.evidence_type!=="PRODUCTION")) throw new Error("USGS production evidence type mismatch");
if(facilities.some(row=>row.raw?.evidence_type!=="FACILITY")) throw new Error("USGS facility evidence type mismatch");

const remoteUrl=process.env.USGS_2024_MYB_PRODUCTION_URL || "";
if(remoteUrl){
  const remote=await (await fetch(remoteUrl)).text();
  const rows=parseUsGSMineralsYearbookProductionCsv(remote);
  if(!rows.length) throw new Error("Configured USGS production CSV returned no parsed observations.");
  console.log(`USGS remote parser PASS: ${rows.length} observations`);
}else{
  console.log("USGS parser unit PASS; remote fetch skipped because USGS_2024_MYB_PRODUCTION_URL is not set.");
}
