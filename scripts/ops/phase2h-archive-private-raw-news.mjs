#!/usr/bin/env node
/** Maintenance-only original metadata B2 archive. Protected D1 staging, never
 * public raw redistribution, never review/signing/payment. Each provider
 * request uses the shared atomic B2 D1 governor.
 */
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {deriveControlPlaneRootToken} from "./derive-control-plane-root-token.mjs";
import {createB2Client} from "./b2-s3-client.mjs";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";
import {verifyPhase2hB2Lifecycle} from "./phase2h-verify-b2-72h-lifecycle.mjs";
import {phase2hAtomicBulkArchiveAck,assertPhase2hBulkArchiveAckReturning,
 MAX_D1_BULK_ARCHIVE_ACK} from "../lib/phase2h-atomic-bulk-archive-ack.mjs";
import {pathToFileURL} from "node:url";
import {resolve,isAbsolute} from "node:path";
import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
const hex=x=>createHash("sha256").update(x).digest("hex");
const fail=x=>{throw Error("PHASE2H_RAW_B2_"+x)};
const categories=["geopolitics","macro","rare_earth"];
export function buildPhase2hRawB2Plan(rows,now=new Date()){
 if(!Array.isArray(rows)||rows.length<1||rows.length>300||!Number.isFinite(now.getTime()))
  fail("SOURCE_BATCH_INVALID");
 const seen=new Set(),counts=Object.fromEntries(categories.map(x=>[x,0]));
 for(const r of rows){
  if(!r||!/^[a-f0-9]{64}$/u.test(r.record_id)||seen.has(r.record_id)||
   !categories.includes(r.category)||!/^[a-f0-9]{64}$/u.test(r.raw_sha256)||
   r.schema!=="geomacro.phase2h.private-raw-observation.v1"||
   typeof r.ingested_at!=="string"||!/^20\d\d-\d\d-\d\dT/u.test(r.ingested_at)||
   !Number.isFinite(Date.parse(r.ingested_at))||
   Date.parse(r.ingested_at)>now.getTime()+60_000||

   r.commercial_rights_verified!==false||
   r.commercial_delivery_authorized!==false)
   fail("SOURCE_CONTENT_INVALID");
  seen.add(r.record_id);counts[r.category]++;
 }
 const sorted=[...rows].sort((a,b)=>a.record_id.localeCompare(b.record_id));
 const document={schema:"geomacro.phase2h.private-raw-b2-object.v1",
  record_count:sorted.length,category_counts:counts,rows:sorted,
  original_full_article_guaranteed:false,commercial_rights_verified:false,
  paid_eligible:false,source_original_clocks_preserved:true};
 const raw=Buffer.from(JSON.stringify(document),"utf8");
 if(raw.length>4_000_000)fail("RAW_SIZE_LIMIT");
 const compressed=gzipSync(raw,{level:6,mtime:0});
 const digest=hex(compressed),rawHash=hex(raw);
 const date=now.toISOString().slice(0,10).replaceAll("-","/");
 const key="geomacro-evidence/v1/private/phase2h-raw-news/"+date+"/"+digest+".json.gz";
 return {compressed,key,compressed_sha256:digest,uncompressed_sha256:rawHash,
  counts,record_count:sorted.length,rows:sorted};
}
export function verifyPhase2hRawB2Restore(bytes,plan){
 if(!Buffer.isBuffer(bytes)||!bytes.equals(plan.compressed)||
   hex(bytes)!==plan.compressed_sha256)fail("COMPRESSED_SHA_MISMATCH");
 let doc,raw;
 try{raw=gunzipSync(bytes,{maxOutputLength:4_000_000});doc=JSON.parse(raw.toString("utf8"))}
 catch{fail("GZIP_RESTORE_INVALID")}
 if(hex(raw)!==plan.uncompressed_sha256||
   doc.schema!=="geomacro.phase2h.private-raw-b2-object.v1"||
   doc.record_count!==plan.record_count||
   JSON.stringify(doc.rows)!==JSON.stringify(plan.rows)||
   JSON.stringify(doc.category_counts)!==JSON.stringify(plan.counts)||
   doc.commercial_rights_verified!==false||doc.paid_eligible!==false)
   fail("RESTORED_ORIGINAL_DIVERGED");
 return true;
}
/** B2 maintenance job already has provider-scoped D1 credentials.
 * Use those instead of expanding the root commerce/control-plane secret to
 * another production job. SQL is fixed and params bound, never caller SQL.
 */
/** Keyset reader selects bounded raw JSON using indexed immutable cursor.
 * The limit is code-validated (never client SQL); cursor is bound data.
 */
export function phase2hKeysetPendingPageSQL(limit,hasCursor=false){
 if(!Number.isSafeInteger(limit)||limit<1||limit>25||
    typeof hasCursor!=="boolean")fail("D1_PAGE_BOUNDS_INVALID");
 return "SELECT record_id,first_ingested_at,raw_json FROM phase2h_private_raw_news "+
  "WHERE b2_object_sha256 IS NULL "+
  (hasCursor?"AND (first_ingested_at>? OR (first_ingested_at=? AND record_id>?)) ":"")+
  "ORDER BY first_ingested_at,record_id LIMIT "+limit;
}
// Legacy helper retained for regression compatibility; production uses keyset.
export function phase2hBoundedPendingPageSQL(limit,offset){
 if(!Number.isSafeInteger(limit)||limit<1||limit>25||
    !Number.isSafeInteger(offset)||offset<0||offset>299||
    offset+limit>300)fail("D1_PAGE_BOUNDS_INVALID");
 return "SELECT raw_json FROM phase2h_private_raw_news WHERE "+
  "b2_object_sha256 IS NULL "+
  "ORDER BY first_ingested_at,record_id LIMIT "+limit+" OFFSET "+offset;
}
export function createPhase2hCanonicalD1({
 env=process.env,fetchImpl=fetch
}={}){
 const account=String(env.CLOUDFLARE_ACCOUNT_ID??"");
 const database=String(env.D1_DATABASE_ID??"");
 const token=String(env.CLOUDFLARE_API_TOKEN??"");
 if(!/^[0-9a-f]{32}$/u.test(account)||!/^[0-9a-f-]{36}$/iu.test(database)||
    token.length<20)fail("PROVIDER_D1_CREDENTIALS_REQUIRED");
 const endpoint="https://api.cloudflare.com/client/v4/accounts/"+account+
  "/d1/database/"+database+"/query";
 const sql=async(query,params=[])=>{
  const response=await fetchImpl(endpoint,{method:"POST",redirect:"error",
   headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
   // Cloudflare D1 REST /query expects params as string[], unlike Worker
   // D1 .bind(). Keep placeholders and never interpolate source SQL.
   // Numeric LIMIT/OFFSET bindings caused provider rejection (HTTP 400/7500);
   // the empty-params category census was unaffected.
   body:JSON.stringify({sql:query,params:params.map(value=>{
    if(typeof value==="string")return value;
    if(Number.isSafeInteger(value)&&value>=0)return String(value);
    fail("CANONICAL_D1_REST_BINDING_INVALID");
   })}),signal:AbortSignal.timeout(15000)});
  const doc=await response.json();
  if(!response.ok||doc.success!==true||!Array.isArray(doc.result)||
     doc.result.length!==1||doc.result[0]?.success===false||
     !Array.isArray(doc.result[0]?.results)){
   // Only numeric HTTP/provider codes reach Actions logs. Never log SQL,
   // private original JSON, request payload, access token or provider body.
   const upstream=doc?.errors?.[0]?.code;
   const safeCode=Number.isSafeInteger(upstream)&&upstream>=0&&upstream<=999999?
     upstream:"REDACTED";
   console.error("::warning::PHASE2H_RAW_D1_HTTP_"+response.status+"_CODE_"+safeCode);
   const error=Error("PHASE2H_RAW_B2_CANONICAL_D1_PROVIDER_REQUEST_FAILED");
   error.provider_http_status=response.status;
   error.provider_code=upstream;
   throw error;
  }
  return doc.result[0];
 };
 // Existing production-owned private Worker is an independently verified
 // D1 runtime adapter. This is only an emergency alternative to REST /query
 // 400/7500; public, PREDGE, payments and provider permissions are unchanged.
 const workerOrigin="https://geomacro-control-plane.daspallab202391.workers.dev";
 const internal=async(path,init={})=>{
  const protectedRoot=String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"");
  if(protectedRoot.length<32)fail("INTERNAL_FALLBACK_ROOT_UNAVAILABLE");
  const bearer=deriveControlPlaneRootToken(protectedRoot);
  const response=await fetchImpl(workerOrigin+path,{
   method:init.method??"GET",redirect:"error",
   headers:{Authorization:"Bearer "+bearer,
    ...(init.body?{"Content-Type":"application/json"}:{})},
   ...(init.body?{body:JSON.stringify(init.body)}:{}),
   signal:AbortSignal.timeout(15000),
  });
  if(!response.ok){
   // Only a fixed route class and an allowlisted machine error code may be
   // logged. Never log payloads, source URLs, original rows, SQL or tokens.
   const phase=init.method==="PUT"?"ACK":path.startsWith("/v1/internal/phase2h-raw-archive-export-v2")?"EXPORT_V2":"LEGACY_READ";
   let reason="REDACTED";
   try{
    const details=await response.json();
    if(typeof details?.error==="string"&&/^[A-Z][A-Z0-9_]{4,80}$/u.test(details.error))
     reason=details.error;
   }catch{}
   console.error("::warning::PHASE2H_RAW_B2_INTERNAL_"+phase+"_HTTP_"+response.status+"_CODE_"+reason);
   const failure=Error("PHASE2H_RAW_B2_INTERNAL_FALLBACK_D1_UNAVAILABLE");
   failure.upstream_status=response.status;
   throw failure;
  }
  let body;try{body=await response.json()}
  catch{fail("INTERNAL_FALLBACK_RESPONSE_INVALID")}
  if(body?.ok!==true)fail("INTERNAL_FALLBACK_RECEIPT_INVALID");
  return body;
 };
 const workerRead=async(limit,cursorClock,cursorId)=>{
  const q=new URLSearchParams({limit:String(limit)});
  if(cursorClock!==null){
   q.set("archive_cursor_clock",cursorClock);
   q.set("archive_cursor_id",cursorId);
  }
  const result=await internal("/v1/internal/phase2h-raw-news?"+q);
  if(result.schema!=="geomacro.phase2h.private-pending-archive.v1"||
     result.paid_eligible!==false||result.raw_public_delivery!==false||
     !Array.isArray(result.rows)||result.rows.length>limit)
    fail("INTERNAL_FALLBACK_READBACK_UNVERIFIED");
  return {results:result.rows.map(x=>({
   record_id:x.record_id,first_ingested_at:x.ingested_at,
   raw_json:JSON.stringify(x),
  }))};
 };
 // Exact admin-bound, indexed D1 single-SELECT scanner. Production uses
 // this BEFORE the legacy REST /query endpoint, whose 7500 failure currently
 // blocks even one original. Invalid D1 rows are counted but never archived.
 const workerReadV2=async(limit,cursorClock,cursorId)=>{
  const q=new URLSearchParams({limit:String(limit)});
  if(cursorClock!==null){
   q.set("archive_cursor_clock",cursorClock);
   q.set("archive_cursor_id",cursorId);
  }
  const result=await internal("/v1/internal/phase2h-raw-archive-export-v2?"+q);
  if(result.schema!=="geomacro.phase2h.private-raw-archive-export-v2.v1"||
     result.paid_eligible!==false||result.rights_verified!==false||
     result.raw_public_delivery!==false||result.payments!==0||
     result.provider_d1_single_select!==true||
     !Array.isArray(result.rows)||
     !Number.isSafeInteger(result.scanned_count)||
     !Number.isSafeInteger(result.rejected_unverified_or_expired_count)||
     result.scanned_count<0||result.scanned_count>limit||
     result.rows.length+result.rejected_unverified_or_expired_count!==
       result.scanned_count||
     result.scan_complete!==(result.scanned_count<limit))
   fail("BULK_WORKER_V2_RECEIPT_INVALID");
  if(result.scanned_count>0&&(
     typeof result.next_cursor_clock!=="string"||
     !Number.isFinite(Date.parse(result.next_cursor_clock))||
     !/^[a-f0-9]{64}$/u.test(result.next_cursor_id??"")))
   fail("BULK_WORKER_V2_CURSOR_INVALID");
  return {
   results:result.rows.map(row=>({
    record_id:row.record_id,first_ingested_at:row.ingested_at,
    raw_json:JSON.stringify(row)
   })),
   scanned_count:result.scanned_count,
   next_cursor_clock:result.next_cursor_clock,
   next_cursor_id:result.next_cursor_id,
   scan_complete:result.scan_complete
  };
 };
 const workerAck=async(items,objectSha)=>{
  let written=0;
  for(let i=0;i<items.length;i+=MAX_D1_BULK_ARCHIVE_ACK){
   const batch=items.slice(i,i+MAX_D1_BULK_ARCHIVE_ACK);
   const answer=await internal("/v1/internal/phase2h-raw-news",{
    method:"PUT",body:{schema:"geomacro.phase2h.b2-archive-ack.v1",
     object_sha256:objectSha,
     items:batch.map(r=>({record_id:r.record_id,raw_sha256:r.raw_sha256}))},
   });
   if(answer.archived!==batch.length||
      answer.independent_d1_archive_ack_verified!==true||
      answer.d1_atomic_one_statement_returning_verified!==true||
      answer.rights_verified!==false||answer.payments!==0)
     fail("INTERNAL_FALLBACK_ACK_UNVERIFIED");
   written+=batch.length;
  }
  return {archived:written,independent_d1_archive_ack_verified:true,
   d1_atomic_one_statement_returning_verified:true,
   d1_write_statements:Math.ceil(items.length/MAX_D1_BULK_ARCHIVE_ACK)};
 };
 return {
  async readPending(now=new Date(),{maxRows:requestedMax=300}={}){
   // 31 Oct owner policy: B2 archival-only reader must recover retained
   // original D1 history; general question/read routes still enforce 72h.
   if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
      !Number.isSafeInteger(requestedMax)||requestedMax<1||
      requestedMax>300)
    fail("CANONICAL_D1_ARCHIVE_CLOCK_INVALID");

   // 25-row bounded indexed keyset (same provider quota and 300-row cap).
   // No OFFSET instability after concurrent ACKs. Never invent timestamps,
   // advance cursor on failure, or duplicate original article bodies.
   const rows=[];
   const useBulkWorkerV2=env.PHASE2H_BULK_WORKER_ARCHIVE_V2==="1";
   let pageSize=25,maxRows=requestedMax,attempts=0,useInternal=false;
   let cursorClock=null,cursorId=null;
   while(rows.length<maxRows){
    if(++attempts>70)fail("D1_PAGE_REQUEST_BUDGET_EXCEEDED");
    let result;
    try{
     const hasCursor=cursorClock!==null;
     result=useBulkWorkerV2?
      await workerReadV2(Math.min(pageSize,maxRows-rows.length),cursorClock,cursorId):
      useInternal?
      await workerRead(Math.min(pageSize,maxRows-rows.length),cursorClock,cursorId):
      await sql(
       phase2hKeysetPendingPageSQL(
        Math.min(pageSize,maxRows-rows.length),hasCursor),
       hasCursor?[cursorClock,cursorClock,cursorId]:[]
      );
    }catch(error){
     if(useBulkWorkerV2&&error instanceof Error&&
       error.message==="PHASE2H_RAW_B2_INTERNAL_FALLBACK_D1_UNAVAILABLE"&&
       [429,500,502,503,504].includes(error.upstream_status)&&pageSize>1){
      pageSize=pageSize===25?10:pageSize===10?5:1;
      if(pageSize===1)maxRows=Math.min(maxRows,60);
      continue;
     }
     // Private Worker can temporarily reject a 25-row verified JSON batch
     // when a single Cloudflare isolate cannot complete the full readback.
     // Retry the SAME immutable keyset cursor with smaller bounded pages;
     // never advance a cursor or ACK an object on HTTP 429/503.
     if(useInternal&&error instanceof Error&&
        error.message==="PHASE2H_RAW_B2_INTERNAL_FALLBACK_D1_UNAVAILABLE"&&
        [429,500,502,503,504].includes(error.upstream_status)&&pageSize>1){
       pageSize=pageSize===25?10:pageSize===10?5:1;
       if(pageSize===1)maxRows=Math.min(maxRows,60);
       continue;
     }
     if(!useInternal&&error instanceof Error&&
        error.message==="PHASE2H_RAW_B2_CANONICAL_D1_PROVIDER_REQUEST_FAILED"){
      // Cloudflare D1 code 7500 at 25/10/5 rows can be a bound
      // response-size/SQLite statement issue. First retry 2 and then 1
      // WITHOUT changing the keyset cursor or spending a B2 request.
      // An actual authentication denial or other provider code is never
      // treated as a recoverable size constraint.
      if(error.provider_http_status===400&&error.provider_code===7500){
       if(pageSize>1){
        pageSize=pageSize===25?10:pageSize===10?5:
         pageSize===5?2:1;
        if(pageSize===5)maxRows=Math.min(maxRows,100);
        if(pageSize<=2)maxRows=Math.min(maxRows,60);
        continue;
       }
       useInternal=true;
       // Exact admin-only D1 binding remains last-resort fallback. Original
       // data and idempotent cursor stay unchanged on every failed attempt.
       pageSize=25;
       maxRows=requestedMax;
       continue;
      }
     }
     throw error;
    }
    // Keep the incoming keyset cursor separate from the last valid row.
    // V2's next cursor is the last SCANNED row, which may equal the last
    // accepted row; equality there is normal and must not be rejected.
    const priorCursorClock=cursorClock,priorCursorId=cursorId;
    const page=result.results;
    if(page.length>pageSize)fail("D1_PAGE_SIZE_INVALID");
    for(const item of page){
     if(typeof item.record_id!=="string"||
        !/^[a-f0-9]{64}$/u.test(item.record_id)||
        typeof item.first_ingested_at!=="string"||
        !Number.isFinite(Date.parse(item.first_ingested_at))||
        typeof item.raw_json!=="string"||item.raw_json.length>12000)
       fail("D1_ROW_INVALID");
     if(cursorClock!==null&&
        (item.first_ingested_at<cursorClock||
         item.first_ingested_at===cursorClock&&item.record_id<=cursorId))
       fail("D1_KEYSET_CURSOR_NOT_INCREASING");
     let original;
     try{original=JSON.parse(item.raw_json)}catch{fail("D1_JSON_INVALID")}
     if(original.record_id!==item.record_id||
        original.ingested_at!==item.first_ingested_at)
       fail("D1_INDEX_RAW_IDENTITY_MISMATCH");
     rows.push(original);
     cursorClock=item.first_ingested_at;
     cursorId=item.record_id;
    }
    if(useBulkWorkerV2){
     // Advance by LAST SCANNED D1 ID, including quarantined invalid rows.
     // A blank valid page must never stick at the same unarchiveable row.
     if(result.scanned_count>0){
      if(priorCursorClock!==null&&(
        result.next_cursor_clock<priorCursorClock||
        result.next_cursor_clock===priorCursorClock&&
        result.next_cursor_id<=priorCursorId))
       fail("BULK_WORKER_V2_NONADVANCING_CURSOR");
      // Last scanned may be the last valid row (equal cursor) or a later
      // quarantined row. It must never precede the last accepted original.
      if(cursorClock!==null&&(
        result.next_cursor_clock<cursorClock||
        result.next_cursor_clock===cursorClock&&
        result.next_cursor_id<cursorId))
       fail("BULK_WORKER_V2_CURSOR_BEFORE_VALID_ROW");
      cursorClock=result.next_cursor_clock;
      cursorId=result.next_cursor_id;
     }
     if(result.scan_complete)break;
    }else if(page.length<pageSize)break;
   }
   return rows;
  },
  async markArchived(items,objectSha,now){
   if(env.PHASE2H_BULK_WORKER_ARCHIVE_V2==="1")
    return workerAck(items,objectSha);
   // One atomic D1 UPDATE/RETURNING per up-to-48 record batch, never
   // per-original reads/writes. Protected Worker is the recovery channel
   // only on the exact provider HTTP400/7500 statement failure.
   let archived=0;
   for(let offset=0;offset<items.length;offset+=MAX_D1_BULK_ARCHIVE_ACK){
    const rows=items.slice(offset,offset+MAX_D1_BULK_ARCHIVE_ACK);
    const plan=phase2hAtomicBulkArchiveAck(rows,objectSha,now);
    try{
     const result=await sql(plan.sql,plan.params);
     assertPhase2hBulkArchiveAckReturning(result,rows,objectSha);
    }catch(error){
     if(error?.provider_http_status===400&&error?.provider_code===7500){
      const receipt=await workerAck(rows,objectSha);
      if(receipt.archived!==rows.length||
         receipt.d1_atomic_one_statement_returning_verified!==true)
       fail("WORKER_ATOMIC_ACK_UNVERIFIED");
     }else throw error;
    }
    archived+=rows.length;
   }
   if(archived!==items.length)fail("D1_ARCHIVE_BATCH_ACK_INCOMPLETE");
   return {archived,independent_d1_archive_ack_verified:true,
    d1_atomic_one_statement_returning_verified:true,
    d1_write_statements:Math.ceil(items.length/MAX_D1_BULK_ARCHIVE_ACK)};
  }
 };
}
/** Only four canonical six-hour GitHub cron events; no manual/push bypass.
 * Delayed scheduled jobs retain their trusted event identity. All D1 and
 * B2 shared quota/governor rules remain in force without exceptions.
 */
export function phase2hAuthorizedArchiveWindow({
 env=process.env,now=new Date(),eventReader=readFileSync,
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))return false;
 if(env.GITHUB_WORKFLOW_REF!==
      "blocknine0/geomacro/.github/workflows/phase2h-private-raw-archive.yml@refs/heads/main"||
    !["schedule","workflow_run"].includes(env.GITHUB_EVENT_NAME))
   return false;
 const path=String(env.GITHUB_EVENT_PATH??"");
 if(!isAbsolute(path)||!path.endsWith("/event.json")||path.length>512)
   return false;
 try{
  const event=JSON.parse(eventReader(path,"utf8"));
  if(env.GITHUB_EVENT_NAME==="schedule")
   return event?.schedule==="29 0,6,12,18 * * *";
  // Exact-main, successful D1 Worker production deployment is a second
  // admission opportunity after archive-code releases. The provider D1/B2
  // quota gates still run first. PR, manual, fork or outdated SHA cannot
  // invoke this production archival writer.
  const deployed=event?.workflow_run;
  return event?.action==="completed"&&
   event?.repository?.full_name==="blocknine0/geomacro"&&
   deployed?.name==="Deploy D1 Control Plane"&&
   deployed?.event==="push"&&deployed?.conclusion==="success"&&
   deployed?.head_branch==="main"&&
   deployed?.head_repository?.full_name==="blocknine0/geomacro"&&
   /^[a-f0-9]{40}$/u.test(env.GITHUB_SHA??"")&&
   deployed?.head_sha===env.GITHUB_SHA;
 }catch{return false}
}
/** Exact schedule and trusted-main-only identity for the separate historical
 * retry lane. It never changes live news freshness or customer research.
 */
export function phase2hAuthorizedHistoricalRecoveryWindow({
 env=process.env,eventReader=readFileSync
}={}){
 if(env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    env.GITHUB_EVENT_NAME!=="schedule"||
    env.GITHUB_WORKFLOW_REF!==
     "blocknine0/geomacro/.github/workflows/phase2h-historical-recovery-10m.yml@refs/heads/main")
   return false;
 const path=String(env.GITHUB_EVENT_PATH??"");
 if(!isAbsolute(path)||!path.endsWith("/event.json")||path.length>512)
  return false;
 try{return JSON.parse(eventReader(path,"utf8"))?.schedule==="*/10 * * * *";}
 catch{return false;}
}

export async function runPhase2hGovernedRawB2({
 env=process.env,now=new Date(),fetchImpl=fetch,
 b2Factory=createB2Client,governorFactory=createB2D1AccountGovernor,
 d1Factory=createPhase2hCanonicalD1,
 lifecycleVerifier=verifyPhase2hB2Lifecycle,
 eventReader=readFileSync,windowAuthorizer=phase2hAuthorizedArchiveWindow,
}={}){
 if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
  env.GITHUB_REF!=="refs/heads/main"||
  env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
  env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="derived_news_backup"||
  env.B2_REQUEST_BUDGET!=="12"||
  env.PHASE2H_PROVIDER_MAINTENANCE!=="true"||
  !/^\d{1,20}$/u.test(env.GITHUB_RUN_ID??""))
  fail("PROTECTED_MAIN_GOVERNOR_REQUIRED");
 // Only canonical six-hour schedule; backlog may exceed a single slot.
 // Manual-only storage deletion remains independent.
 const historicalRecovery=env.PHASE2H_HISTORICAL_RECOVERY==="1";
 if(historicalRecovery?
    !phase2hAuthorizedHistoricalRecoveryWindow({env,eventReader}):
    !windowAuthorizer({env,now,eventReader}))
  return {status:"SKIPPED_OUTSIDE_EXISTING_ARCHIVE_SLOT",storage_confirmed:false,
   rows_archived:0,object_sha256:null};
 const governor=governorFactory({env,fetchImpl});
 const q=await governor.status(),u=q?.used,l=q?.limits;
 if(q?.ok!==true||!u||!l)fail("PROVIDER_GOVERNOR_UNAVAILABLE");
 if(u.total>l.total-11||u.GET>l.GET-5||u.PUT>l.PUT-6||
    u.NATIVE_AUTH>l.NATIVE_AUTH-2)
   return {status:"B2_ACCOUNT_HEADROOM_HELD",storage_confirmed:false,
    rows_archived:0,object_sha256:null};
 const d1=d1Factory({env,fetchImpl});
 const initialRows=await d1.readPending(now,{maxRows:historicalRecovery?200:300});
 if(!Array.isArray(initialRows)||initialRows.length>(historicalRecovery?200:300))
   fail("PRIVATE_SOURCE_CONTRACT_INVALID");
 if(!initialRows.length)
  return {status:"NO_PENDING_PRIVATE_RAW_ROWS",storage_confirmed:true,
   rows_archived:0,object_sha256:null,all_backlog_cleared:true};
 // Enforce provider lifecycle on EVERY caller, not only on a single workflow.
 // Lifecycle metadata reads plus one full-body GET use the SAME atomic B2 quota governor.
 // No B2 original-news PUT while provider-side automatic deletion remains enabled.
 let lifecycle;
 try{lifecycle=await lifecycleVerifier({env,fetchImpl,governor});}
 catch{fail("LIFECYCLE_NOT_VERIFIED")}
 if(lifecycle?.phase2h_raw_prefix_verified!==true||
    lifecycle?.auto_deletion_paused!==true||
    lifecycle?.no_bucket_mutation!==true)
  fail("LIFECYCLE_NOT_VERIFIED");
 const plan=buildPhase2hRawB2Plan(initialRows,now);
 const b2=b2Factory({endpointUrl:"https://s3.us-east-005.backblazeb2.com",
  bucket:"geomacro-private-archive",accessKey:env.B2_KEY_ID,
  secretKey:env.B2_APPLICATION_KEY,
  readAccessKey:env.B2_ARCHIVE_READ_KEY_ID,
  readSecretKey:env.B2_ARCHIVE_READ_APPLICATION_KEY});
 const first=await b2.putWithMetadataVerification(plan.key,plan.compressed,{
  verifyRestored:bytes=>verifyPhase2hRawB2Restore(Buffer.from(bytes),plan)
 });
 if(first?.full_body_readback_verified!==true||
   first.sha256!==plan.compressed_sha256||first.bytes!==plan.compressed.length)
   fail("FIRST_GET_OR_PUT_UNVERIFIED");
 // Read original raw_json exactly once per batch. The following D1
 // acknowledgement checks record_id/raw_sha256 before and after the
 // metadata write, without loading the source payload again.
 const ack=await d1.markArchived(plan.rows,plan.compressed_sha256,now);
 if(ack.archived!==plan.record_count||
    ack.independent_d1_archive_ack_verified!==true)
  fail("ARCHIVE_ACK_NOT_CANONICAL");
 const receipt={schema:"geomacro.phase2h.private-raw-b2-acceptance.v1",
  status:"B2_ONE_PUT_ONE_GET_SHA_AND_D1_VERIFIED",
  storage_confirmed:true,rows_archived:plan.record_count,
   historical_expired_originals_archived:plan.rows.filter(r=>
    now.getTime()-Date.parse(r.ingested_at)>=72*60*60_000).length,
  category_counts:plan.counts,object_sha256:plan.compressed_sha256,
  object_key:plan.key,private_raw_includes_original_full_article:false,
  backlog_may_remain:initialRows.length===(historicalRecovery?200:300),
  historical_recovery_lane:historicalRecovery,
  b2_automatic_deletion_paused_provider_verified:true,
  b2_first_get_verified:true,b2_second_get_performed:false,
  post_archive_d1_verified:true,
  d1_atomic_one_statement_returning_verified:ack.d1_atomic_one_statement_returning_verified===true,
  d1_archive_ack_write_statements:ack.d1_write_statements,
  b2_gets_per_bulk_object:1,b2_puts_per_bulk_object:1,
  original_clocks_unchanged:true,
  rights_verified:false,paid_eligible:false,payments:0};
 // This strict ephemeral in-process evidence was selected from canonical
 // D1 and authenticated against B2 full-body GET. Never JSON-serialize or
 // upload the private originals; consumer uses it for metadata-only D1
 // bulk verification, avoiding a second multi-megabyte raw-json SELECT.
 Object.defineProperty(receipt,"verified_original_records",{
  value:plan.rows,enumerable:false,writable:false,configurable:false
 });
 return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const r=await runPhase2hGovernedRawB2();
  // This receipt is intentionally metadata-only; no source URLs/headlines.
  const {object_key,...safe}=r;
  // Counts and object SHA only; no raw article, ID, URL or title.
  mkdirSync("artifacts/derived-news",{recursive:true,mode:0o700});
  writeFileSync("artifacts/derived-news/phase2h-private-raw-b2-verified.json",
   JSON.stringify(safe)+"\n",{mode:0o600});
  console.log(JSON.stringify(safe));
  if(!r.storage_confirmed)process.exitCode=3;
 }catch(e){
  const code=String(e?.message??"");
  console.error("::error::"+(/^PHASE2H_RAW_B2_[A-Z0-9_]+$/u.test(code)?code:
    "PHASE2H_RAW_B2_ARCHIVE_NOT_VERIFIED"));
  process.exitCode=3;
 }
}