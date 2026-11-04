#!/usr/bin/env node
/** Governed, repeatable Phase 2H production acceptance.
 * Never produces a PASS for an unarchived record or a synthetic B2 response.
 * Internal-only: excludes original titles, URLs and credentials from receipts.
 */
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {mkdirSync,writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {createB2Client} from "./b2-s3-client.mjs";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";
import {runPhase2hGovernedRawB2} from "./phase2h-archive-private-raw-news.mjs";
import {verifyPhase2hProductionQuestionChain} from "./phase2h-verify-private-question-delivery.mjs";
const PREFIX="geomacro-evidence/v1/private/phase2h-raw-news/";
const SHA=/^[a-f0-9]{64}$/u;
const hash=x=>createHash("sha256").update(x).digest("hex");
const fail=x=>{throw Error("PHASE2H_PERMANENT_"+x)};
const SUMMARY="artifacts/derived-news/phase2h-permanent-production-acceptance.json";
function writeSummary(s){
 mkdirSync("artifacts/derived-news",{recursive:true,mode:0o700});
 writeFileSync(SUMMARY,JSON.stringify(s)+"\n",{mode:0o600});
}
function protectedEnv(env){
 if(env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="derived_news_backup"||
    env.B2_REQUEST_BUDGET!=="12"||
    env.PHASE2H_PROVIDER_MAINTENANCE!=="true"||
    !/^\d{1,20}$/u.test(env.GITHUB_RUN_ID??"")||
    !/^[a-f0-9]{32}$/u.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
    !/^[a-f0-9-]{36}$/iu.test(env.D1_DATABASE_ID??"")||
    (env.CLOUDFLARE_API_TOKEN??"").length<20||
    (env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").length<32)
  fail("PROTECTED_MAIN_GOVERNED_CONFIG_REQUIRED");
}
/** Count only canonical D1 metadata, never expose private originals or IDs. */
export async function readPhase2hCanonicalCensus({env=process.env,fetchImpl=fetch}={}){
 protectedEnv(env);
 const endpoint="https://api.cloudflare.com/client/v4/accounts/"+
  env.CLOUDFLARE_ACCOUNT_ID+"/d1/database/"+env.D1_DATABASE_ID+"/query";
 // One fixed SQL SELECT counts archived, eligible pending and expired pending.
 // UTC SQLite clocks avoid the Cloudflare REST 400/7500 date bind regression.
 const cutoff="strftime('%Y-%m-%dT%H:%M:%fZ','now','-72 hours')";
 const sql="SELECT category,COUNT(*) AS staged,"+
  "SUM(CASE WHEN b2_object_sha256 IS NULL THEN 1 ELSE 0 END) AS pending,"+
  "SUM(CASE WHEN b2_object_sha256 IS NOT NULL THEN 1 ELSE 0 END) AS archived,"+
  "SUM(CASE WHEN b2_object_sha256 IS NULL AND first_ingested_at>"+cutoff+
  " THEN 1 ELSE 0 END) AS pending_eligible_72h,"+
  "SUM(CASE WHEN b2_object_sha256 IS NULL AND first_ingested_at<="+cutoff+
  " THEN 1 ELSE 0 END) AS pending_expired_72h "+
  "FROM phase2h_private_raw_news GROUP BY category";
 const response=await fetchImpl(endpoint,{method:"POST",redirect:"error",
  headers:{Authorization:"Bearer "+env.CLOUDFLARE_API_TOKEN,
   "Content-Type":"application/json"},
  body:JSON.stringify({sql,params:[]}),signal:AbortSignal.timeout(15000)});
 const data=await response.json(),rows=data?.result?.[0]?.results;
 if(!response.ok||data?.success!==true||!Array.isArray(rows)||
    rows.length>3||data.result?.[0]?.success===false)
  fail("CANONICAL_D1_CENSUS_UNAVAILABLE");
 const empty=()=>({staged:0,archived:0,pending:0,
  pending_eligible_72h:0,pending_expired_72h:0});
 const counts={geopolitics:empty(),macro:empty(),rare_earth:empty()};
 const seen=new Set();
 for(const row of rows){
  if(!Object.hasOwn(counts,row.category)||seen.has(row.category)||
    !["staged","archived","pending","pending_eligible_72h","pending_expired_72h"].every(k=>Number.isSafeInteger(row[k])&&row[k]>=0)||
    row.staged!==row.archived+row.pending||
    row.pending!==row.pending_eligible_72h+row.pending_expired_72h)
   fail("CANONICAL_D1_CENSUS_INVALID");
  seen.add(row.category);
  counts[row.category]={staged:row.staged,archived:row.archived,pending:row.pending,
   pending_eligible_72h:row.pending_eligible_72h,
   pending_expired_72h:row.pending_expired_72h};
 }
 const sum=k=>Object.values(counts).reduce((n,r)=>n+r[k],0);
 return {category_counts:counts,staged_total:sum("staged"),
  archived_total:sum("archived"),pending_total:sum("pending"),
  pending_eligible_72h_total:sum("pending_eligible_72h"),
  pending_expired_72h_total:sum("pending_expired_72h")};
}

// Optional independent deep verification, NOT used by idle incremental
// runs. Never repeatedly download historical B2 objects just to keep a
// scheduled workflow green.
export async function verifyPhase2hExistingArchive({
 env=process.env,fetchImpl=fetch,now=new Date(),
 b2Factory=createB2Client,governorFactory=createB2D1AccountGovernor,
 questionVerifier=verifyPhase2hProductionQuestionChain
}={}){
 protectedEnv(env);
 const endpoint="https://api.cloudflare.com/client/v4/accounts/"+
   env.CLOUDFLARE_ACCOUNT_ID+"/d1/database/"+env.D1_DATABASE_ID+"/query";
 const resp=await fetchImpl(endpoint,{method:"POST",redirect:"error",
   headers:{"Authorization":"Bearer "+env.CLOUDFLARE_API_TOKEN,
    "Content-Type":"application/json"},
   body:JSON.stringify({sql:"SELECT b2_object_sha256,b2_archived_at FROM phase2h_private_raw_news WHERE b2_object_sha256 IS NOT NULL ORDER BY b2_archived_at DESC LIMIT 1",params:[]}),
   signal:AbortSignal.timeout(15000)});
 const body=await resp.json();
 const rows=body?.result?.[0]?.results;
 if(!resp.ok||body.success!==true||!Array.isArray(rows)||rows.length!==1)
  fail("EXISTING_D1_ARCHIVE_UNAVAILABLE");
 const last=rows[0];
 if(!SHA.test(last.b2_object_sha256)||typeof last.b2_archived_at!=="string"||
    !/^20\d{2}-\d\d-\d\dT/.test(last.b2_archived_at)||
    !Number.isFinite(Date.parse(last.b2_archived_at))||
    Date.parse(last.b2_archived_at)>now.getTime()+60_000)
  fail("EXISTING_OBJECT_IDENTITY_INVALID");
 const governor=governorFactory({env,fetchImpl});
 const quota=await governor.status();
 // One GET with reserve for possible S3 read fallback; no B2 request on
 // exhausted account quotas. The underlying client reserves each attempt.
 if(quota?.ok!==true||!quota.used||!quota.limits||
    quota.used.total>quota.limits.total-6||
    quota.used.GET>quota.limits.GET-3||
    quota.used.NATIVE_AUTH>quota.limits.NATIVE_AUTH-2)
  fail("EXISTING_B2_HEADROOM_UNAVAILABLE");
 const date=last.b2_archived_at.slice(0,10).replaceAll("-","/");
 const key=PREFIX+date+"/"+last.b2_object_sha256+".json.gz";
 const b2=b2Factory({endpointUrl:"https://s3.us-east-005.backblazeb2.com",
  bucket:"geomacro-private-archive",accessKey:env.B2_KEY_ID,
  secretKey:env.B2_APPLICATION_KEY,
  readAccessKey:env.B2_ARCHIVE_READ_KEY_ID,
  readSecretKey:env.B2_ARCHIVE_READ_APPLICATION_KEY});
 const a=Buffer.from(await b2.get(key));
 if(hash(a)!==last.b2_object_sha256)
  fail("EXISTING_ONE_GET_HASH_MISMATCH");
 let doc;
 try{doc=JSON.parse(gunzipSync(a,{maxOutputLength:4_000_000}).toString("utf8"))}
 catch{fail("EXISTING_GZIP_INVALID")}
 if(doc?.schema!=="geomacro.phase2h.private-raw-b2-object.v1"||
    !Number.isSafeInteger(doc.record_count)||doc.record_count<1||
    doc.record_count>300||doc.rows?.length!==doc.record_count||
    !doc.category_counts)
  fail("EXISTING_RESTORED_B2_OBJECT_INVALID");
 const receipt={schema:"geomacro.phase2h.private-raw-b2-acceptance.v1",
   status:"B2_HISTORICAL_ONE_GET_SHA_D1_ACK_REVERIFIED",
   storage_confirmed:true,rows_archived:doc.record_count,
   category_counts:doc.category_counts,object_sha256:last.b2_object_sha256,
   b2_first_get_verified:true,b2_second_get_performed:false,
   d1_atomic_one_statement_returning_verified:false,
   post_archive_d1_verified:true};
 const proof=await questionVerifier({env,fetchImpl,now:now.getTime(),receipt,
   expectedArchivedRows:doc.rows});
 return {...proof,existing_archived_object_one_get_restored:true,existing_object_sha256:last.b2_object_sha256};
}
export async function runPhase2hPermanentAcceptance({
 env=process.env,now=new Date(),
 archive=runPhase2hGovernedRawB2,
 verify=verifyPhase2hProductionQuestionChain,
 verifyExisting=verifyPhase2hExistingArchive,
 readCensus=readPhase2hCanonicalCensus
}={}){
 protectedEnv(env);
 const receipts=[],proofs=[];
 // Two bounded B2 objects: 600 records per admitted run at most.
 // More remaining records are NOT falsely counted as complete.
 for(let i=0;i<2;i++){
  const receipt=await archive({env,now});
  if(receipt?.storage_confirmed!==true)
   fail("B2_ARCHIVE_HELD_OR_FAILED");
  if(receipt.rows_archived===0){
   if(i===0){
    // No B2 GET or historical census on empty incremental slots. This
    // receipt is *not* an object verification or corpus acceptance.
    const idle={schema:"geomacro.phase2h.permanent-raw-b2-production-acceptance.v1",
     status:"IDLE_NO_PENDING_RAW_ROWS_NO_ARCHIVE_PROOF",
     verified_at:now.toISOString(),production_main_sha:env.GITHUB_SHA??null,
     archived_batches_this_run:0,archived_records_this_run:0,
     actual_b2_readback_verified:false,incremental_batch_proof_pass:false,
     entire_admitted_raw_backlog_verified:false,
     all_historical_b2_objects_independently_refetched_this_run:false,
     canonical_d1_category_census:null,source_pending_read_verified:true,
     commercial_rights_verified:false,payments:0};
    writeSummary(idle);
    return idle;
   }
   break;
  }
  if(receipt.schema!=="geomacro.phase2h.private-raw-b2-acceptance.v1"||
     !SHA.test(receipt.object_sha256)||receipt.rows_archived>300||
     receipt.b2_first_get_verified!==true||
     receipt.b2_second_get_performed!==false||
     receipt.d1_atomic_one_statement_returning_verified!==true||
     receipt.post_archive_d1_verified!==true)
   fail("B2_POSITIVE_RECEIPT_INCOMPLETE");
  const proof=await verify({env,now:now.getTime(),receipt,
   expectedArchivedRows:receipt.verified_original_records??null});
  // Raw archival must remain available when the original source cannot
  // support an evidence-grounded five-part answer. Only D1/B2 provenance
  // and immutable ID/hash checks are mandatory for the raw archive lane.
  if(proof.same_b2_object_and_d1_original!==true||
     proof.b2_one_get_sha_verified_in_preceding_step!==true)
   fail("RAW_ARCHIVE_INTEGRITY_UNVERIFIED");
  receipts.push(receipt);proofs.push(proof);
  if(proof.unarchived_backlog_present===false)break;
 }
 if(!proofs.length)fail("NO_TRUE_POSITIVE_EVIDENCE");
 const census=await readCensus({env});
 if(!census||!Number.isSafeInteger(census.staged_total)||
    !Number.isSafeInteger(census.archived_total)||
    !Number.isSafeInteger(census.pending_total)||
    census.staged_total!==census.archived_total+census.pending_total)
  fail("CANONICAL_D1_CENSUS_NOT_VERIFIED");
 // Full Phase2H requires positive archived originals in all three domains;
 // a single-domain B2 object cannot certify the three-category contract.
 const verifiedCategoryCounts={geopolitics:0,macro:0,rare_earth:0};
 for(const receipt of receipts)
  for(const c of Object.keys(verifiedCategoryCounts))
   verifiedCategoryCounts[c]+=receipt.category_counts?.[c]??0;
 for(const proof of proofs)
  if(proof.existing_archived_object_one_get_restored===true)
   for(const c of Object.keys(verifiedCategoryCounts))
    verifiedCategoryCounts[c]+=proof.verified_category_counts?.[c]??0;
 const threeCategoriesHaveArchivedOriginals=Object.values(verifiedCategoryCounts).every(n=>Number.isSafeInteger(n)&&n>0);
 const independentlyVerifiedBatchRecords=receipts.reduce((n,r)=>n+r.rows_archived,0)+
  proofs.filter(p=>p.existing_archived_object_one_get_restored===true)
   .reduce((n,p)=>n+(p.verified_b2_batch_rows??0),0);
 // Archived D1 rows were ACKed ONLY after real B2 PUT, one GET and
 // immutable hash restoration in their original job. They are not all
 // re-downloaded in this one run: a bounded periodic sample is a separate
 // truth claim. Never gate daily liveness on re-fetching all historic objects.
 const entireStagedSetIndependentlyVerified=independentlyVerifiedBatchRecords===
  census.archived_total&&census.pending_total===0;
 const allCurrentRowsHaveB2ArchiveAck=census.staged_total>0&&
  census.pending_total===0&&census.archived_total===census.staged_total&&
  Object.values(census.category_counts).every(x=>x.archived>0);
 const complete=proofs.at(-1)?.entire_admitted_raw_backlog_verified===true&&
  allCurrentRowsHaveB2ArchiveAck&&
  threeCategoriesHaveArchivedOriginals&&
  entireStagedSetIndependentlyVerified&&
  proofs.every(x=>x.b2_one_get_sha_verified_in_preceding_step===true&&
    x.deployed_authenticated_http_200===true&&x.per_record_five_part_exact===true);
 const rawArchiveIncrementalProof=receipts.length>0&&
  proofs.every(x=>x.same_b2_object_and_d1_original===true&&
    x.b2_one_get_sha_verified_in_preceding_step===true);
 const allQuestionQualified=proofs.every(x=>
  x.per_record_five_part_exact===true&&
  x.deployed_authenticated_http_200===true);
 const summary={
  schema:"geomacro.phase2h.permanent-raw-b2-production-acceptance.v1",
  status:complete?"PASS_REAL_B2_TO_EXACT_QUESTION":
   census.pending_total>0?
    allQuestionQualified?"VERIFIED_INCREMENTAL_B2_WITH_BACKLOG":
      "VERIFIED_INCREMENTAL_RAW_B2_WITH_BACKLOG_QUESTION_GATED":
    allQuestionQualified?"VERIFIED_INCREMENTAL_B2_CORPUS_NOT_EXHAUSTIVELY_RECHECKED":
      "VERIFIED_RAW_B2_CORPUS_NOT_QUESTION_QUALIFIED",
  raw_archive_incremental_proof_pass:rawArchiveIncrementalProof,
  incremental_batch_proof_pass:receipts.length>0&&
   proofs.every(x=>x.same_b2_object_and_d1_original===true&&
     x.b2_one_get_sha_verified_in_preceding_step===true&&
     x.per_record_five_part_exact===true&&
     x.deployed_authenticated_http_200===true),
  verified_at:now.toISOString(),production_main_sha:env.GITHUB_SHA??null,
  actual_b2_readback_verified:proofs.every(x=>x.b2_one_get_sha_verified_in_preceding_step===true),
  category_question_readbacks:Math.max(...proofs.map(x=>x.production_question_readback_categories??0)),
  archived_batches_this_run:receipts.length,
  historical_expired_originals_archived_this_run:receipts.reduce((sum,r)=>
   sum+(r.historical_expired_originals_archived??0),0),
  verified_b2_object_sha256:receipts.map(x=>x.object_sha256),
  independently_restored_existing_b2_sha256:proofs
   .filter(x=>x.existing_archived_object_one_get_restored===true)
   .map(x=>x.existing_object_sha256),
  verified_category_counts:verifiedCategoryCounts,
  five_part_qualified_rows_this_run:proofs.reduce((n,p)=>
   n+(Number.isSafeInteger(p.five_part_qualified_count)?p.five_part_qualified_count:p.verified_b2_batch_rows??0),0),
  raw_only_unqualified_rows_this_run:proofs.reduce((n,p)=>
   n+(p.raw_only_unqualified_count??0),0),
  canonical_d1_category_census:census.category_counts,
  canonical_d1_staged_total:census.staged_total,
  canonical_d1_archived_total:census.archived_total,
  canonical_d1_pending_total:census.pending_total,
  same_run_independently_verified_batch_records:independentlyVerifiedBatchRecords,
  entire_staged_set_independently_verified:entireStagedSetIndependentlyVerified,
  all_current_staged_rows_have_b2_archive_ack:allCurrentRowsHaveB2ArchiveAck,
  all_historical_b2_objects_independently_refetched_this_run:entireStagedSetIndependentlyVerified,
  three_categories_have_archived_originals:threeCategoriesHaveArchivedOriginals,
  archived_records_this_run:receipts.reduce((sum,x)=>sum+x.rows_archived,0),
  archived_category_counts:receipts.reduce((sum,x)=>{
   for(const key of ["geopolitics","macro","rare_earth"])sum[key]+=(x.category_counts?.[key]??0);
   return sum;
  },{geopolitics:0,macro:0,rare_earth:0}),
  existing_archived_object_verified:proofs.some(x=>x.existing_archived_object_one_get_restored===true),
  canonical_d1_and_deployed_question_exact:proofs.every(x=>
    x.same_b2_object_and_d1_original===true&&x.per_record_five_part_exact===true),
  entire_admitted_raw_backlog_verified:complete,
  commercial_rights_verified:false,payments:0,
 };
 writeSummary(summary);
 // Do not turn a fully verified immutable raw backup into a failed B2
 // archival receipt solely because source evidence lacks derived sentences.
 // The five-part/question flag remains explicitly false in that case.
 if(!summary.raw_archive_incremental_proof_pass)
  fail("INCREMENTAL_B2_OR_CANONICAL_ORIGINAL_PROOF_UNAVAILABLE");
 return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const r=await runPhase2hPermanentAcceptance();
  console.log(JSON.stringify(r));
 }catch(error){
  const msg=String(error?.message??"");
  const code=/^PHASE2H_(?:PERMANENT|QUESTION_CHAIN|RAW_B2)_[A-Z0-9_]+$/u.test(msg)?
    msg:"PHASE2H_PERMANENT_PRODUCTION_ACCEPTANCE_UNVERIFIED";
  // A checked-in offline specimen MUST NOT survive as a false live proof.
  // Persist a redacted explicit negative receipt for the real failing run.
  writeSummary({
   schema:"geomacro.phase2h.permanent-raw-b2-production-acceptance.v1",
   status:"PRODUCTION_B2_ARCHIVE_NOT_VERIFIED",
   verified_at:new Date().toISOString(),
   production_main_sha:process.env.GITHUB_SHA??null,
   reason:code,incremental_batch_proof_pass:false,
   actual_b2_readback_verified:false,archived_batches_this_run:0,
   entire_admitted_raw_backlog_verified:false,
   commercial_rights_verified:false,payments:0,
  });
  console.error("::error::"+code);
  process.exitCode=3;
 }
}
