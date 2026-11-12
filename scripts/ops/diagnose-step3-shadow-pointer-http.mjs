#!/usr/bin/env node
/** Shadow-only read-only diagnostic for a failed authenticated Step3 pointer GET.
 * A diagnostic is NEVER a signed shadow rehearsal, B2 proof, or canary approval.
 * Exactly one bounded D1 SELECT and at most ten authenticated Worker GETs.
 * No original content, bearer, record ID, upstream body or secret in receipts.
 */
import {createHash} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const ACCOUNT="fddd57d28199bad07a768445e7237693";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const HOST="geomacro-step3-shadow.daspallab202391.workers.dev";
const HEX=/^[a-f0-9]{64}$/u;
const SAMPLE_MAX_AGE_HOURS=70; // Leave two hours before the 72h retention edge.
export function recentShadowPointerQuery(now=Date.now()){
 if(!Number.isFinite(now)||now<0)fail("QUERY_CLOCK_INVALID");
 const cutoff=new Date(now-SAMPLE_MAX_AGE_HOURS*3600000).toISOString();
 return "SELECT record_id,first_ingested_at FROM phase2h_raw_object_refs_v1 "+
  "INDEXED BY idx_phase2h_ref_ingest_clock_v1 "+
  "WHERE first_ingested_at >= '"+cutoff+"' "+
  "ORDER BY first_ingested_at DESC,record_id DESC LIMIT 11";
}
const fail=x=>{throw Error("STEP3_POINTER_DIAGNOSTIC_"+x)};
export function shadowPointerDiagnosticScope(env){
 if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA??"")||
    env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||
    env.D1_DATABASE_ID!==PROD||
    env.GEOMACRO_D1_SHADOW_DATABASE_ID!==SHADOW||
    env.D1_DATABASE_ID===env.GEOMACRO_D1_SHADOW_DATABASE_ID||
    env.GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST!==HOST||
    (env.CLOUDFLARE_API_TOKEN??"").length<20||
    (env.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN??"").length<32)
  fail("EXACT_MAIN_SHADOW_AND_CREDENTIAL_SCOPE_UNVERIFIED");
 return true;
}
const digest=s=>createHash("sha256").update(s).digest("hex");
const classification=(date,now)=>{
 if(typeof date!=="string"||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(date)||
    !Number.isFinite(Date.parse(date))||
    new Date(date).toISOString()!==date||
    Date.parse(date)>now+60000)fail("POINTER_DATE_INVALID");
 const delta=now-Date.parse(date);
 return {age_band:delta>72*3600000?"OVER_72H_RETENTION":"WITHIN_72H_RETENTION",
  age_hours:Math.max(0,Math.floor(delta/3600000))};
};
export async function inspectShadowPointerWorker({
 env=process.env,now=Date.now(),fetchImpl=fetch
}={}){
 const report={schema:"geomacro.step3.shadow-pointer-http-diagnostic.v1",
  status:"HOLD",code:"PROVIDER_UNCHECKED",source_sha:env.GITHUB_SHA??null,
  shadow_only:true,production_d1_mutations:0,shadow_d1_mutations:0,
  b2_requests:0,r2_rest_requests:0,payments:0,
  full_hmac_r2_b2_proof_claimed:false,stage2_authorized:false,
  source_ids_logged:false,requests:[],worker_gets:0,d1_rows_read:null,
  sample_window_hours:SAMPLE_MAX_AGE_HOURS,
  expired_historical_references_not_claimed_verified:true,
  old_pointer_retention_or_401_403_404_503_not_overridden:true};
 try{
  shadowPointerDiagnosticScope(env);
  if(!Number.isFinite(now)||now<0)fail("NOW_INVALID");
  const url="https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+
   "/d1/database/"+SHADOW+"/query";
  const r=await fetchImpl(url,{method:"POST",redirect:"error",
   cache:"no-store",headers:{Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN,
    "Content-Type":"application/json"},body:JSON.stringify({sql:recentShadowPointerQuery(now),params:[]}),
   signal:AbortSignal.timeout(15000)});
  if(r.status!==200||r.redirected)fail("CLOUDFLARE_QUERY_HTTP_UNVERIFIED");
  let d;try{d=await r.json()}catch{fail("CLOUDFLARE_QUERY_JSON_INVALID")}
  if(d?.success!==true||!Array.isArray(d.result)||d.result.length!==1||
     d.result[0].success!==true||!Array.isArray(d.result[0].results)||
     !Number.isSafeInteger(d.result[0].meta?.rows_read)||
     d.result[0].meta.rows_read>1000||
     d.result[0].meta.rows_written!==0)
   fail("CLOUDFLARE_D1_BOUNDED_READ_ONLY_UNVERIFIED");
  const rows=d.result[0].results;
  if(rows.length>10)fail("MORE_THAN_TEN_POINTERS_NOT_PROVEN");
  report.d1_rows_read=d.result[0].meta.rows_read;
  if(rows.length===0)fail("NO_FRESH_POINTER_IN_70H_INDEXED_WINDOW");
  for(const row of rows){
   if(!HEX.test(row.record_id??""))fail("POINTER_ID_INVALID");
   const age=classification(row.first_ingested_at,now);
   if(age.age_hours>=SAMPLE_MAX_AGE_HOURS||
      now-Date.parse(row.first_ingested_at)>SAMPLE_MAX_AGE_HOURS*3600000)
     fail("POINTER_OUTSIDE_FRESH_INDEXED_WINDOW");
   const workerUrl="https://"+HOST+
    "/v1/internal/phase2h-raw-object-ref?record_id="+row.record_id;
   let status="TRANSPORT_UNAVAILABLE";
   try{
    const observed=await fetchImpl(workerUrl,{method:"GET",redirect:"manual",
     cache:"no-store",headers:{Authorization:"Bearer "+
      env.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN,"Cache-Control":"no-store"},
     signal:AbortSignal.timeout(12000)});
    status=observed.redirected?"REDIRECT_REJECTED":
     Number.isSafeInteger(observed.status)&&observed.status>=100&&
      observed.status<=599?observed.status:"INVALID_STATUS";
   }catch{/* sanitized transport enum; no response read */}
   report.worker_gets++;
   report.requests.push({record_identity_sha256:digest(row.record_id),
    ...age,http_status:status});
  }
  report.status=report.requests.every(x=>x.http_status===200) ?
   "OBSERVATION_ONLY":"HOLD";
  report.code=report.status==="HOLD"?
   "NON_200_WORKER_POINTER_OBSERVED":"ALL_HTTP_200_NOT_CRYPTOGRAPHIC_PROOF";
 }catch(error){
  const code=String(error?.message??"");
  report.code=/^STEP3_POINTER_DIAGNOSTIC_[A-Z0-9_]+$/u.test(code)?
   code:"STEP3_POINTER_DIAGNOSTIC_PROVIDER_UNAVAILABLE";
 }finally{
  report.checked_at=new Date(now).toISOString();
 }
 return report;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const report=await inspectShadowPointerWorker();
 mkdirSync("artifacts/release",{recursive:true,mode:0o700});
 writeFileSync("artifacts/release/step3-shadow-pointer-http-diagnostic.json",
  JSON.stringify(report,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify({schema:report.schema,status:report.status,
  code:report.code,worker_gets:report.worker_gets,d1_rows_read:report.d1_rows_read,
  no_funds:true,stage2_authorized:false}));
 // This is diagnostic only: a non-200 is an observable HOLD.
 if(report.status==="HOLD")process.exitCode=2;
}
