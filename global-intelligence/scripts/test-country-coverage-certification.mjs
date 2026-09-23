import fs from "node:fs/promises";
import {mkdtemp,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";

const dir=await mkdtemp(path.join(os.tmpdir(),"geomacro-cert-"));
const countries=Array.from({length:195},(_,i)=>({iso2:`C${String(i).padStart(2,"0")}`,iso3:`X${String(i).padStart(2,"0")}`,name:`Country ${i}`}));
const categories=["GEOPOLITICS","MACRO","CRITICAL_MINERALS"];
const matrixFor=(list,status="CONFIGURED")=>({cell_count:list.length*3,cells:list.flatMap(c=>categories.map(category=>({country_iso2:c.iso2,country_iso3:c.iso3,country_name:c.name,category,status})))});
const runtime={results:[
 {sourceId:"gdelt_v2",category:"GEOPOLITICS",coverage_status:"LIVE_DATA",checked_at:"2026-09-23T00:00:00.000Z"},
 {sourceId:"eurostat",category:"MACRO",country_iso3:"X01",coverage_status:"DEGRADED",checked_at:"2026-09-23T00:00:00.000Z"}
]};
const registry={categories:{
 GEOPOLITICS:[{id:"gdelt_v2",class:"GLOBAL_FALLBACK",coverage:"global"}],
 MACRO:[{id:"eurostat",class:"AUTHORITATIVE",coverage:"europe"}],
 CRITICAL_MINERALS:[{id:"usgs_mcs",class:"GLOBAL_FALLBACK",coverage:"global"}]
}};
const certSource=await fs.readFile(new URL("../health/country-coverage-certification.mjs",import.meta.url),"utf8");
async function run(list,matrix,runtimeInput){
 for(const [name,value] of Object.entries({countries:{countries:list},matrix,runtime:runtimeInput,registry})) await writeFile(path.join(dir,name+".json"),JSON.stringify(value));
 let source=certSource;
 for(const [relative,target] of [
  ["../country-mesh/countries.v1.json","file://"+path.join(dir,"countries.json")],
  ["../country-mesh/generated/coverage-matrix.v1.json","file://"+path.join(dir,"matrix.json")],
  ["../runtime-coverage-report.json","file://"+path.join(dir,"runtime.json")],
  ["../sources/source-registry.v1.json","file://"+path.join(dir,"registry.json")],
  ["./country-coverage-certification.v1.json","file://"+path.join(dir,"out.json")]
 ]) source=source.replaceAll(JSON.stringify(relative),JSON.stringify(target));
 const cert=path.join(dir,"cert.mjs"); await writeFile(cert,source);
 try { execFileSync(process.execPath,[cert],{stdio:"pipe"}); return {ok:true,report:JSON.parse(await fs.readFile(path.join(dir,"out.json"),"utf8"))}; }
 catch { return {ok:false}; }
}
if((await run(countries.slice(0,194),matrixFor(countries.slice(0,194)),runtime)).ok) throw new Error("Expected <195 country universe rejection");
const mismatch=matrixFor(countries); mismatch.cells.pop(); mismatch.cell_count=584;
if((await run(countries,mismatch,runtime)).ok) throw new Error("Expected N×3 matrix mismatch rejection");
if((await run(countries,matrixFor(countries,"LIVE_DATA"),runtime)).ok) throw new Error("Expected invalid matrix status rejection");
const report=(await run(countries,matrixFor(countries),runtime)).report;
if(report.counts.LIVE_DATA) throw new Error("Country-less runtime result must not mark a cell LIVE_DATA");
const accounted=Object.values(report.counts).reduce((sum,value)=>sum+value,0);
if(accounted!==report.cell_count) throw new Error("Certification status counts must account for every cell");
if((report.counts.DEGRADED||0)<1) throw new Error("Country-specific DEGRADED observation must be preserved");
if((report.counts.CONFIGURED||0)+(report.counts.DEGRADED||0)!==report.cell_count) throw new Error("Unexpected certification status produced");
console.log("Country coverage certification and integrity tests passed.");
