#!/usr/bin/env node
/** Maintenance-only original metadata B2 archive. Protected D1 staging, never
 * public raw redistribution, never review/signing/payment. Each provider
 * request uses the shared atomic B2 D1 governor.
 */
import {createHash} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {createB2Client} from "./b2-s3-client.mjs";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";
import {verifyPhase2hB2Lifecycle} from "./phase2h-verify-b2-72h-lifecycle.mjs";
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
   fail("CANONICAL_D1_PROVIDER_REQUEST_FAILED");
  }
  return doc.result[0];
 };
 return {
  async readPending(){
   // A single 300-row raw_json D1 API response can exceed Cloudflare provider
   // response-size limits even when the preceding COUNT(*) census succeeds.
   // Read at most 300 pending originals in bounded, index-ordered pages.
   // OFFSET stays stable here: no metadata mutation occurs until ALL rows are
   // read and independently verified by B2. Never double-read a raw body.
   const rows=[];
   let pageSize=25,maxRows=300,attempts=0;
   while(rows.length<maxRows){
    if(++attempts>42)fail("D1_PAGE_REQUEST_BUDGET_EXCEEDED");
    let result;
    try{
     result=await sql(
      "SELECT raw_json FROM phase2h_private_raw_news WHERE b2_object_sha256 IS NULL ORDER BY first_ingested_at,record_id LIMIT ? OFFSET ?",
      [Math.min(pageSize,maxRows-rows.length),rows.length]
     );
    }catch(error){
     // At most one downgrade to 10 rows. The unchanged quota governor still
     // controls the archive; this never overrides provider admission.
     if(error instanceof Error&&
        error.message==="PHASE2H_RAW_B2_CANONICAL_D1_PROVIDER_REQUEST_FAILED"&&
        (pageSize===25||pageSize===10)){
      // A provider returning a response-size limit to BOTH 25- and 10-row
      // raw JSON batches gets a final 5-row option. Restrict the whole B2
      // batch to 100 originals so the fixed 42 D1-query budget holds.
      // No additional B2 PUT, permission change, raw copy or paid action.
      pageSize=pageSize===25?10:5;
      if(pageSize===5)maxRows=100;
      continue;
     }
     throw error;
    }
    const page=result.results;
    if(page.length>pageSize)fail("D1_PAGE_SIZE_INVALID");
    for(const item of page){
     if(typeof item.raw_json!=="string"||item.raw_json.length>12000)
      fail("D1_ROW_INVALID");
     try{rows.push(JSON.parse(item.raw_json))}
     catch{fail("D1_JSON_INVALID")}
    }
    if(page.length<pageSize)break;
   }
   return rows;
  },
  async markArchived(items,objectSha,now){
   const ids=items.map(x=>x.record_id);
   const holders=ids.map(()=>"?").join(",");
   const check=await sql("SELECT record_id,raw_sha256,b2_object_sha256 FROM phase2h_private_raw_news WHERE record_id IN ("+holders+")",ids);
   const before=new Map(check.results.map(x=>[x.record_id,x]));
   if(before.size!==ids.length||items.some(x=>
      before.get(x.record_id)?.raw_sha256!==x.raw_sha256||
      before.get(x.record_id)?.b2_object_sha256!==null))
    fail("D1_PRE_ARCHIVE_RECORD_DIVERGED");
   const updated=await sql("UPDATE phase2h_private_raw_news SET b2_object_sha256=?,b2_archived_at=? WHERE b2_object_sha256 IS NULL AND record_id IN ("+holders+")",
     [objectSha,now.toISOString(),...ids]);
   if(updated.meta?.changes!==ids.length)
    fail("D1_ARCHIVE_METADATA_WRITE_NOT_EXACT");
   const verified=await sql("SELECT record_id,raw_sha256,b2_object_sha256 FROM phase2h_private_raw_news WHERE record_id IN ("+holders+")",ids);
   if(verified.results.length!==ids.length||verified.results.some(x=>
    before.get(x.record_id)?.raw_sha256!==x.raw_sha256||
    x.b2_object_sha256!==objectSha))
    fail("D1_POST_ARCHIVE_METADATA_READBACK_MISMATCH");
   return {archived:ids.length,independent_d1_archive_ack_verified:true};
  },
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
 if(env.GITHUB_EVENT_NAME!=="schedule"||
    env.GITHUB_WORKFLOW_REF!==
      "blocknine0/geomacro/.github/workflows/phase2h-private-raw-archive.yml@refs/heads/main")
   return false;
 const path=String(env.GITHUB_EVENT_PATH??"");
 if(!isAbsolute(path)||!path.endsWith("/event.json")||path.length>512)
   return false;
 try{
  const event=JSON.parse(eventReader(path,"utf8"));
  return event?.schedule==="29 0,6,12,18 * * *";
 }catch{return false}
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
 if(!windowAuthorizer({env,now,eventReader}))
  return {status:"SKIPPED_OUTSIDE_EXISTING_ARCHIVE_SLOT",storage_confirmed:false,
   rows_archived:0,object_sha256:null};
 const governor=governorFactory({env,fetchImpl});
 const q=await governor.status(),u=q?.used,l=q?.limits;
 if(q?.ok!==true||!u||!l)fail("PROVIDER_GOVERNOR_UNAVAILABLE");
 if(u.total>l.total-13||u.GET>l.GET-7||u.PUT>l.PUT-6||
    u.NATIVE_AUTH>l.NATIVE_AUTH-2)
   return {status:"B2_ACCOUNT_HEADROOM_HELD",storage_confirmed:false,
    rows_archived:0,object_sha256:null};
 const d1=d1Factory({env,fetchImpl});
 const initialRows=await d1.readPending();
 if(!Array.isArray(initialRows)||initialRows.length>300)
   fail("PRIVATE_SOURCE_CONTRACT_INVALID");
 if(!initialRows.length)
  return {status:"NO_PENDING_PRIVATE_RAW_ROWS",storage_confirmed:true,
   rows_archived:0,object_sha256:null,all_backlog_cleared:true};
 // Enforce provider lifecycle on EVERY caller, not only on a single workflow.
 // Two native read-only operations use the SAME global atomic B2 governor.
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
 const independentSecond=await b2.get(plan.key);
 verifyPhase2hRawB2Restore(Buffer.from(independentSecond),plan);
 // Read original raw_json exactly once per batch. The following D1
 // acknowledgement checks record_id/raw_sha256 before and after the
 // metadata write, without loading the source payload again.
 const ack=await d1.markArchived(plan.rows,plan.compressed_sha256,now);
 if(ack.archived!==plan.record_count||
    ack.independent_d1_archive_ack_verified!==true)
  fail("ARCHIVE_ACK_NOT_CANONICAL");
 return {schema:"geomacro.phase2h.private-raw-b2-acceptance.v1",
  status:"B2_PUT_TWO_INDEPENDENT_GET_SHA_AND_D1_VERIFIED",
  storage_confirmed:true,rows_archived:plan.record_count,
  category_counts:plan.counts,object_sha256:plan.compressed_sha256,
  object_key:plan.key,private_raw_includes_original_full_article:false,
  backlog_may_remain:initialRows.length===300,
  b2_automatic_deletion_paused_provider_verified:true,
  b2_first_get_verified:true,b2_second_independent_get_verified:true,
  post_archive_d1_verified:true,original_clocks_unchanged:true,
  rights_verified:false,paid_eligible:false,payments:0};
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