#!/usr/bin/env node
// P0 recovery handoff: metadata-only, zero-network. Input SHA hints are never proof.
// No signed payload, URL, credential, raw original, B2 bytes or SHA reaches output.
import {readFileSync,mkdirSync,writeFileSync,appendFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {explainGriSignedInputBlockers} from "../lib/gri-signed-ready-cadence-hint.mjs";
import {prepareMachineIntelligenceSignedReadyHint} from "../lib/machine-intelligence-signed-ready-hint.mjs";

const PRODUCTS=["intelligence","global-risk","risk-indices"];
const SAFE_REASONS=new Set(["ROW_ABSENT","SOURCE_TOO_OLD","EXPIRED","TIMESTAMP_INVALID",
 "FUTURE_TIMESTAMP","EXPIRY_WINDOW_INVALID","PUBLISHER_CONTRACT_INVALID",
 "PROOF_METADATA_INVALID"]);
const bounded=x=>Number.isInteger(x)&&Math.abs(x)<=525600?x:null;
const safeStatus=x=>Number.isInteger(x)&&x>=0&&x<=599?x:0;
const hintState=x=>x?"VALID_POINTER_HINT_ONLY_NOT_SIGNED_PROOF":"MISSING_OR_STALE_HINT";

export function reconcilePublicHotRecovery({publicDiagnostic,metadata,env={},now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("RECOVERY_CLOCK_INVALID");
 const publicOk=publicDiagnostic?.schema==="geomacro.public-serving-readonly-diagnostic.v1"&&
   publicDiagnostic.ok===true;
 const knownMeta=metadata?.schema==="geomacro.d1-hot-metadata-expiry-diagnostic.v1";
 const gri=explainGriSignedInputBlockers({reviewedSha:env.GRI_READY_REVIEWED_SHA256,
   certificatesSha:env.GRI_READY_CERTIFICATES_SHA256,readyAt:env.GRI_READY_APPROVED_AT,now});
 const machine=prepareMachineIntelligenceSignedReadyHint({
   inputSha:env.MACHINE_INTELLIGENCE_READY_INPUT_SHA256,
   approvedAt:env.MACHINE_INTELLIGENCE_READY_APPROVED_AT,now});
 const products={};
 for(const name of PRODUCTS){
   const row=knownMeta?metadata.products?.[name]:null;
   const reasons=Array.isArray(row?.reasons)?
     row.reasons.filter(x=>SAFE_REASONS.has(x)).slice(0,8):[];
   const fresh=row?.metadata_eligible===true&&row?.live_freshness_eligible===true;
   products[name]={
     metadata_state:knownMeta&&["ROW_ABSENT","METADATA_REJECTED","METADATA_ONLY_POSSIBLE"].includes(row?.state)?row.state:"UNOBSERVED",
     reasons,source_age_minutes:bounded(row?.source_age_minutes),
     expiry_in_minutes:bounded(row?.expiry_in_minutes),
     native_source_freshness_eligible:fresh,
     public_hot_http_status:safeStatus(
       publicDiagnostic?.products?.[name]?.status ??
       publicDiagnostic?.products?.[name]?.http_status),
     current_signed_product_verified:false,
   };
 }
 const blocking=[];
 for(const name of PRODUCTS)
   if(!products[name].native_source_freshness_eligible)
     blocking.push(name.toUpperCase().replaceAll("-","_")+"_CURRENT_ORIGINAL_SOURCE_AND_HOT_PROOF_REQUIRED");
 if(!machine.eligible)blocking.push("INTELLIGENCE_DUAL_SIGNED_MACHINE_INPUT_NOT_READY");
 if(!gri.externally_approved_fresh_hint_valid)blocking.push("GRI_INDEPENDENT_SIGNED_INPUT_AND_CERTIFICATES_NOT_READY");
 // Production root-cause JSON exposes this at TOP LEVEL; older test
 // fixtures used site.*. Recognize both without silently skipping 0/3.
 const baseline=publicDiagnostic?.historical_b2_baseline_readable ??
   publicDiagnostic?.site?.historical_b2_baseline_readable;
 if(!baseline || ["intelligence","global_risk","risk_indices"]
     .some(name=>baseline[name]!==true))
   blocking.push("HISTORICAL_B2_BASELINE_PROOF_UNREADABLE");
 if(!publicOk)blocking.push("PRODUCTION_PUBLIC_HEALTH_NOT_VERIFIED");
 return {
   schema:"geomacro.public-hot-recovery-handoff.v1",checked_at:now.toISOString(),
   production_health_verified:publicOk,metadata_audit_available:knownMeta,
   all_three_native_sources_current:PRODUCTS.every(p=>products[p].native_source_freshness_eligible),
   intelligence_machine_input_hint:hintState(machine.eligible),
   gri_independent_input_hint:hintState(gri.externally_approved_fresh_hint_valid),
   gri_missing_requirements:gri.missing_requirements,products,blocking,
   next_steps:[
     "Obtain real source-native current evidence and independent signed facts/rights approvals",
     "Pin immutable approved Intelligence and GRI input through the protected publishers",
     "Publish verified GRI then derive Risk Indices from its current verified D1 parent",
     "Prove exact B2 gzip/hash, D1 hot readback, live website SHA and HTTP 200"
   ],
   signed_proof_verified_by_this_report:false,publisher_dispatched:false,
   product_published:false,b2_gets:0,d1_reads:0,d1_writes:0,
   supabase_requests:0,payments:0,
 };
}
export function recoverySummary(r){
 const lines=["## P0 public hot-serving recovery handoff","",
  "**This report cannot mint signed data; real production HTTP 503 remains a failure.**","",
  "| Product | D1 state | Native original current | Source age min | Expires in min |",
  "|---|---|---|---:|---:|"];
 for(const name of PRODUCTS){
   const x=r.products[name];
   lines.push("| "+name+" | "+x.metadata_state+" | "+(x.native_source_freshness_eligible?"yes":"no")+
     " | "+(x.source_age_minutes??"n/a")+" | "+(x.expiry_in_minutes??"n/a")+" |");
 }
 lines.push("","Machine Intelligence approved pointer: "+r.intelligence_machine_input_hint,
  "GRI independently approved pointer: "+r.gri_independent_input_hint,"",
  ...r.blocking.map(x=>"- "+x),"",
  "Pointers are only scheduler hints; protected publishers must validate source-native dates, signatures, upstream rights, hash-bound B2/D1 and quota. Never retimestamp historical scores.");
 return lines.join("\n")+"\n";
}
function readDiagnostic(name){
 try{const raw=readFileSync("artifacts/public-serving/"+name,"utf8");
  if(raw.length>64000)throw Error("OVERSIZE");return JSON.parse(raw);
 }catch{return null;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const report=reconcilePublicHotRecovery({
    publicDiagnostic:readDiagnostic("diagnostic.json"),
    metadata:readDiagnostic("d1-metadata.json"),env:process.env});
  mkdirSync("artifacts/public-serving",{recursive:true});
  writeFileSync("artifacts/public-serving/recovery.json",JSON.stringify(report,null,2)+"\n",{mode:0o600});
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,recoverySummary(report));
  console.log(JSON.stringify({schema:report.schema,production_health_verified:report.production_health_verified,
    blocking:report.blocking,publisher_dispatched:false,b2_gets:0,payments:0}));
 }catch{console.error("::error::PUBLIC_HOT_RECOVERY_HANDOFF_NOT_VERIFIED");process.exitCode=2;}
}
