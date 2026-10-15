#!/usr/bin/env node
/**
 * Read-only exact B2 GET of the ORIGINAL previously verified global-risk hot
 * archive, pinned by the existing authenticated D1 proof. This is neither a
 * newly signed/current GRI nor the immutable multi-snapshot history lineage.
 * No Supabase, no D1 write, no B2 PUT, no payment, no raw output.
 */
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { createB2Client } from "./b2-s3-client.mjs";
import { readGlobalRiskB2Anchor } from "./publish-b2-verified-hot-snapshot.mjs";

const B2_ENDPOINT="https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET="geomacro-private-archive";
const EXPECTED_KEY="geomacro-evidence/v1/live/global-risk/latest.json.gz";
const HASH=/^[a-f0-9]{64}$/u;
const RUN=/^\d{1,20}$/u;
const MAX_AGE_MS=30*24*3600_000;
const assert=(v,k)=>{if(!v)throw Error("HISTORICAL_GRI_B2_"+k)};
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");

/** Verifies actual compressed bytes, not a stored D1 boolean or public URL. */
export function verifyPinnedGlobalRiskBaseline({anchor,compressed,now=new Date()}={}){
 const at=now instanceof Date?now.getTime():NaN;
 assert(Number.isFinite(at),"CLOCK_INVALID");
 assert(anchor?.schema==="geomacro.global-risk-b2-anchor.v1" &&
   anchor.product==="global-risk" && anchor.ok===true &&
   anchor.b2_object_key===EXPECTED_KEY &&
   HASH.test(String(anchor.b2_sha256??"")) &&
   HASH.test(String(anchor.payload_sha256??"")) &&
   RUN.test(String(anchor.source_run_id??"")) &&
   anchor.baseline_b2_readback_verified===true &&
   anchor.baseline_exact_gzip_restore_verified===true,
   "D1_ANCHOR_PROVENANCE_INVALID");
 const generatedAt=Date.parse(anchor.generated_at);
 assert(Number.isFinite(generatedAt)&&
   generatedAt<=at+5*60_000&&at-generatedAt<=MAX_AGE_MS,
   "D1_ANCHOR_TOO_OLD_OR_FUTURE");
 const packed=Buffer.from(compressed??[]);
 assert(packed.length>=30&&packed.length<=2*1024*1024&&
   sha(packed)===anchor.b2_sha256,"COMPRESSED_B2_READBACK_SHA_MISMATCH");
 let restored,value;
 try{
   restored=gunzipSync(packed,{maxOutputLength:12*1024*1024});
   value=JSON.parse(restored.toString("utf8"));
 }catch{throw Error("HISTORICAL_GRI_B2_GZIP_OR_JSON_INVALID")}
 assert(sha(restored)===anchor.payload_sha256,
   "ORIGINAL_PAYLOAD_SHA_MISMATCH");
 assert(value?.schema==="geomacro.public-global-risk-live.v1" &&
   value.generated_at===anchor.generated_at &&
   value.source_project==="ldpwajisioljyjtojvfx" &&
   value.data?.verificationStatus==="verified" &&
   value.data?.auditPersisted===true &&
   value.data?.methodologyVersion==="gri-v1.2.0" &&
   Number.isFinite(Date.parse(String(value.data?.snapshotAsOf??""))) &&
   Date.parse(value.data.snapshotAsOf)<=generatedAt+5*60_000,
   "ORIGINAL_GRI_BASELINE_INVALID");
 return Object.freeze({
   schema:"geomacro.gri-historical-b2-readback-receipt.v1",
   checked_at:new Date(at).toISOString(),
   original_generated_at:anchor.generated_at,
   original_source_as_of:value.data.snapshotAsOf,
   original_source_run_id:anchor.source_run_id,
   b2_sha256:anchor.b2_sha256,
   original_payload_sha256:anchor.payload_sha256,
   actual_b2_get_verified:true,
   exact_compressed_sha256_readback_verified:true,
   exact_gzip_restore_verified:true,
   original_methodology_version:"gri-v1.2.0",
   anchor_key_type:"MUTABLE_LIVE_HOT_OBJECT_NOT_IMMUTABLE_HISTORY",
   original_historical_baseline_only:true,
   immutable_historical_lineage_verified:false,
   current_gri_qualified:false,
   signed_country_category_certificates_verified:false,
   paid_intelligence_available:false,
   external_independent_review_still_required:true,
   supabase_network_attempts:0,
   d1_writes:0,b2_puts:0,x402_charges:0,
 });
}

export async function runCurrentB2HistoricalReadback({
  getAnchor=readGlobalRiskB2Anchor,
  createClient=createB2Client,
  now=new Date(),
}={}){
 for(const key of [
   "SUPABASE_DB_URL","SUPABASE_URL","APP_SUPABASE_URL",
   "SUPABASE_SERVICE_ROLE_KEY","APP_SUPABASE_SERVICE_ROLE_KEY",
   "COINBASE_API_KEY","COINBASE_COMMERCE_API_KEY"
 ])assert(!process.env[key],"FORBIDDEN_SUPABASE_OR_PAYMENT_CREDENTIAL");
 assert(process.env.B2_ACCOUNT_QUOTA_REQUIRED==="1"&&
   process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID==="historical_gri_readback"&&
   Number(process.env.B2_REQUEST_BUDGET)>=1&&
   Number(process.env.B2_REQUEST_BUDGET)<=4&&
   process.env.CLOUDFLARE_API_TOKEN&&process.env.CLOUDFLARE_ACCOUNT_ID&&
   process.env.D1_DATABASE_ID&&
   String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").length>=32&&
   process.env.B2_KEY_ID&&process.env.B2_APPLICATION_KEY,
   "GOVERNED_READ_ONLY_RUNTIME_REQUIRED");
 // Fully validate the D1 anchor before opening even one B2 connection.
 const anchor=await getAnchor();
 assert(anchor?.b2_object_key===EXPECTED_KEY&&
   HASH.test(String(anchor?.b2_sha256??"")),
   "AUTHORIZED_D1_HOT_ANCHOR_UNAVAILABLE");
 const b2=createClient({
   endpointUrl:B2_ENDPOINT,bucket:B2_BUCKET,
   accessKey:process.env.B2_KEY_ID,secretKey:process.env.B2_APPLICATION_KEY,
   allowedKeyPrefixes:["geomacro-evidence/v1/"],
 });
 const packed=await b2.get(EXPECTED_KEY); // shared D1 ticket required per attempt
 const receipt=verifyPinnedGlobalRiskBaseline({anchor,compressed:packed,now});
 return {...receipt,account_quota_governed:true,b2_usage:b2.usage()};
}

if(process.argv[1]?.endsWith("verify-global-risk-b2-historical-readback.mjs")){
 try {
   assert(process.argv.length===3&&
     process.argv[2]==="--governed-read-only","EXPLICIT_READ_ONLY_MODE_REQUIRED");
   const result=await runCurrentB2HistoricalReadback();
   mkdirSync("artifacts/gri-b2-history",{recursive:true});
   writeFileSync("artifacts/gri-b2-history/verified-readback.json",
     JSON.stringify(result,null,2)+"\n",{mode:0o600});
   console.log(JSON.stringify({
     schema:result.schema,actual_b2_get_verified:true,
     exact_gzip_restore_verified:true,
     immutable_historical_lineage_verified:false,
     current_gri_qualified:false,paid_intelligence_available:false,
     supabase_network_attempts:0,b2_puts:0,d1_writes:0,x402_charges:0,
   }));
 }catch{
   console.error("HISTORICAL_GRI_B2_READBACK_FAILED_CLOSED");
   process.exitCode=2;
 }
}
