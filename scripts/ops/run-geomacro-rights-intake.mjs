#!/usr/bin/env node
/**
 * Offline-only private rights planning.
 * --catalogue: safe count audit, no network, no private files.
 * --input=/outside/repo/rights-candidates.json --out=/outside/repo/queue.json
 * reads article URL/hash references + permission-document hashes from a
 * 0600 owner-private file and writes PRIVATE queue at 0600.
 * Never signs, approves upstream licenses, publishes or pays.
 */
import {openSync,readFileSync,writeFileSync,closeSync,lstatSync,realpathSync,constants} from "node:fs";
import {dirname,resolve,isAbsolute,relative,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {COMMERCIAL_SOURCE_RIGHTS_EVIDENCE} from "../commercial-source-rights-evidence.mjs";
import {planGeomacroCommercialRightsIntake,privateRightsIntakePublicSummary} from "../lib/geomacro-rights-intake-autopilot.mjs";
const fail=()=>{throw Error("RIGHTS_PRIVATE_INTAKE_FAILURE")};
const repo=realpathSync(new URL("../../",import.meta.url));
const outside=p=>{
 if(!isAbsolute(p))fail();
 const r=relative(repo,p);
 if(r===""||r===".."||r.startsWith(".."+sep))return;
 fail();
};
function readPrivate(path){
 outside(path);
 const abs=realpathSync(path),stat=lstatSync(path);
 outside(abs);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2500000||stat.size<10||
    (stat.mode&0o077)!==0)fail();
 const fd=openSync(abs,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{return JSON.parse(readFileSync(fd,"utf8"))}finally{closeSync(fd)}
}
function writePrivate(path,value){
 outside(path);
 const dir=realpathSync(dirname(path)),stat=lstatSync(dirname(path));
 outside(dir);
 if(stat.isSymbolicLink()||!stat.isDirectory()||(stat.mode&0o077)!==0)fail();
 const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{writeFileSync(fd,JSON.stringify(value,null,2)+"\n")}finally{closeSync(fd)}
}
export function reviewedSourceCatalogReceipt(){
 const list=Object.entries(COMMERCIAL_SOURCE_RIGHTS_EVIDENCE);
 return {
  schema:"geomacro.rights-catalogue-boundary.v1",
  total_versioned_dataset_evidence:list.length,
  reviewed_catalogue_with_attribution_obligations:list.filter(([,x])=>x.attribution_required===true).length,
  reviewed_catalogue_no_attribution_obligation:list.filter(([,x])=>x.attribution_required===false).length,
  article_level_permissions_created:0,
  no_attribution_external_rights_automatically_granted:false,
  actual_195_country_directory_license_cleared:false,
  facts_role_signed:0,rights_role_signed:0,production_gro_signed:0,
  source_identity_to_customers_disclosed:false,
  payments:0,supabase_requests:0,b2_requests:0,d1_writes:0
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length===3&&process.argv[2]==="--catalogue"){
   console.log(JSON.stringify(reviewedSourceCatalogReceipt()));
  }else{
   if(process.argv.length!==4||!process.argv[2].startsWith("--input=")||
      !process.argv[3].startsWith("--out="))fail();
   const input=readPrivate(process.argv[2].slice(8));
   if(!input||input.schema!=="geomacro.private-rights-intake-request.v1"||
      !Array.isArray(input.originals)||!Array.isArray(input.permissions))fail();
   const plan=planGeomacroCommercialRightsIntake(input.originals,{
      now:new Date(),permissions:input.permissions,declaredDirectoryCount:779});
   writePrivate(process.argv[3].slice(6),plan);
   console.log(JSON.stringify(privateRightsIntakePublicSummary(plan)));
  }
 }catch{
  console.error("RIGHTS_PRIVATE_INTAKE_FAILED_CLOSED");
  process.exitCode=2;
 }
}
