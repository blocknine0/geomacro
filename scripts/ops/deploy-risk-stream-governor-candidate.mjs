#!/usr/bin/env node
// Deploys ONLY a separate shadow worker; NEVER touches geomacro-control-plane.
import {readFileSync,writeFileSync,existsSync} from "node:fs";
import {spawnSync,execFileSync} from "node:child_process";
import {createHmac} from "node:crypto";
import {verifyCandidateGovernor,CANDIDATE_HOST} from "./verify-risk-stream-governor-candidate.mjs";
const DB="geomacro-risk-stream-shadow";
const CONFIG="workers/risk-stream-governor-candidate/wrangler.candidate.runtime.jsonc";
function need(x,s){if(!x)throw Error("ISOLATED_GOVERNOR_CANDIDATE_HOLD_"+s)}
function wrangler(args,input){
 const r=spawnSync("npx",["-y","wrangler@4.136.3",...args],{
  encoding:"utf8",timeout:110000,input,env:process.env,maxBuffer:1000000});
 if(r.error||r.status!==0)throw Error("ISOLATED_GOVERNOR_WRANGLER_FAILED_"+args.slice(0,2).join("_"));
 return r.stdout;
}
async function main(){
 need(process.env.GITHUB_REPOSITORY==="blocknine0/geomacro"&&
  process.env.GITHUB_REF==="refs/heads/main"&&
  existsSync("config/d1-hotspot-v2-canary.hold"),"MAIN_HOLD_REQUIRED");
 const sha=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
 need(/^[a-f0-9]{40}$/.test(sha),"SHA_INVALID");
 const meta=JSON.parse(readFileSync(".shadow-audit/metadata.json","utf8"));
 need(meta.executed_commit===sha&&meta.shadow_db===DB&&
  meta.commercial_delivery===false&&meta.risk_stream_active===false,
  "SHADOW_PROVISION_MISSING");
 const root=process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN||"";
 need(root.length>=32&&process.env.CLOUDFLARE_API_TOKEN?.length>=20&&
  /^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_ACCOUNT_ID||""),
  "PROTECTED_CREDENTIALS_REQUIRED");
 const ids=JSON.parse(wrangler(["d1","list","--json"]));
 const row=ids.find(x=>x.name===DB),dbid=row?.uuid||row?.id;
 need(/^[a-f0-9-]{36}$/i.test(dbid??""),"SHADOW_D1_UUID_MISSING");
 const cfg=JSON.parse(readFileSync("workers/risk-stream-governor-candidate/wrangler.example.jsonc","utf8"));
 need(cfg.name==="geomacro-risk-stream-governor-candidate"&&
  cfg.main==="src/index.mjs"&&cfg.workers_dev===true&&
  !cfg.routes&&!cfg.triggers&&!cfg.queues&&!cfg.r2_buckets&&!cfg.kv_namespaces&&
  cfg.vars?.SHADOW_MODE==="ISOLATED_GOVERNOR_POLICY"&&
  cfg.vars?.SHADOW_NO_FUNDS==="1"&&cfg.vars?.RISK_STREAM_ACTIVE==="0"&&
  cfg.vars?.STREAM_INGESTION_ENABLED==="false"&&
  cfg.d1_databases?.length===1&&cfg.d1_databases[0].database_name===DB,
  "CONFIG_NOT_ISOLATED");
 cfg.d1_databases[0].database_id=dbid;
 cfg.vars.SHADOW_REVIEWED_SHA=sha;
 writeFileSync(CONFIG,JSON.stringify(cfg,null,2),{mode:0o600});
 wrangler(["d1","execute",DB,"--remote","--config",CONFIG,"--file",
  "workers/risk-stream-governor-candidate/sql/0001_isolated_b2_quota.sql"]);
 const check=JSON.parse(wrangler(["d1","execute",DB,"--remote","--json",
  "--config",CONFIG,"--command",
  "SELECT name FROM sqlite_schema WHERE type='table' AND name='b2_account_daily_request_quota'"]));
 need(check?.[0]?.results?.[0]?.name==="b2_account_daily_request_quota","D1_SCHEMA_READBACK_MISSING");
 const result=wrangler(["deploy","--config",CONFIG]);
 const url=result.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0]||"";
 need(CANDIDATE_HOST.test(url),"WORKERS_DEV_URL_INVALID");
 const bearer=createHmac("sha256",root).update(
  "geomacro-shadow-risk-stream-20261111/governor-candidate-bearer").digest("hex");
 wrangler(["secret","put","SHADOW_GOVERNOR_ADMIN_BEARER","--config",CONFIG],bearer+"\n");
 let report=null;
 for(let attempt=0;attempt<7;attempt++){
  try{
   report=await verifyCandidateGovernor({base:url,bearer,expectedSha:sha});
   break;
  }catch(e){
   const cause=String(e?.message||"");
   // Cloudflare deploy + secret put create distinct edge revisions. Recheck
   // only transient not-yet-routed/edge errors, never open auth or bad policy.
   if(attempt===6||!/^(?:CANDIDATE_GOVERNOR_UNAUTHENTICATED_HTTP_(?:404|425|429|500|502|503|504|520|522|523|524)|CANDIDATE_GOVERNOR_READBACK_HTTP_(?:404|425|429|500|502|503|504|520|522|523|524))$/.test(cause))
    throw e;
   await new Promise(resolve=>setTimeout(resolve,1500*(attempt+1)));
  }
 }
 need(report?.status==="SHADOW_CANDIDATE_D1_POLICY_MATCH",
  "DEPLOYED_POLICY_READBACK_UNVERIFIED");
 writeFileSync(".shadow-audit/candidate-governor-parity.json",JSON.stringify(report,null,2));
 console.log("ISOLATED_DEPLOYED_GOVERNOR_POLICY_PARITY_PASS "+
  JSON.stringify({source_sha:sha,limits:report.limits,shadow_db:DB,
   production_d1_ledger_verified:false,hold_retained:true,no_funds:true}));
}
main().catch(e=>{console.error(String(e?.message||e).slice(0,240));process.exitCode=1});
