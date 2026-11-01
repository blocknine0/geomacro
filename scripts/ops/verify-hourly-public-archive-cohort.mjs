#!/usr/bin/env node
/**
 * Independent public static receipt for BOTH hourly publisher paths.
 * No source provider, D1, B2, protected auth, paid query or PREDGE network.
 * Archive worktree is created by the existing writer; this checks its actual
 * expected cohort, not a checked-in placeholder from the source repository.
 */
import {readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {verifyConvergedPublicStaticArchiveReadback} from "../lib/verify-public-static-archive-readback.mjs";
const BASE="https://geomacro-public-finds-archive.daspallab202391.workers.dev";
const PREFIX="GEOMACRO_HOURLY_STATIC_";
const fail=message=>{throw Error(PREFIX+message)};
const noClock=value=>{
 if(!value||typeof value!=="object"||Array.isArray(value))fail("DAILY_NOT_OBJECT");
 const {generated_at,...payload}=value;
 return JSON.stringify(payload);
};
export async function verifyHourlyPublicArchiveCohort({
 expectedIndex,expectedLatest,expectedCoverage,expectedDaily,read,
 now=()=>Date.now(),sleep=ms=>new Promise(done=>setTimeout(done,ms))
}={}){
 if(typeof read!=="function"||typeof now!=="function"||typeof sleep!=="function"||
    !expectedDaily||expectedDaily.ok!==true||
    expectedDaily.schema!=="geomacro.public-daily-official-finds.v1"||
    expectedDaily.official_only!==true||expectedDaily.chargeable!==false||
    !Array.isArray(expectedDaily.signals)||expectedDaily.signals.length>36||
    expectedDaily.generated_at!==expectedLatest?.checked_at)
   fail("EXPECTED_HIGHLIGHTS_INVALID");
 const core=await verifyConvergedPublicStaticArchiveReadback({
   expectedIndex,expectedLatest,expectedCoverage,read,now,sleep,attempts:5,delayMs:1200
 });
 // A daily file at another edge may lag the index/latest cohort. Re-read until
 // the same exact immutable headline and publication-clock fingerprint appears.
 let error;
 for(let attempt=1;attempt<=5;attempt++){
   try{
     const liveDaily=await read("/daily-highlights.json");
     if(liveDaily?.schema!==expectedDaily.schema||
        liveDaily?.generated_at!==expectedDaily.generated_at||
        noClock(liveDaily)!==noClock(expectedDaily))
       fail("DAILY_COHORT_MISMATCH");
     return Object.freeze({
       ...core,
       schema:"geomacro.hourly-source-to-public-archive-acceptance.v1",
       source_to_public_archive_exact:true,
       homepage_daily_highlights_exact:true,
       no_deploy_sweep_independently_verified:true,
       public_static_cohort_valid:true,
       observed_archive_category_counts:Object.fromEntries(
         ["geopolitics","macro","rare_earth"].map(c=>
            [c,expectedLatest.signals.filter(s=>s.category===c).length])),
       raw_source_data_logged:false,d1_reads:0,d1_writes:0,
       b2_requests:0,predge_modified:false,payments:0
     });
   }catch(e){error=e;if(attempt<5)await sleep(1200)}
 }
 throw error??Error(PREFIX+"DAILY_READBACK_UNAVAILABLE");
}
async function run(){
 const root=process.env.RUNNER_TEMP;
 if(!root||!root.startsWith("/"))fail("RUNNER_TEMP_MISSING");
 const dir=resolve(root,"geomacro-permanent-finds-archive/data");
 const expected=name=>JSON.parse(readFileSync(join(dir,name),"utf8"));
 const read=async path=>{
   const response=await fetch(BASE+path,{
     method:"GET",redirect:"error",cache:"no-store",
     headers:{Accept:"application/json","Cache-Control":"no-cache"},
     signal:AbortSignal.timeout(9_000)
   });
   if(response.status!==200)fail("PUBLIC_HTTP_"+response.status);
   const raw=await response.text();
   if(raw.length>2_000_000)fail("PUBLIC_TOO_LARGE");
   return JSON.parse(raw);
 };
 const r=await verifyHourlyPublicArchiveCohort({
    expectedIndex:expected("index.json"),expectedLatest:expected("latest.json"),
    expectedCoverage:expected("coverage-72h.json"),
    expectedDaily:expected("daily-highlights.json"),read
 });
 console.log(JSON.stringify(r));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 run().catch(e=>{console.error(String(e?.message??e));process.exitCode=1});
