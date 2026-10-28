/**
 * Read-only, private-source-neutral verification of actual GitHub main-run
 * D1 receipts. Extract ONLY whitelisted numeric/boolean fields from the
 * existing authenticated ingestion and replay job logs. Never return logs,
 * raw source JSON, URLs or private publisher information.
 */
const REPO="blocknine0/geomacro";
const API="https://api.github.com/repos/"+REPO;
const RUNS=API+"/actions/workflows/private-global-osint-15m.yml/runs?branch=main&per_page=10";
const MAX_LOG_BYTES=3_000_000,MAX_AGE_MS=90*60_000;
const okNumber=x=>Number.isSafeInteger(x)&&x>=0;
function unavailable(reason){return Object.freeze({
 critical:{independent_d1_readback_verified:false,reason},
 recovery:{verified_replayed_items:null,reason},
});}
async function ghJson(fetchImpl,url,token){
 const res=await fetchImpl(url,{method:"GET",redirect:"error",
  headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
   "X-GitHub-Api-Version":"2022-11-28"},signal:AbortSignal.timeout(12_000)});
 if(res.status!==200)throw Error("GITHUB_PROOF_PROVIDER_UNAVAILABLE");
 const doc=await res.json();
 if(!doc||typeof doc!=="object")throw Error("GITHUB_PROOF_PROVIDER_INVALID");
 return doc;
}
async function ghLog(fetchImpl,jobId,token){
 if(!okNumber(jobId)||jobId<1)throw Error("GITHUB_PROOF_JOB_ID_INVALID");
 // On cross-origin artifact redirects, Fetch strips the GitHub authorization.
 const res=await fetchImpl(API+"/actions/jobs/"+jobId+"/logs",{
  method:"GET",redirect:"follow",
  headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
   "X-GitHub-Api-Version":"2022-11-28"},signal:AbortSignal.timeout(15_000)});
 if(res.status!==200||Number(res.headers.get("content-length")??0)>MAX_LOG_BYTES)
  throw Error("GITHUB_PROOF_JOB_LOG_UNAVAILABLE");
 const body=await res.text();
 if(body.length>MAX_LOG_BYTES)throw Error("GITHUB_PROOF_JOB_LOG_OVERSIZE");
 return body;
}
function receiptFromLog(log,schema){
 const marker='{"schema":"'+schema+'"';
 const matching=log.split("\n").filter(s=>s.includes(marker));
 if(matching.length!==1)throw Error("GITHUB_PROOF_RECEIPT_MISSING_OR_DUPLICATED");
 const line=matching[0],start=line.indexOf(marker);
 if(start<0||line.length-start>1_500_000)
  throw Error("GITHUB_PROOF_RECEIPT_OVERSIZE");
 const candidate=line.slice(start).trim();
 let payload;
 try{payload=JSON.parse(candidate)}catch{throw Error("GITHUB_PROOF_RECEIPT_JSON_INVALID")}
 if(payload?.schema!==schema)throw Error("GITHUB_PROOF_RECEIPT_SCHEMA_INVALID");
 return payload;
}
export function validatePrivateD1Log(log){
 const r=receiptFromLog(log,"geomacro.private-osint-15m-durable-production-receipt.v1");
 if(r.d1_write_exact_readback_verified!==true||
  r.separate_private_d1_readback_verified!==true||
  r.private_three_category_bundle_readback_verified!==true||
  r.d1_usage_metadata_complete!==true||
  r.private_osint_d1_persisted!==true||
  !okNumber(r.news_rows_verified_in_d1)||
  !okNumber(r.excluded_by_d1_capacity)||
  r.excluded_by_d1_capacity!==0||
  !okNumber(r.d1_rows_read_for_write_batches)||
  !okNumber(r.d1_rows_written_for_write_batches))
  throw Error("GITHUB_PROOF_CRITICAL_D1_RECEIPT_INVALID");
 return Object.freeze({independent_d1_readback_verified:true,
  d1_rows_verified:r.news_rows_verified_in_d1,
  d1_rows_read_in_write_batches:r.d1_rows_read_for_write_batches,
  d1_rows_written_in_write_batches:r.d1_rows_written_for_write_batches,
  receipt_type:"AUTHENTICATED_MAIN_JOB_INDEPENDENT_D1_READBACK"});
}
export function validateReplayD1Log(log){
 const r=receiptFromLog(log,"geomacro.private-osint-spool-replay.v1");
 if(r.state==="NO_FRESH_ENCRYPTED_BACKLOG"&&
   r.d1_write_attempted===false&&okNumber(r.inventoried_artifacts))
  return Object.freeze({verified_replayed_items:0,
   replay_proof:"NO_FRESH_ENCRYPTED_BACKLOG"});
 if(r.all_backlog_artifacts_deleted_after_strict_receipt!==true||
    r.d1_exact_readback_verified!==true||
    r.d1_capacity_excluded!==0||
    !okNumber(r.d1_persisted)||r.d1_persisted<1||
    r.d1_persisted!==r.distinct_items_eligible||
    !okNumber(r.duplicate_items_suppressed))
   throw Error("GITHUB_PROOF_REPLAY_RECEIPT_INVALID");
 return Object.freeze({verified_replayed_items:r.d1_persisted,
  duplicate_items_suppressed:r.duplicate_items_suppressed,
  replay_proof:"D1_EXACT_READBACK_AND_DELETE_AFTER_RECEIPT"});
}
export async function verifyPrivateD1RunReceipts({
 env=process.env,fetchImpl=fetch,now=new Date()
}={}){
 const token=String(env.GH_TOKEN??env.GITHUB_TOKEN??""),
 expected=String(env.GITHUB_SHA??"");
 if(token.length<20||!/^[0-9a-f]{40}$/.test(expected))
  return unavailable("GITHUB_MAIN_LOG_AUTH_OR_SHA_UNVERIFIED");
 try{
  const runs=await ghJson(fetchImpl,RUNS,token);
  if(!Array.isArray(runs.workflow_runs)||runs.workflow_runs.length>10)
   throw Error("GITHUB_PROOF_RUN_LIST_INVALID");
  const selected=runs.workflow_runs.find(run=>
   run.head_branch==="main"&&run.head_sha===expected&&
   run.event!=="pull_request"&&run.conclusion==="success"&&
   run.status==="completed"&&okNumber(run.id)&&run.id>0&&
   typeof run.updated_at==="string"&&Number.isFinite(Date.parse(run.updated_at))&&
   Date.parse(run.updated_at)<=now.getTime()&&
   now.getTime()-Date.parse(run.updated_at)<=MAX_AGE_MS);
  if(!selected)return unavailable("NO_CURRENT_SUCCESSFUL_EXACT_SHA_PRIVATE_D1_RUN");
  const jobs=await ghJson(fetchImpl,API+"/actions/runs/"+selected.id+"/jobs?per_page=100",token);
  if(!Array.isArray(jobs.jobs)||jobs.jobs.length>100)
   throw Error("GITHUB_PROOF_JOB_LIST_INVALID");
  const ingestion=jobs.jobs.find(j=>j.name==="collect-private"&&
   j.conclusion==="success"&&j.status==="completed");
  if(!ingestion)return unavailable("NO_SUCCESSFUL_PRIVATE_D1_WRITE_READBACK_JOB");
  const critical=validatePrivateD1Log(await ghLog(fetchImpl,ingestion.id,token));
  const replay=jobs.jobs.find(j=>
   j.name==="Recover one encrypted held-source batch into verified canonical D1"&&
   j.conclusion==="success"&&j.status==="completed");
  const recovery=replay?
   validateReplayD1Log(await ghLog(fetchImpl,replay.id,token)):
   {verified_replayed_items:0,replay_proof:"REPLAY_JOB_NOT_EXECUTED"};
  return Object.freeze({critical,recovery,
   private_run_authenticated_gitHub_api:true,
   run_sha:expected,run_id:selected.id});
 }catch{
  return unavailable("GITHUB_PRIVATE_D1_OR_REPLAY_PROOF_UNAVAILABLE");
 }
}
