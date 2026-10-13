#!/usr/bin/env node
// Discovery ONLY: previous Supabase ingestion sources; no DB / raw logging.
// One bounded provider request each and print schema-only transport evidence.
const targets=[
 ["unhcr_population","https://api.unhcr.org/population/v1/population/?yearFrom=2024&yearTo=2024&coo_all=true&coa_all=true&limit=5&page=1"],
 ["bgs_minerals","https://ogcapi.bgs.ac.uk/collections/world-mineral-statistics/items?f=json&limit=5"],
 ["usgs_mcs","https://www.sciencebase.gov/catalog/item/69837e43b66b01367d7ec7c7?format=json"]
];
const results=await Promise.all(targets.map(async([id,url])=>{
 try{
 const r=await fetch(url,{method:"GET",redirect:"error",signal:AbortSignal.timeout(9000),headers:{Accept:"application/json"}});
 const len=Number(r.headers.get("content-length")||0);
 if(len>400000)return{id,http:r.status,state:"OVERSIZE",length_declared:len};
 const raw=await r.text();
 if(raw.length>400000)return{id,http:r.status,state:"OVERSIZE_READ"};
 let obj;
 try{obj=JSON.parse(raw)}catch{return{id,http:r.status,state:"NON_JSON"}}
 return{id,http:r.status,state:"JSON",
  fields:obj && !Array.isArray(obj) ? Object.keys(obj).slice(0,13) : [],
  entries:{items:Array.isArray(obj?.items)?obj.items.length:null,
   features:Array.isArray(obj?.features)?obj.features.length:null,
   files:Array.isArray(obj?.files)?obj.files.length:null},
  example_entry_fields:Object.keys(obj?.items?.[0]??obj?.features?.[0]?.properties??obj?.files?.[0]??{}).slice(0,17),
  exact_legacy_file_present:Array.isArray(obj?.files)&&obj.files.some(f=>f?.name==="MCS2026_Commodities_Data.csv")};
 }catch{return{id,http:null,state:"NETWORK_UNAVAILABLE"}}
}));
console.log(JSON.stringify({schema:"geomacro.previous-supabase-provider-actual-schema-probe.v1",results,
 raw_payloads_logged:false,payments:0,db_writes:0}));
