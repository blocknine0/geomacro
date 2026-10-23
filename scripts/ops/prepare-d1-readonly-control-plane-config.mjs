#!/usr/bin/env node
// Existing Cloudflare D1 metadata lookup ONLY. There is no create, migrate,
// write or deployment permission here. The database UUID stays in a private,
// ephemeral GitHub Actions file and must never enter logs/artifacts.
import {readFileSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";

const DATABASE="geomacro-control-plane";
const CONFIG="workers/control-plane/wrangler.readonly.runtime.jsonc";
const TEMPLATE="workers/control-plane/wrangler.example.jsonc";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const bad=()=>{throw Error("D1_READONLY_EXISTING_DATABASE_BINDING_INVALID");};

export function existingReadOnlyControlPlaneD1Config(listJson,templateJson){
  if(typeof listJson!=="string"||listJson.length>2*1024*1024||
     typeof templateJson!=="string"||templateJson.length>16*1024)bad();
  let list,template;
  try{list=JSON.parse(listJson);template=JSON.parse(templateJson);}
  catch{bad();}
  if(!Array.isArray(list)||list.length>200||
     !template||Array.isArray(template)||
     template.name!==DATABASE||!Array.isArray(template.d1_databases)||
     template.d1_databases.length!==1||
     template.d1_databases[0]?.binding!=="DB"||
     template.d1_databases[0]?.database_name!==DATABASE||
     template.d1_databases[0]?.database_id!=="REPLACE_WITH_D1_DATABASE_ID")bad();
  const matches=list.filter(x=>x&&typeof x==="object"&&x.name===DATABASE);
  if(matches.length!==1)bad(); // NEVER create a replacement on missing/duplicate.
  const id=matches[0].uuid??matches[0].id;
  if(typeof id!=="string"||!UUID.test(id))bad();
  const config={
    name:DATABASE,main:"src/index.mjs",
    compatibility_date:template.compatibility_date,
    d1_databases:[{binding:"DB",database_name:DATABASE,database_id:id}],
  };
  // No keys, sensitive provider names, vars, or request/response metadata.
  return Object.freeze(config);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    let input="";
    for await(const block of process.stdin){
      input+=block.toString("utf8");
      if(input.length>2*1024*1024)bad();
    }
    const obj=existingReadOnlyControlPlaneD1Config(input,
      readFileSync(TEMPLATE,"utf8"));
    writeFileSync(CONFIG,JSON.stringify(obj,null,2)+"\n",{mode:0o600,flag:"wx"});
    console.log("D1_READONLY_EXISTING_DATABASE_BOUND");
  }catch{
    console.error("::error::D1_READONLY_EXISTING_DATABASE_BINDING_INVALID");
    process.exitCode=3;
  }
}
