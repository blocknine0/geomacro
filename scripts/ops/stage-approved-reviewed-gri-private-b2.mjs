#!/usr/bin/env bun
/**
 * Independently reviewed/certified GRI INPUT archive ONLY.
 * The publisher/scorer and Risk Indices continuation are still separate.
 * Requires actual external reviewer signatures and lawful original rights;
 * never creates a review, signer key, legal grant, score or payment.
 */
import {readFileSync,statSync} from "node:fs";
import {createHash} from "node:crypto";
import {approvedIndependentReviewerFromEnv} from
  "../../src/lib/independent-reviewer-authority.server.ts";
import {prepareImmutableReviewedGriHandoff} from
  "../lib/gri-reviewed-immutable-b2-handoff.mjs";
import {createB2Client} from "./b2-s3-client.mjs";

const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const HEX=/^[a-f0-9]{64}$/u;
const fail=code=>{throw Error("GRI_REVIEWED_STAGE_"+code)};
const sources=[
  ["GEOMACRO_REVIEWED_GRI",1024*1024,"json"],
  ["GEOMACRO_COUNTRY_CERTIFICATES",512*1024,"json"],
  ["GEOMACRO_HISTORICAL_B2_READBACK",2*1024*1024,"binary"],
];
function pinned(name,max,format){
  const path=process.env[name+"_PATH"],pin=process.env[name+"_SHA256"];
  if(!path||!HEX.test(pin??""))fail("PRIVATE_SIGNED_INPUT_PIN_REQUIRED");
  const size=statSync(path).size;
  if(size<30||size>max)fail("PRIVATE_SIGNED_INPUT_SIZE_INVALID");
  const bytes=readFileSync(path);
  if(sha(bytes)!==pin)fail("PRIVATE_SIGNED_INPUT_HASH_MISMATCH");
  if(format==="binary")return bytes;
  try{return JSON.parse(bytes.toString("utf8"));}
  catch{fail("PRIVATE_SIGNED_JSON_INVALID");}
}
async function main(){
  if(process.argv.length!==3||
     process.argv[2]!=="--stage-approved-review-no-funds")
    fail("EXPLICIT_APPROVED_REVIEW_MODE_REQUIRED");
  for(const key of ["SUPABASE_URL","SUPABASE_DB_URL","APP_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY","APP_SUPABASE_SERVICE_ROLE_KEY",
      "COINBASE_API_KEY","COINBASE_COMMERCE_API_KEY","GEOMACRO_COMMERCIAL_LAUNCH_ACK"])
    if(process.env[key])fail("SUPABASE_OR_FUNDS_FORBIDDEN");
  if(process.env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
     process.env.B2_REQUEST_BUDGET!=="6"||
     !process.env.D1_DATABASE_ID||
     !process.env.CLOUDFLARE_ACCOUNT_ID||
     !process.env.CLOUDFLARE_API_TOKEN||
     !process.env.B2_KEY_ID||!process.env.B2_APPLICATION_KEY||
     !process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN||
     !/^[a-z][a-z0-9_-]{1,47}$/u.test(process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID??""))
    fail("PROTECTED_B2_D1_GOVERNOR_REQUIRED");
  const pem=approvedIndependentReviewerFromEnv();
  if(!pem)fail("APPROVED_INDEPENDENT_REVIEWER_PIN_REQUIRED");
  const [reviewedGri,countryCategoryCertificates,historicalB2Bytes]=
    sources.map(row=>pinned(...row));
  // No client initialization or quota reservation on invalid reviewer,
  // country certificates, independent event evidence or historical SHA.
  const input={reviewedGri,countryCategoryCertificates,
    historicalB2Bytes,trustedReviewerPublicKeyPem:pem};
  const stage=prepareImmutableReviewedGriHandoff({...input,now:new Date()});
  const b2=createB2Client({endpointUrl:"https://s3.us-east-005.backblazeb2.com",
    bucket:"geomacro-private-archive",accessKey:process.env.B2_KEY_ID,
    secretKey:process.env.B2_APPLICATION_KEY});
  let writes=0;
  for(const item of stage.uploadFiles){
    // Read first: a content-addressed immutable key must never overwrite
    // any existing different bytes, even when B2 allows PUT overwrite.
    const existing=await b2.getOptional(item.key);
    if(existing){
      if(!Buffer.from(existing).equals(item.bytes))
        fail("IMMUTABLE_SIGNED_OBJECT_COLLISION");
    }else{
      await b2.put(item.key,item.bytes);
      writes++;
    }
    const actual=Buffer.from(await b2.get(item.key));
    if(!actual.equals(item.bytes)||sha(actual)!==item.sha256)
      fail("INDEPENDENT_EXACT_B2_BYTES_READBACK_FAILED");
  }
  // A delayed B2 confirmation cannot freshen old signed originals.
  // Revalidate all dates, reviewer signatures and country certificates again.
  const final=prepareImmutableReviewedGriHandoff({...input,now:new Date()});
  for(let i=0;i<2;i++)
    if(final.uploadFiles[i].sha256!==stage.uploadFiles[i].sha256)
      fail("SIGNED_INPUT_CHANGED_DURING_PUBLICATION");
  let dispatched=false;
  if(process.env.GRI_SIGNED_READY_DISPATCH_ACK==="YES_NO_FUNDS"){
    const token=process.env.GITHUB_TOKEN;
    if(!token||token.length<30)fail("GITHUB_DISPATCH_TOKEN_MISSING");
    const response=await fetch("https://api.github.com/repos/blocknine0/geomacro/dispatches",{
      method:"POST",redirect:"error",
      headers:{accept:"application/vnd.github+json",authorization:"Bearer "+token,
        "content-type":"application/json","x-github-api-version":"2022-11-28"},
      body:JSON.stringify({event_type:"gri_reviewed_current_ready",client_payload:{
        schema:"geomacro.signed-reviewed-gri-ready.v1",
        reviewed_b2_key:final.receipt.reviewed_b2_key,
        reviewed_b2_sha256:final.receipt.reviewed_b2_sha256,
        reviewed_certificates_b2_key:final.receipt.reviewed_certificates_b2_key,
        reviewed_certificates_b2_sha256:final.receipt.reviewed_certificates_b2_sha256,
      }}),signal:AbortSignal.timeout(15000),
    });
    if(response.status!==204)fail("PROTECTED_GRI_PUBLISHER_DISPATCH_REJECTED");
    dispatched=true;
  }
  return Object.freeze({
    ...final.receipt,
    immutable_b2_readback_verified:true,
    b2_writes:writes,
    publisher_dispatch_accepted:dispatched,
    public_gri_d1_readback_verified:false,
    funds_spent_usdc:0,
    b2_requests_started:b2.usage().requests_started,
    ready_for_protected_gri_publisher:true,
    // This is NOT a real published GRI and not customer billability.
    canonical_numerical_score_published:false,
    risk_indices_published:false,
    x402_charge_authorized:false,
  });
}
try{console.log(JSON.stringify(await main()));}
catch{console.error("GRI_REVIEWED_STAGE_FAILED_CLOSED");process.exitCode=2;}
