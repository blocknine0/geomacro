#!/usr/bin/env node
/** Post-archive PRODUCTION proof: the SAME B2-verified private batch must
 * answer an exact news-ID question through the deployed, authenticated Worker.
 * No originals, source identities or keys appear in logs/artifacts.
 * No payment, new provider, extra B2 request or source polling.
 */
import {createHmac} from "node:crypto";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {validPrivateRawNews} from "../../workers/control-plane/src/phase2h-private-raw-news.mjs";
const ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev";
const RECEIPT="artifacts/derived-news/phase2h-private-raw-b2-verified.json";
const HEX=/^[a-f0-9]{64}$/u;
const fail=code=>{throw Error("PHASE2H_QUESTION_CHAIN_"+code)};
export async function verifyPhase2hProductionQuestionChain({
 env=process.env,fetchImpl=fetch,now=Date.now(),receipt
}={}){
 if(env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   env.GITHUB_REF!=="refs/heads/main"||env.GITHUB_ACTIONS!=="true"||
   !/^[a-f0-9]{32}$/u.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
   !/^[a-f0-9-]{36}$/iu.test(env.D1_DATABASE_ID??"")||
   (env.CLOUDFLARE_API_TOKEN??"").length<20||
   (env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").length<32)
  fail("PROTECTED_PRODUCTION_CONFIG_REQUIRED");
 if(receipt?.schema!=="geomacro.phase2h.private-raw-b2-acceptance.v1"||
   receipt.status!=="B2_PUT_TWO_INDEPENDENT_GET_SHA_AND_D1_VERIFIED"||
   receipt.storage_confirmed!==true||
   receipt.b2_first_get_verified!==true||
   receipt.b2_second_independent_get_verified!==true||
   receipt.post_archive_d1_verified!==true||
   !Number.isSafeInteger(receipt.rows_archived)||receipt.rows_archived<1||
   !HEX.test(receipt.object_sha256))
  fail("B2_POSITIVE_EXACT_READBACK_RECEIPT_REQUIRED");
 const endpoint="https://api.cloudflare.com/client/v4/accounts/"+
   env.CLOUDFLARE_ACCOUNT_ID+"/d1/database/"+env.D1_DATABASE_ID+"/query";
 async function query(sql,params=[]){
  const response=await fetchImpl(endpoint,{method:"POST",redirect:"error",
   headers:{"Authorization":"Bearer "+env.CLOUDFLARE_API_TOKEN,
    "Content-Type":"application/json"},
   body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(15000)});
  const body=await response.json();
  if(response.status!==200||body?.success!==true||
    !Array.isArray(body.result)||body.result.length!==1||
    body.result[0]?.success===false||!Array.isArray(body.result[0].results))
   fail("PROVIDER_CANONICAL_D1_READ_FAILED");
  return body.result[0].results;
 }
 const rows=await query("SELECT record_id,category,raw_sha256,raw_json,b2_object_sha256,b2_archived_at FROM phase2h_private_raw_news WHERE b2_object_sha256=? ORDER BY record_id LIMIT 301",
  [receipt.object_sha256]);
 if(rows.length!==receipt.rows_archived||rows.length>300)
  fail("B2_BATCH_D1_ID_CENSUS_INCOMPLETE");
 const categories=["geopolitics","macro","rare_earth"];
 const counts=Object.fromEntries(categories.map(c=>[c,0]));
 const originals=[],seen=new Set();
 for(const record of rows){
  if(!HEX.test(record.record_id)||seen.has(record.record_id)||
    record.b2_object_sha256!==receipt.object_sha256||
    !HEX.test(record.raw_sha256)||!record.b2_archived_at)
   fail("B2_OBJECT_D1_ID_NOT_ACKNOWLEDGED");
  seen.add(record.record_id);
  const row=JSON.parse(record.raw_json);
  if(row.record_id!==record.record_id||row.raw_sha256!==record.raw_sha256||
    !categories.includes(row.category)||row.category!==record.category)
   fail("CANONICAL_D1_IMMUTABLE_ID_MISMATCH");
  await validPrivateRawNews(row,now,false);
  if(typeof row.analysis?.what_happened?.text!=="string"||
     !row.analysis.what_happened.text.trim()||
     typeof row.analysis?.why_it_matters?.text!=="string"||
     !row.analysis.why_it_matters.text.trim())
   fail("PER_NEWS_FIVE_PART_ANALYSIS_MISSING");
  counts[row.category]++;
  originals.push(row);
 }
 if(categories.some(category=>counts[category]!==receipt.category_counts?.[category]))
  fail("B2_BATCH_CATEGORY_COUNTS_DIVERGED");
 // Three bounded authenticated requests, one from each actually present
 // domain. Every archived record was already validated above against B2/D1.
 const questions={
  geopolitics:["Why does this geopolitical development matter?","What happened in this geopolitical development?"],
  macro:["Why does this macro release matter?","What happened in this macro release?"],
  rare_earth:["Why does this critical minerals event matter?","What happened in this critical minerals event?"]
 };
 // Distinct event topics cannot reuse an identical category boilerplate.
 for(const category of categories){
  const group=originals.filter(row=>row.category===category);
  const differentEventFacts=new Set(group.map(row=>row.analysis.what_happened.text).filter(Boolean));
  if(differentEventFacts.size>1){
   if(new Set(group.map(row=>row.analysis.why_it_matters.text)).size<2||
      new Set(group.map(row=>row.analysis.what_happened.text)).size<2)
    fail("REPEATED_GENERIC_EVENT_ANALYSIS");
  }
 }
 const controlToken=createHmac("sha256",env.GEOMACRO_COMMERCE_LEDGER_TOKEN)
  .update("geomacro-control-plane-v1").digest("hex");
 let questionReadbacks=0,questionVariantsVerified=0;
 for(const category of categories){
  const row=originals.find(x=>x.category===category);
  if(!row)continue;
  if(row.analysis.what_happened.text===row.analysis.why_it_matters.text)
   fail("GENERIC_SAME_EVENT_WHAT_WHY_ANALYSIS");
  for(const [index,question] of questions[category].entries()){
   const url=ORIGIN+"/v1/internal/phase2h-raw-news?"+
    new URLSearchParams({record_id:row.record_id,question}).toString();
   const response=await fetchImpl(url,{method:"GET",redirect:"error",
    cache:"no-store",headers:{Authorization:"Bearer "+controlToken,
     Accept:"application/json","Cache-Control":"no-store"},
    signal:AbortSignal.timeout(15000)});
   if(response.status!==200||response.redirected)fail("DEPLOYED_PRIVATE_HTTP_UNAVAILABLE");
   const reply=await response.json();
   if(reply?.ok!==true||reply.schema!=="geomacro.phase2h.private-question-fivepart.v1"||
     reply.source!=="B2_ACKNOWLEDGED_PRIVATE_ORIGINAL_D1"||
     reply.chargeable!==false||reply.paid_eligible!==false||
     reply.raw_original_not_delivered!==true||
     !Array.isArray(reply.question_matches)||reply.question_matches.length!==1)
    fail("EXACT_QUESTION_CONTRACT_INVALID");
   const answer=reply.question_matches[0];
   const focus=index===0?"why_it_matters":"what_happened";
   if(answer.record_id!==row.record_id||answer.category!==row.category||
     answer.original_published_at!==row.original.original_published_at||
     answer.archive_d1_ack_present!==true||answer.focus!==focus||
     answer.direct_answer!==row.analysis[focus].text||
     JSON.stringify(answer.five_part)!==JSON.stringify(row.analysis))
    fail("EXACT_QUESTION_FIVE_PART_NOT_MATCHED");
   const publicShape=JSON.stringify(reply);
   if(publicShape.includes(row.original.original_url)||
      publicShape.includes(row.original.original_title)||
      publicShape.includes(row.original.original_source_id))
    fail("PRIVATE_ORIGINAL_EXPOSED_IN_QUESTION_JSON");
   questionVariantsVerified++;
  }
  questionReadbacks++;
 }
 if(questionReadbacks!==categories.filter(c=>counts[c]>0).length)
  fail("THREE_CATEGORY_QUESTION_READBACK_INCOMPLETE");
 const pending=await query("SELECT EXISTS(SELECT 1 FROM phase2h_private_raw_news WHERE b2_object_sha256 IS NULL LIMIT 1) AS has_pending");
 if(pending.length!==1||![0,1].includes(Number(pending[0].has_pending)))
  fail("ARCHIVE_BACKLOG_NOT_VERIFIABLE");
 return Object.freeze({
  schema:"geomacro.phase2h.production-raw-b2-exact-question-acceptance.v1",
  same_b2_object_and_d1_original:true,
  b2_two_get_verified_in_preceding_step:true,
  original_native_clock_preserved:true,
  per_record_five_part_exact:true,
  verified_b2_batch_rows:originals.length,
  verified_category_counts:counts,
  production_question_readback_categories:questionReadbacks,
  question_variants_verified:questionVariantsVerified,
  what_and_why_change_with_question:true,
  deployed_authenticated_http_200:true,
  raw_source_not_delivered:true,
  unarchived_backlog_present:Boolean(Number(pending[0].has_pending)),
  entire_admitted_raw_backlog_verified:!Number(pending[0].has_pending),
  commercial_rights_verified:false,payments:0
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const receipt=JSON.parse(readFileSync(RECEIPT,"utf8"));
  const r=await verifyPhase2hProductionQuestionChain({receipt});
  console.log(JSON.stringify(r));
  if(!r.entire_admitted_raw_backlog_verified)process.exitCode=3;
 }catch(e){
  const msg=String(e?.message??"");
  console.error("::error::"+(/^PHASE2H_QUESTION_CHAIN_[A-Z0-9_]+$/u.test(msg)?
   msg:"PHASE2H_QUESTION_CHAIN_UNVERIFIED"));
  process.exitCode=3;
 }
}
