#!/usr/bin/env node
/**
 * Optional protected-main ciphertext mirror. No D1, KV, B2, paid or original
 * publisher reads. Missing R2 provisioning => require no mirror, GH persists.
 */
import {existsSync,readFileSync} from "node:fs";
import {mirrorEncryptedOsintToPrivateR2} from "../lib/private-osint-r2-encrypted-escrow.mjs";
import {verifyPrivateR2FreeLifecycle} from "../lib/private-osint-free-r2-guard.mjs";

if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 process.env.GITHUB_EVENT_NAME==="pull_request"||
 process.env.GEOMACRO_OSINT_SPOOL_ADMISSION!=="HELD")
 throw Error("PRIVATE_OSINT_R2_PROTECTED_HELD_MAIN_ONLY");

const path="/tmp/geomacro-encrypted-held-spool/sealed.json";
if(!existsSync(path)){
 console.log(JSON.stringify({schema:"geomacro.private-osint-r2-escrow-job.v1",
  state:"NO_ELIGIBLE_CIPHERTEXT",r2_requests:0,d1_queries:0}));
}else{
 const body=readFileSync(path,"utf8");
 if(body.length>3_500_000)throw Error("PRIVATE_OSINT_R2_LOCAL_FILE_OVERSIZE");
 // Read-only proof of prefix deletion <=48h. Without a verified lifecycle,
 // leave the ciphertext in the existing short-lived GitHub artifact and
 // make ZERO metered private R2 PUT/GET requests.
 const lifecycle=await verifyPrivateR2FreeLifecycle();
 const receipt=await mirrorEncryptedOsintToPrivateR2({
  envelope:JSON.parse(body),
  root:process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN,
 });
 console.log(JSON.stringify({...receipt,free_r2_lifecycle_verified:lifecycle.lifecycle_rule_verified,
  other_account_r2_usage_verified:false,free_tier_zero_invoice_guaranteed:false}));
}
