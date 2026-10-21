#!/usr/bin/env node
/**
 * Owner-authorized protected GitHub runner: exact immutable B2 derived-only
 * review case -> TWO separately configured provider-family reviews ->
 * exact private B2 receipt. Never signs Facts/Rights/GRI or touches public D1.
 */
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {createB2Client} from "./b2-s3-client.mjs";
import {reviewPrivateCaseWithAi} from "../lib/private-ai-research-adjudication.mjs";

const H=/^[a-f0-9]{64}$/u;
const PREFIX="geomacro-evidence/v1/private/ai-review-case/";
const OUT="geomacro-evidence/v1/private/ai-review-research/";
const DENY="GEOMACRO_PRIVATE_HOSTED_AI_REVIEW_FAILED_CLOSED";
const fail=()=>{throw Error(DENY)};
const digest=x=>createHash("sha256").update(x).digest("hex");
export function verifyHostedReviewEnv(env=process.env){
 const forbidden=["SUPABASE_DB_URL","SUPABASE_URL","APP_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY","APP_SUPABASE_SERVICE_ROLE_KEY",
  "COINBASE_API_KEY","COINBASE_COMMERCE_API_KEY",
  "COINBASE_X402_MAINNET_ACK","GEOMACRO_COMMERCIAL_LAUNCH_ACK"];
 const h=env.AI_REVIEW_CASE_SHA256,key=env.AI_REVIEW_CASE_B2_KEY;
 if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !H.test(h??"")||key!==PREFIX+h+".json"||
    env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="ai_private_review_research"||
    env.B2_REQUEST_BUDGET!=="4"||
    !env.B2_KEY_ID||!env.B2_APPLICATION_KEY||
    !env.D1_DATABASE_ID||!env.CLOUDFLARE_ACCOUNT_ID||
    !env.CLOUDFLARE_API_TOKEN||
    String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").length<32||
    forbidden.some(x=>Boolean(env[x]))||
    env.GEOMACRO_AI_REVIEW_DERIVED_ONLY_ACK!=="YES_APPROVED_DERIVED_ONLY"||
    env.GEOMACRO_AI_REVIEW_FREE_QUOTA_ACK!=="YES_FREE_TIER_CONFIRMED")
   fail();
 return {key,hash:h};
}
export async function hostedAiPrivateReview({
 env=process.env,archiveClient=()=>createB2Client({
  endpointUrl:"https://s3.us-east-005.backblazeb2.com",
  bucket:"geomacro-private-archive",accessKey:env.B2_KEY_ID,
  secretKey:env.B2_APPLICATION_KEY,
  allowedKeyPrefixes:[PREFIX,OUT]
 }),reviewer=reviewPrivateCaseWithAi,now=()=>new Date()
}={}){
 const {key,hash}=verifyHostedReviewEnv(env);
 const b2=archiveClient();
 const bytes=Buffer.from(await b2.get(key));
 if(bytes.length<100||bytes.length>16000||digest(bytes)!==hash)fail();
 let input;
 try{input=JSON.parse(bytes.toString("utf8"))}catch{fail()}
 const receipt=await reviewer({input,env,now:now()});
 if(receipt?.schema!=="geomacro.private-ai-assisted-research-verdict.v1"||
  receipt.canonical_gri_publisher_eligible!==false||
  receipt.licensed_paid_output_allowed!==false||
  receipt.independent_external_reviewer_attested!==false||
  receipt.x402_authorized!==false||
  receipt.current_b2_d1_hot_published!==false)fail();
 const body=Buffer.from(JSON.stringify(receipt)+"\n");
 if(body.length>12*1024)fail();
 const pin=digest(body),outputKey=OUT+pin+".json";
 // Existing hash object never replaced if its exact bytes differ; B2 is
 // quota governed and no read/write occurs before valid private review.
 const existing=await b2.getOptional(outputKey);
 let writes=0;
 if(existing){
  if(!Buffer.from(existing).equals(body))fail();
 }else{await b2.put(outputKey,body);writes=1}
 const readback=Buffer.from(await b2.get(outputKey));
 if(digest(readback)!==pin||!readback.equals(body))fail();
 return Object.freeze({
  schema:"geomacro.hosted-ai-research-b2-receipt.v1",
  status:"PRIVATE_AI_RESEARCH_SAVED_AND_HASH_READBACK_VERIFIED",
  private_research_proof_verified:true,
  provider_family_count:2,
  research_consensus:receipt.status==="AI_CONSENSUS_ON_SUPPLIED_DERIVED_SUMMARIES",
  independently_signed_gri:false,
  licensed_commercial_delivery:false,
  b2_writes:writes,d1_writes:0,supabase_requests:0,real_payments:0,
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==2)fail();
  process.stdout.write(JSON.stringify(await hostedAiPrivateReview())+"\n");
 }catch{
  console.error(DENY);
  process.exitCode=2;
 }
}
