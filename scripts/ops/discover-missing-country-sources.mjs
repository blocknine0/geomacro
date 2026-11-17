#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {CONTINENT_COUNTRIES_195} from "../lib/continent-country-195-rotation.mjs";
import {buildCountrySourceGapReport} from "../lib/country-source-gap-finder.mjs";
import {parseCountries,gatherSources,loadCatalogues,probeRotation} from "./phase2i-coverage-inventory.mjs";
import {HOT50_COUNTRY_ISO3} from "../lib/hot-50-country-watch.mjs";
const fail=code=>{throw Error("COUNTRY_SOURCE_DISCOVERY_"+code)};
const readJson=path=>JSON.parse(readFileSync(path,"utf8"));
function parseArgs(argv){
 const out={probe:false,probeLimit:18,now:new Date()};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(arg==="--probe")out.probe=true;
  else if(arg==="--probe-limit"){const n=Number(argv[++i]);if(!Number.isInteger(n)||n<1||n>24)fail("PROBE_LIMIT_INVALID");out.probeLimit=n;}
  else if(arg==="--risk-stream-sources"){out.riskSources=argv[++i];if(!out.riskSources)fail("RISK_SNAPSHOT_REQUIRED");}
  else if(arg==="--previous"){out.previous=argv[++i];if(!out.previous)fail("PREVIOUS_PATH_REQUIRED");}
  else if(arg==="--out"){out.output=argv[++i];if(!out.output)fail("OUTPUT_PATH_REQUIRED");}
  else fail("ARGUMENTS_INVALID");
 }
 if(!out.riskSources||!out.output)fail("RISK_SNAPSHOT_AND_OUTPUT_REQUIRED");
 return out;
}
export async function discoverMissingCountrySources({riskStreamSources,previousProbes=[],probe=false,
 probeLimit=18,now=new Date(),catalogues=loadCatalogues(),countries=parseCountries(
  readFileSync("src/lib/canonical-country-registry-195.ts","utf8")),
 hot50=HOT50_COUNTRY_ISO3,rightsEntries=readJson("config/risk-stream-source-rights-reviewed.v1.json").entries,
 fetchImpl=fetch}={}){
 if(!Array.isArray(riskStreamSources))fail("RISK_ROWS_INVALID");
 const sources=gatherSources(countries,catalogues);
 const probes=probe?await probeRotation(sources,now,fetchImpl,probeLimit):[];
 const allProbes=new Map((previousProbes??[]).filter(p=>p&&typeof p.source_id==="string")
  .map(p=>[p.source_id,p]));
 for(const p of probes)allProbes.set(p.source_id,p);
 return {report:buildCountrySourceGapReport({countries,hot50,sourceCatalog:sources,
  riskStreamSources,probes:[...allProbes.values()],rightsEntries,now:now.getTime()}),
  probes,source_catalog_count:sources.length,private_osint_probe_count:probes.length};
}
async function main(){
 const args=parseArgs(process.argv.slice(2));
 const risk=readJson(args.riskSources);
 const rows=Array.isArray(risk)?risk:risk.results??risk.result?.results;
 if(!Array.isArray(rows))fail("RISK_SNAPSHOT_SHAPE_INVALID");
 let previous={};if(args.previous)try{previous=readJson(args.previous)}catch{}
 const result=await discoverMissingCountrySources({riskStreamSources:rows,
  previousProbes:previous.probes??previous.source_probes??[],probe:args.probe,
  probeLimit:args.probeLimit,now:new Date()});
 mkdirSync(resolve(args.output,".."),{recursive:true,mode:0o700});
 writeFileSync(args.output,JSON.stringify({...result.report,
  source_catalog_count:result.source_catalog_count,
  probes_this_run:result.probes,
  private_osint_probe_count:result.private_osint_probe_count},null,2)+"\n",{mode:0o600});
 process.stdout.write(JSON.stringify({schema:result.report.schema,
  cells:result.report.cell_count,gaps:result.report.gap_count,
  hot50_gaps:result.report.hot50_gap_count,
  catalog_sources:result.source_catalog_count,
  probes:result.private_osint_probe_count,
  commercially_approved_candidates:result.report.cells.flatMap(c=>c.candidate_sources)
   .filter(x=>x.commercial_rights_approved===1).length})+"\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{await main()}catch(error){
  process.stderr.write(String(error?.message??"COUNTRY_SOURCE_DISCOVERY_FAILED").slice(0,220)+"\n");
  process.exitCode=2;
 }
}
