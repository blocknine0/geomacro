#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {validateSourceRightsManifest} from "../lib/risk-stream-source-rights-manifest.mjs";

const ROOT=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const MANIFEST_PATH=join(ROOT,"config/risk-stream-source-rights-reviewed.v1.json");
const CONFIRMATION="APPLY_RISK_STREAM_SOURCE_REGISTRY_PRODUCTION";
const DATABASE_NAME="geomacro-control-plane";
const DB_ID=/^[a-f0-9-]{36}$/iu;
const SELECT_COLUMNS="source_id,publisher_root_domain,parent_media_entity,source_role,"+
 "commercial_rights_approved,enabled,reviewed_at,rights_expire_at";
const quote=value=>value===null?"NULL":"'"+String(value).replaceAll("'","''")+"'";
const fail=code=>{throw Error("RISK_STREAM_SOURCE_REGISTRY_"+code)};
function rowValues(entry){
 return [entry.source_id,entry.publisher_root_domain,entry.parent_media_entity,
  entry.source_role,1,1,entry.rights_evidence.reviewed_at,entry.rights_expire_at];
}
function sourceUpsertSql(entry){
 if(entry.status!=="APPROVED")fail("PENDING_SOURCE_WRITE_FORBIDDEN");
 const values=rowValues(entry).map(value=>typeof value==="number"?String(value):quote(value)).join(",");
 return "INSERT INTO risk_stream_sources ("+SELECT_COLUMNS+") VALUES ("+values+") "+
  "ON CONFLICT(source_id) DO UPDATE SET publisher_root_domain=excluded.publisher_root_domain,"+
  "parent_media_entity=excluded.parent_media_entity,source_role=excluded.source_role,"+
  "commercial_rights_approved=1,enabled=1,reviewed_at=excluded.reviewed_at,"+
  "rights_expire_at=excluded.rights_expire_at;";
}
function sourceReadbackSql(entries){
 const ids=JSON.stringify(entries.map(x=>x.source_id));
 return "SELECT "+SELECT_COLUMNS+" FROM risk_stream_sources WHERE source_id IN "+
  "(SELECT value FROM json_each("+quote(ids)+")) ORDER BY source_id;";
}
function wrangler(args,{env=process.env,spawn=spawnSync}={}){
 const result=spawn("npx",["-y","wrangler@4.136.3",...args],{
  encoding:"utf8",timeout:100000,env,maxBuffer:2000000});
 if(result.error||result.status!==0)
  fail("PROTECTED_D1_EXECUTION_FAILED");
 return result.stdout;
}
function rowsFrom(output){
 let parsed;
 try{parsed=typeof output==="string"?JSON.parse(output):output}
 catch{fail("WRANGLER_JSON_INVALID")}
 const rows=Array.isArray(parsed)?parsed.flatMap(x=>x?.results??x?.result?.results??[]):
  parsed?.results??parsed?.result?.results;
 if(!Array.isArray(rows))fail("WRANGLER_RESULT_SHAPE_INVALID");
 return rows;
}
function assertReadback(entries,rows){
 if(rows.length!==entries.length)fail("READBACK_COUNT_MISMATCH");
 const actual=new Map(rows.map(row=>[row.source_id,row]));
 for(const entry of entries){
  const row=actual.get(entry.source_id);
  if(!row||row.publisher_root_domain!==entry.publisher_root_domain||
     row.parent_media_entity!==entry.parent_media_entity||
     row.source_role!==entry.source_role||row.commercial_rights_approved!==1||
     row.enabled!==1||row.reviewed_at!==entry.rights_evidence.reviewed_at||
     row.rights_expire_at!==entry.rights_expire_at)
   fail("READBACK_COLUMN_MISMATCH");
 }
}
function makeWranglerConfig({root=ROOT,env=process.env,tempParent=tmpdir()}={}){
 const databaseId=env.D1_DATABASE_ID??"";
 if(!DB_ID.test(databaseId))fail("D1_DATABASE_ID_INVALID");
 const example=readFileSync(join(root,"workers/control-plane/wrangler.example.jsonc"),"utf8")
  .replace(/^\s*\/\/.*$/gmu,"");
 let config;
 try{config=JSON.parse(example)}catch{fail("WRANGLER_CONFIG_INVALID")}
 if(config.name!==DATABASE_NAME||!Array.isArray(config.d1_databases)||
    !config.d1_databases.some(x=>x.binding==="DB"&&x.database_name===DATABASE_NAME))
  fail("WRANGLER_DATABASE_TARGET_INVALID");
 config.d1_databases=config.d1_databases.map(x=>x.binding==="DB"?
  {...x,database_id:databaseId}:x);
 const dir=mkdtempSync(join(tempParent,"geomacro-risk-stream-source-registry-"));
 const path=join(dir,"wrangler.json");
 writeFileSync(path,JSON.stringify(config),{mode:0o600});
 return {path,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
export function buildSourceRegistrationPlan(manifest,now=Date.now()){
 const {approvedEntries,pendingEntries}=validateSourceRightsManifest(manifest,now);
 return {approvedEntries,pendingEntries,
  statements:approvedEntries.map(sourceUpsertSql),
  readbackSql:approvedEntries.length?sourceReadbackSql(approvedEntries):null};
}
export function runSourceRegistration({manifest,apply=false,preflight=false,env=process.env,
 runWrangler=wrangler,root=ROOT,now=Date.now(),tempParent=tmpdir()}={}){
 const plan=buildSourceRegistrationPlan(manifest,now);
 if(apply&&preflight)fail("MODE_CONFLICT");
 if(preflight){
  const config=makeWranglerConfig({root,env,tempParent});
  try{
   const output=runWrangler(["d1","execute",DATABASE_NAME,"--remote","--json",
    "--config",config.path,"--command",
    "SELECT type,name,sql FROM sqlite_schema WHERE name IN "+
     "('risk_stream_sources','risk_stream_category_policy'); "+
     "SELECT category,required_role_a,required_role_b,enabled FROM "+
     "risk_stream_category_policy ORDER BY category;"],{env});
   const rows=rowsFrom(output),objects=rows.filter(x=>x.type==="table");
   const sourceTable=objects.find(x=>x.name==="risk_stream_sources")?.sql??"";
   const policyTable=objects.find(x=>x.name==="risk_stream_category_policy")?.sql??"";
   const policies=new Map(rows.filter(x=>typeof x.category==="string")
    .map(x=>[x.category,x]));
   const expectedPolicies={GEOPOLITICS:["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"],
    MACRO_FX:["OFFICIAL_STATISTICS","MARKET_PRICE"],
    CRITICAL_MINERALS:["TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]};
   const policiesMatch=Object.entries(expectedPolicies).every(([category,roles])=>{
    const row=policies.get(category);
    return row?.required_role_a===roles[0]&&row?.required_role_b===roles[1]&&row?.enabled===1;
   });
   if(!sourceTable.includes("commercial_rights_approved")||
      !sourceTable.includes("parent_media_entity")||!sourceTable.includes("rights_expire_at")||
      !policyTable.includes("required_role_a")||!policyTable.includes("required_role_b")||
      !policiesMatch)
    fail("PROVIDER_SCHEMA_NOT_READY");
   return {mode:"preflight",provider_schema_verified:true,
    approved_sources_planned:plan.approvedEntries.length,
    pending_sources_ignored:plan.pendingEntries.length};
  }finally{config.cleanup()}
 }
 if(!apply)return {mode:"dry-run",...plan};
 if(env.CONFIRM!==CONFIRMATION)fail("APPLY_CONFIRMATION_REQUIRED");
 if(plan.approvedEntries.length===0)fail("NO_APPROVED_SOURCES");
 const config=makeWranglerConfig({root,env,tempParent});
 try{
  for(const statement of plan.statements){
   runWrangler(["d1","execute",DATABASE_NAME,"--remote","--json",
    "--config",config.path,"--command",statement],{env});
  }
  const readback=runWrangler(["d1","execute",DATABASE_NAME,"--remote","--json",
   "--config",config.path,"--command",plan.readbackSql],{env});
  assertReadback(plan.approvedEntries,rowsFrom(readback));
  return {mode:"apply",written:plan.approvedEntries.length,
   readback_verified:true,pending_ignored:plan.pendingEntries.length};
 }finally{config.cleanup()}
}
function parseArgs(args){
 if(args.length===0)return {apply:false};
 if(args.length===1&&args[0]==="--dry-run")return {apply:false};
 if(args.length===1&&args[0]==="--apply")return {apply:true};
 if(args.length===1&&args[0]==="--preflight")return {apply:false,preflight:true};
 fail("ARGUMENTS_INVALID");
}
function main(){
 const {apply,preflight}=parseArgs(process.argv.slice(2));
 const manifest=JSON.parse(readFileSync(MANIFEST_PATH,"utf8"));
 const result=runSourceRegistration({manifest,apply,preflight});
 if(result.mode==="dry-run"){
  if(result.statements.length===0){
   process.stdout.write("NO_APPROVED_SOURCES; no SQL generated and no writes performed.\n");
   return;
  }
  process.stdout.write(result.statements.join("\n")+"\n"+result.readbackSql+"\n");
  return;
 }
 process.stdout.write(JSON.stringify(result)+"\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(error){
  process.stderr.write(String(error?.message??"RISK_STREAM_SOURCE_REGISTRY_FAILED").slice(0,240)+"\n");
  process.exitCode=1;
 }
}
