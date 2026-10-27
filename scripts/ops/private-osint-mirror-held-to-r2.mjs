#!/usr/bin/env node
/**
 * Optional protected-main ciphertext mirror. No D1, KV, B2, paid or original
 * publisher reads. Missing R2 provisioning => require no mirror, GH persists.
 */
import {existsSync,readFileSync} from "node:fs";
import {mirrorEncryptedOsintToPrivateR2} from "../lib/private-osint-r2-encrypted-escrow.mjs";

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
 const receipt=await mirrorEncryptedOsintToPrivateR2({
  envelope:JSON.parse(body),
  root:process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN,
 });
 console.log(JSON.stringify(receipt));
}
