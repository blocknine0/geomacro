#!/usr/bin/env bun
// Reuse the existing canonical country/source verifier. Two bounded workers,
// no job per country, no source bytes in artifacts, no commercial publication.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {appendFileSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {planFullContinentSweep,runFullContinentSweep} from '../lib/continent-country-full-sweep.mjs';
const env=process.env;
if(env.GITHUB_REPOSITORY!=='blocknine0/geomacro'||env.GITHUB_REF!=='refs/heads/main'||!env.RUNNER_TEMP)
 throw Error('CONTINENT_FULL_SWEEP_PROTECTED_MAIN_ONLY');
const registryText=readFileSync('src/lib/canonical-country-registry-195.ts','utf8');
const plan=planFullContinentSweep({continent:env.GEOMACRO_CONTINENT,registryText,
 eventName:env.GITHUB_EVENT_NAME,requestedIso3:env.GEOMACRO_REQUESTED_COUNTRY??'',
 canaryOnly:env.GEOMACRO_CONTINENT_CANARY_ONLY==='true'});
const root=mkdtempSync(join(env.RUNNER_TEMP,'geomacro-continent-'));
let receipt;
try{
 receipt=await runFullContinentSweep(plan,{registryText,runCountry:async(iso,index)=>{
  const dir=join(root,iso),file=join(dir,'live-batch-checkpoint.v1.json');
  mkdirSync(dir,{mode:0o700});
  await promisify(execFile)(process.execPath,['scripts/ops/verify-live-195-country-batch.ts'],{
   timeout:120000,killSignal:'SIGKILL',maxBuffer:512000,
   env:{...env,GEOMACRO_COUNTRY_BATCH_START:String(index),GEOMACRO_COUNTRY_BATCH_COUNT:'1',
    GEOMACRO_EXPECTED_COUNTRY_ISO3:iso,GEOMACRO_COUNTRY_CHECKPOINT_FILE:file},
  });
  if(statSync(file).size>500000)throw Error('COUNTRY_CHECKPOINT_OVERSIZE');
  const report=JSON.parse(readFileSync(file,'utf8'));
  console.log(JSON.stringify({continent:plan.continent,country_iso3:iso,category_cells:3,
   original_page_verified:report.original_page_verified,provider_requests:report.provider_requests}));
  return report;
 }});
}finally{rmSync(root,{recursive:true,force:true});}
mkdirSync('artifacts/country-195',{recursive:true,mode:0o700});
writeFileSync('artifacts/country-195/continent-sweep-checkpoint.v1.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
const {reports,...summary}=receipt;
console.log(JSON.stringify(summary));
if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,
 `### ${plan.continent}: ${receipt.countries_completed}/${plan.countries.length} countries\n\n`+
 `${receipt.completed_category_cells}/${receipt.expected_category_cells} category checks completed. Scope: ${plan.scope}.\n\n`+
 'Source verification only; missing originals remain unverified.\n');
if(!receipt.complete)process.exitCode=1;
