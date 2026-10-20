import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtempSync,mkdirSync,readFileSync,statSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {gzipSync} from "node:zlib";
import {
 privateHistoricalDestination,exportPinnedHistoryToOwnerMachine,
} from "./export-gri-verified-history-private.mjs";

const sha=x=>createHash("sha256").update(x).digest("hex");
const now=new Date("2026-10-20T13:50:00Z");
const value={schema:"geomacro.public-global-risk-live.v1",
 generated_at:"2026-10-08T06:39:43.490Z",
 source_project:"ldpwajisioljyjtojvfx",
 data:{snapshotAsOf:"2026-10-08T06:38:59.944+00:00",
  verificationStatus:"verified",auditPersisted:true,
  methodologyVersion:"gri-v1.2.0"}};
const plain=Buffer.from(JSON.stringify(value)),packed=gzipSync(plain);
const anchor={schema:"geomacro.global-risk-b2-anchor.v1",
 product:"global-risk",ok:true,
 b2_object_key:"geomacro-evidence/v1/live/global-risk/latest.json.gz",
 b2_sha256:sha(packed),payload_sha256:sha(plain),
 generated_at:value.generated_at,source_run_id:"37738738715",
 baseline_b2_readback_verified:true,
 baseline_exact_gzip_restore_verified:true,
 anchor_kind:"prior_b2_baseline_of_independent_gri_proof"};
function fixture(){
 const root=mkdtempSync(join(tmpdir(),"gri-owner-history-"));
 const privateDir=join(root,"custodian");
 mkdirSync(privateDir,{mode:0o700});
 const path=join(privateDir,"pinned-original-history.json.gz");
 const env={GEOMACRO_PRIVATE_HISTORICAL_EXPORT_ACK:"YES_NO_FUNDS",
 GEOMACRO_HISTORICAL_B2_READBACK_PATH:path,
 B2_ACCOUNT_QUOTA_REQUIRED:"1",
 B2_ACCOUNT_QUOTA_WORKFLOW_ID:"historical_gri_version_recovery",
 B2_REQUEST_BUDGET:"4",B2_KEY_ID:"synthetic",B2_APPLICATION_KEY:"synthetic",
 CLOUDFLARE_API_TOKEN:"synthetic",CLOUDFLARE_ACCOUNT_ID:"synthetic",
 D1_DATABASE_ID:"synthetic",
 GEOMACRO_COMMERCE_LEDGER_TOKEN:"synthetic_owner_ledger_credential_1234"};
 return {root,privateDir,path,env,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
function acceptedRecovery({onVerified}){
 const proof={immutable_file_version_verified:true,
 actual_b2_get_verified:true,
 exact_compressed_sha256_readback_verified:true,
 exact_gzip_restore_verified:true,
 original_historical_baseline_only:true,current_gri_qualified:false,
 b2_sha256:sha(packed),original_payload_sha256:sha(plain),
 };
 const after=onVerified({anchor,compressed:packed,readbackReceipt:proof});
 return {original_source_as_of:value.data.snapshotAsOf,
  immutable_file_version_verified:true,actual_b2_operations:3,
  ...proof,history_restore:after};
}
test("rejects Actions, CI, missing approval, payments, ungoverned quota and repo output BEFORE network",async()=>{
 const f=fixture();let count=0;const recovery=async()=>{count++;return acceptedRecovery({onVerified:()=>{}})};
 try{
  for(const changes of [{GITHUB_ACTIONS:"true"},{CI:"true"},
   {GEOMACRO_PRIVATE_HISTORICAL_EXPORT_ACK:""},{SUPABASE_URL:"forbidden"},
   {COINBASE_API_KEY:"forbidden"},{B2_ACCOUNT_QUOTA_REQUIRED:"0"},
   {B2_REQUEST_BUDGET:"50"},{GEOMACRO_HISTORICAL_B2_READBACK_PATH:"relative.json.gz"},
  ]){
   await assert.rejects(exportPinnedHistoryToOwnerMachine({
      env:{...f.env,...changes},now,recover:recovery
   }),/GRI_PRIVATE_HISTORY_EXPORT_/);
  }
  assert.equal(count,0);
  assert.throws(()=>privateHistoricalDestination({...f.env,
    GEOMACRO_HISTORICAL_B2_READBACK_PATH:join(process.cwd(),"input.json.gz")}),
    /GRI_PRIVATE_HISTORY_EXPORT_/);
 }finally{f.cleanup()}
});
test("real pinned old B2 bytes can be privately exported once, without current GRI claim",async()=>{
 const f=fixture();
 try{
  const receipt=await exportPinnedHistoryToOwnerMachine({env:f.env,now,
   recover:async({onVerified})=>acceptedRecovery({onVerified})});
  assert.equal(receipt.owner_private_bytes_written,true);
  assert.equal(receipt.verified_original_historical_b2_sha256,sha(packed));
  assert.equal(receipt.immutable_file_version_verified,true);
  assert.equal(receipt.independently_reviewed_current_gri_verified,false);
  assert.equal(receipt.deep_health_http_200_verified,false);
  assert.equal(receipt.payments+receipt.d1_product_writes+receipt.b2_puts,0);
  assert.deepEqual(readFileSync(f.path),packed);
  if(process.platform!=="win32")
   assert.equal(statSync(f.path).mode&0o077,0);
  assert.doesNotMatch(JSON.stringify(receipt),/gri-owner-history-|custodian/);
  await assert.rejects(exportPinnedHistoryToOwnerMachine({env:f.env,now,
    recover:async()=>{throw Error("SHOULD_NOT_DOWNLOAD")}}),
    /NEVER_OVERWRITE_PRIVATE_HISTORICAL_FILE/);
 }finally{f.cleanup()}
});
test("an unsigned, hash-mismatched or unverified receipt cannot save B2 bytes",async()=>{
 const f=fixture();
 try{
  for(const variant of [
   {readbackReceipt:{actual_b2_get_verified:false}},
   {readbackReceipt:{actual_b2_get_verified:true}},
   {readbackReceipt:{...acceptedProof(),b2_sha256:"f".repeat(64)}},
   {compressed:Buffer.from("tampered"),readbackReceipt:acceptedProof()},
  ]){
   await assert.rejects(exportPinnedHistoryToOwnerMachine({env:f.env,now,
     recover:async({onVerified})=>onVerified({
      anchor,compressed:variant.compressed??packed,
      readbackReceipt:variant.readbackReceipt,
     })}),/GRI_PRIVATE_HISTORY_EXPORT_|HISTORICAL_GRI_B2_/);
  }
  assert.equal(statSync(f.privateDir).isDirectory(),true);
 }finally{f.cleanup()}
});
function acceptedProof(){return {
 immutable_file_version_verified:true,actual_b2_get_verified:true,
 exact_compressed_sha256_readback_verified:true,exact_gzip_restore_verified:true,
 original_historical_baseline_only:true,current_gri_qualified:false,
 b2_sha256:sha(packed),original_payload_sha256:sha(plain),
}}
test("no original compressed bytes can appear in generic Actions artifact paths",()=>{
 const w=readFileSync(".github/workflows/gri-pinned-version-recovery.yml","utf8");
 assert.doesNotMatch(w,/export-gri-verified-history-private\.mjs/);
 const source=readFileSync("scripts/ops/export-gri-verified-history-private.mjs","utf8");
 assert.match(source,/GITHUB_ACTIONS==="true"/);
 assert.match(source,/writeFileSync\(full,bytes,\{flag:"wx",mode:0o600\}\)/);
 assert.doesNotMatch(source,/console\.log\(.*compressed/);
});
