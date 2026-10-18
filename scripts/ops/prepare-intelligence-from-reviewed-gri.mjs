#!/usr/bin/env bun
import {readFileSync,writeFileSync,mkdirSync,statSync,appendFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {qualifySignedGriForCurrentIntelligence} from "../lib/gri-reviewed-to-current-intelligence.mjs";
import {approvedIndependentReviewerFromEnv} from "../../src/lib/independent-reviewer-authority.server.ts";

const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
const fail=code=>{throw Error("GRI_INTELLIGENCE_CONTINUATION_"+code)};
const HASH=/^[a-f0-9]{64}$/u;
try{
  if(process.argv.length!==3 || process.argv[2]!=="--after-verified-gri" ||
     !process.env.GEOMACRO_GRI_REVIEWED_INPUT ||
     !HASH.test(process.env.GEOMACRO_GRI_REVIEWED_INPUT_SHA256??"") ||
     process.env.B2_ACCOUNT_QUOTA_REQUIRED!=="1" ||
     !process.env.D1_DATABASE_ID ||
     process.env.SUPABASE_URL||process.env.SUPABASE_DB_URL||
     process.env.APP_SUPABASE_URL||process.env.APP_SUPABASE_SERVICE_ROLE_KEY||
     process.env.COINBASE_X402_MAINNET_ACK)
    fail("PINNED_NO_FUNDS_RUNTIME_REQUIRED");
  const path=process.env.GEOMACRO_GRI_REVIEWED_INPUT;
  const st=statSync(path);
  if(!st.isFile()||st.size<100||st.size>1024*1024||(st.mode&0o077)!==0)
    fail("PRIVATE_REVIEWED_FILE_MODE_INVALID");
  const raw=readFileSync(path);
  if(digest(raw)!==process.env.GEOMACRO_GRI_REVIEWED_INPUT_SHA256)
    fail("EXACT_REVIEWED_INPUT_SHA_MISMATCH");
  const publicKey=approvedIndependentReviewerFromEnv();
  if(!publicKey)fail("PINNED_INDEPENDENT_REVIEWER_REQUIRED");
  const result=qualifySignedGriForCurrentIntelligence({
    reviewed:JSON.parse(raw.toString("utf8")),
    now:new Date(),trustedReviewerPublicKeyPem:publicKey,
  });
  // Only a minimal NOT-READY code is printed; source titles/URLs, reviewer
  // details, signatures and rights papers are never echoed.
  if(!result.ready){
    console.log(JSON.stringify({schema:"geomacro.reviewed-gri-to-intelligence.v1",
      ready:false,reason:result.reason,payment_executed:false,
      b2_writes:0,d1_writes:0,supabase_requests:0}));
    if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,"ready=false\n");
  }else{
    mkdirSync("artifacts/private-gri-intelligence",{recursive:true,mode:0o700});
    const bytes=Buffer.from(JSON.stringify({rows:result.rows,eventPackages:result.eventPackages}));
    const pin=digest(bytes);
    const dest="artifacts/private-gri-intelligence/"+pin+".json";
    writeFileSync(dest,bytes,{flag:"wx",mode:0o600});
    if(!process.env.GITHUB_ENV||!process.env.GITHUB_OUTPUT)
      fail("PROTECTED_ACTIONS_ENVIRONMENT_REQUIRED");
    appendFileSync(process.env.GITHUB_ENV,
      "GEOMACRO_QUALIFIED_INTELLIGENCE_INPUT="+dest+"\n"+
      "GEOMACRO_QUALIFIED_INTELLIGENCE_SHA256="+pin+"\n");
    appendFileSync(process.env.GITHUB_OUTPUT,"ready=true\n");
    console.log(JSON.stringify({schema:"geomacro.reviewed-gri-to-intelligence.v1",
      ready:true,exact_private_derived_input_sha256:pin,
      current_three_domain_count:result.rows.length,
      independent_rights_receipt_sha256:result.qualifying_receipt_sha256,
      raw_provider_material_logged:false,payment_executed:false,
      b2_writes:0,d1_writes:0,supabase_requests:0}));
  }
}catch{
  console.error("GRI_INTELLIGENCE_CONTINUATION_FAILED_CLOSED");
  process.exitCode=2;
}
