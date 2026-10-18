#!/usr/bin/env node
// Read-only idempotence gate for old GRI B2 immutable-version replay. Check
// exactly the previous authenticated anchor, not any untrusted/new timestamp.
// Never assert CURRENT GRI or CURRENT B2 readback based on D1 historical rows.
import {appendFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {readGlobalRiskB2Anchor} from "./publish-b2-verified-hot-snapshot.mjs";
import {classifyPinnedGlobalRiskAnchor} from "./verify-global-risk-b2-historical-readback.mjs";
import {existingD1HistoryWriter} from "./restore-gri-verified-version-to-d1.mjs";

const HASH=/^[a-f0-9]{64}$/u;
const FAIL="GRI_HISTORY_EXISTING_D1_READONLY_NOT_VERIFIED";
const SELECT=`SELECT source_as_of,b2_sha256,payload_sha256,original_generated_at,proof_schema
FROM website_verified_gri_snapshot_history
WHERE b2_sha256=? AND payload_sha256=? AND original_generated_at=?
  AND proof_schema='geomacro.public-global-risk-live-proof.v1'
LIMIT 2`;
export async function inspectExistingGriHistoricalRow({
  env=process.env,now=new Date(),
  getAnchor=readGlobalRiskB2Anchor,
  query,
}={}){
 if(env.GEOMACRO_GRI_RESTORE_WEBSITE_HISTORY!=="1"||
    env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="historical_gri_version_recovery"||
    env.B2_REQUEST_BUDGET!=="4")
   throw Error("GRI_HISTORY_EXISTING_READONLY_GOVERNANCE_REQUIRED");
 for(const k of ["SUPABASE_URL","SUPABASE_DB_URL","APP_SUPABASE_URL",
   "APP_SUPABASE_DB_URL","SUPABASE_SERVICE_ROLE_KEY",
   "APP_SUPABASE_SERVICE_ROLE_KEY","COINBASE_API_KEY",
   "COINBASE_X402_MAINNET_ACK","GEOMACRO_COMMERCIAL_LAUNCH_ACK"])
   if(env[k])throw Error("GRI_HISTORY_EXISTING_NO_FUNDS_OR_SUPABASE_REQUIRED");
 const anchor=await getAnchor();
 classifyPinnedGlobalRiskAnchor({anchor,now});
 if(!HASH.test(String(anchor.b2_sha256??""))||
    !HASH.test(String(anchor.payload_sha256??"")))throw Error(FAIL);
 const read=query??existingD1HistoryWriter(env);
 const rows=await read(SELECT,[anchor.b2_sha256,anchor.payload_sha256,anchor.generated_at]);
 if(!Array.isArray(rows)||rows.length>1)throw Error(FAIL);
 const existing=rows.length===1;
 if(existing){
   const r=rows[0],asOf=Date.parse(String(r.source_as_of??""));
   if(r.b2_sha256!==anchor.b2_sha256||
      r.payload_sha256!==anchor.payload_sha256||
      r.original_generated_at!==anchor.generated_at||
      r.proof_schema!=="geomacro.public-global-risk-live-proof.v1"||
      !Number.isFinite(asOf)||asOf>Date.parse(anchor.generated_at)+5*60_000||
      asOf>now.getTime())throw Error(FAIL);
 }
 return Object.freeze({
   schema:"geomacro.gri-pinned-history-existing-d1-readonly.v1",
   status:existing?"PINNED_HISTORICAL_D1_ROW_PRESENT_NO_B2_REPLAY":
     "PINNED_HISTORICAL_D1_ROW_ABSENT_REQUIRES_B2_PROOF",
   already_present:existing,
   historical_b2_readback_now_verified:false,
   multi_snapshot_lineage_now_verified:false,
   current_gri_signed:false,current_scored_gri_published:false,
   historical_row_mutated:false,source_clock_refreshed:false,
   b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
   const receipt=await inspectExistingGriHistoricalRow();
   if(process.env.GITHUB_OUTPUT)
     appendFileSync(process.env.GITHUB_OUTPUT,
       "already_restored="+(receipt.already_present?"true":"false")+"\n");
   console.log(JSON.stringify(receipt));
 }catch{
   console.error("::error::"+FAIL);
   process.exitCode=2;
 }
}
