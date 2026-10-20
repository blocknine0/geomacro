#!/usr/bin/env node
/**
 * Owner-only export of an EXISTING, D1-SHA-pinned, exact historical B2 version.
 * Does not create an original, grant, reviewer proof, country certificate,
 * current GRI, hot snapshot, payment or publication.
 *
 * NEVER run in GitHub Actions: original historical bytes belong in the
 * custodian's 0700 private directory, not in workflow artifacts or logs.
 */
import {createHash} from "node:crypto";
import {existsSync,lstatSync,realpathSync,statSync,writeFileSync} from "node:fs";
import {dirname,isAbsolute,relative,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {recoverPinnedGriVersion} from "./recover-gri-pinned-b2-version.mjs";
import {verifyPinnedGlobalRiskBaseline} from "./verify-global-risk-b2-historical-readback.mjs";

const fail=code=>{throw Error("GRI_PRIVATE_HISTORY_EXPORT_"+code);};
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const FORBIDDEN=[
 "SUPABASE_URL","SUPABASE_DB_URL","APP_SUPABASE_URL",
 "SUPABASE_SERVICE_ROLE_KEY","APP_SUPABASE_SERVICE_ROLE_KEY",
 "COINBASE_API_KEY","COINBASE_COMMERCE_API_KEY",
 "GEOMACRO_COMMERCIAL_LAUNCH_ACK","COINBASE_X402_MAINNET_ACK",
];
/** Validate destination before any B2 quota reservation or network request. */
export function privateHistoricalDestination(env=process.env,{
  cwd=process.cwd(),platform=process.platform,
}={}){
 if(env.GITHUB_ACTIONS==="true"||env.CI==="true"||
    env.GEOMACRO_PRIVATE_HISTORICAL_EXPORT_ACK!=="YES_NO_FUNDS")
   fail("PRIVATE_CUSTODIAN_AND_EXPLICIT_CONSENT_REQUIRED");
 if(FORBIDDEN.some(k=>Boolean(env[k])))fail("FUNDS_OR_SUPABASE_FORBIDDEN");
 if(env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="historical_gri_version_recovery"||
    env.B2_REQUEST_BUDGET!=="4"||
    !env.B2_KEY_ID||!env.B2_APPLICATION_KEY||
    !env.CLOUDFLARE_API_TOKEN||!env.CLOUDFLARE_ACCOUNT_ID||
    !env.D1_DATABASE_ID||
    String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").length<32)
   fail("EXISTING_B2_D1_ACCOUNT_GOVERNOR_REQUIRED");
 const raw=env.GEOMACRO_HISTORICAL_B2_READBACK_PATH;
 if(typeof raw!=="string"||!isAbsolute(raw)||raw.includes("\0")||
    !raw.endsWith(".json.gz"))fail("ABSOLUTE_COMPRESSED_PRIVATE_OUTPUT_REQUIRED");
 const full=resolve(raw),parent=realpathSync(dirname(full));
 const repo=realpathSync(cwd),inside=relative(repo,parent);
 if(inside===""||(!inside.startsWith("..")&&!isAbsolute(inside)))
   fail("OUTPUT_MUST_BE_OUTSIDE_PUBLIC_REPOSITORY");
 if(existsSync(full))fail("NEVER_OVERWRITE_PRIVATE_HISTORICAL_FILE");
 const info=statSync(parent);
 if(!info.isDirectory() || (platform!=="win32"&&(info.mode&0o077)!==0))
   fail("PRIVATE_PARENT_DIRECTORY_0700_REQUIRED");
 return full;
}
export async function exportPinnedHistoryToOwnerMachine({
  env=process.env,now=new Date(),recover=recoverPinnedGriVersion,
  cwd=process.cwd(),platform=process.platform,
}={}){
 const full=privateHistoricalDestination(env,{cwd,platform});
 let committed=false,verifiedSha=null;
 // The recovery implementation authorizes each B2 operation using the
 // pre-existing account governor, and checks D1 anchor, immutable file ID,
 // exact compressed SHA, gzip, payload SHA and original snapshot schema.
 const receipt=await recover({
  env,now,
  onVerified:({anchor,compressed,readbackReceipt})=>{
   if(committed||readbackReceipt?.immutable_file_version_verified!==true||
      readbackReceipt?.actual_b2_get_verified!==true||
      readbackReceipt?.exact_compressed_sha256_readback_verified!==true||
      readbackReceipt?.exact_gzip_restore_verified!==true||
      readbackReceipt?.original_historical_baseline_only!==true||
      readbackReceipt?.current_gri_qualified!==false)
     fail("ACTUAL_IMMUTABLE_VERSION_PROOF_REQUIRED");
   const bytes=Buffer.from(compressed??[]);
   const verified=verifyPinnedGlobalRiskBaseline({anchor,compressed:bytes,now});
   if(hash(bytes)!==anchor.b2_sha256||
      verified.b2_sha256!==readbackReceipt.b2_sha256||
      verified.original_payload_sha256!==readbackReceipt.original_payload_sha256)
     fail("EXACT_HISTORICAL_BYTES_OR_PROOF_MISMATCH");
   // Atomic no-overwrite; only privately secured 0700 folder accepted.
   writeFileSync(full,bytes,{flag:"wx",mode:0o600});
   const s=lstatSync(full);
   if(!s.isFile()||s.isSymbolicLink()||
      (platform!=="win32"&&(s.mode&0o077)!==0))
     fail("PRIVATE_OUTPUT_PERMISSIONS_INVALID");
   committed=true;
   verifiedSha=hash(bytes);
   return {owner_private_original_bytes_exported:true,
     verified_compressed_sha256:verifiedSha,
     private_file_location_disclosed:false,
     original_source_as_of:verified.original_source_as_of,
     current_gri_qualified:false};
  },
 });
 if(!committed||receipt?.immutable_file_version_verified!==true)
   fail("B2_READBACK_DID_NOT_COMPLETE");
 return Object.freeze({
  schema:"geomacro.owner-private-gri-history-export.v1",
  verified_original_historical_b2_sha256:verifiedSha,
  owner_private_bytes_written:true,private_file_location_disclosed:false,
  original_source_as_of:receipt.original_source_as_of,
  immutable_file_version_verified:true,
  historical_only:true,full_multi_snapshot_lineage_verified:false,
  independently_reviewed_current_gri_verified:false,
  risk_indices_published:false,deep_health_http_200_verified:false,
  b2_operations:receipt.actual_b2_operations,
  b2_puts:0,d1_product_writes:0,supabase_requests:0,payments:0,
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==3||process.argv[2]!=="--owner-private-verified-no-funds")
    fail("EXPLICIT_CUSTODIAN_MODE_REQUIRED");
  console.log(JSON.stringify(await exportPinnedHistoryToOwnerMachine()));
 }catch{
  // No raw B2 errors, private paths, source/licence details or credentials.
  console.error("GRI_PRIVATE_HISTORICAL_EXPORT_FAILED_CLOSED");
  process.exitCode=2;
 }
}
