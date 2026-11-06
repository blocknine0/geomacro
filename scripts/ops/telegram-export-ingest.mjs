#!/usr/bin/env bun
/**
 * Owner-export ingestion is held until source object paths are registered in
 * D1. B2 object listing is forbidden and this entrypoint performs no B2 I/O.
 */
import {realpathSync} from "node:fs";
import {resolve,sep} from "node:path";
const PREFIX="telegram/owner-exports/";
function fail(){throw Error("TELEGRAM_EXPORT_D1_INDEX_REQUIRED_NO_B2_LIST_API")}
export function assertExportFileIsPrivate(path){
 if(typeof path!=="string"||!path.startsWith("/")||isInsideRepo(path))
   throw Error("TELEGRAM_EXPORT_INPUT_MUST_BE_PRIVATE");
}
function isInsideRepo(path){
 const root=realpathSync(process.cwd()),target=resolve(path);
 return target===root||target.startsWith(root+sep);
}
export async function listOwnerExports(){fail()}
async function main(){
 const prefix=process.env.GEOMACRO_TELEGRAM_EXPORT_PREFIX;
 if(prefix===undefined||prefix===""){
  console.log(JSON.stringify({schema:"geomacro.telegram-export-job.v1",
   state:"NO_OWNER_EXPORT_PREFIX_CONFIGURED",objects_listed:0,b2_requests:0}));
  return;
 }
 if(prefix!==PREFIX)fail();
 fail();
}
if(import.meta.url===new URL("file://"+process.argv[1]).href){
 main().catch(()=>{console.error("TELEGRAM_EXPORT_D1_INDEX_REQUIRED_NO_B2_LIST_API");process.exitCode=1});
}
