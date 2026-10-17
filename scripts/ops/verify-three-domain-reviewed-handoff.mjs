#!/usr/bin/env bun
/**
 * Manual-only, zero-network publication-input verification/handoff. Source
 * packages, independent reviewer signatures, country certificates and B2
 * archive bytes must already exist and be independently retrieved/pinned.
 * This DOES NOT create any reviewer signature or discover a source.
 */
import {readFileSync,mkdirSync,writeFileSync,statSync} from "node:fs";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
import {approvedIndependentReviewerFromEnv} from "../../src/lib/independent-reviewer-authority.server.ts";
import {verifyThreeDomainReviewerHandoff} from "../lib/three-domain-reviewed-handoff.mjs";

const fail=code=>{throw Error("THREE_DOMAIN_HANDOFF_"+code);};
const sha=x=>createHash("sha256").update(x).digest("hex");
function readPinned(name,max,encoding="json"){
  const file=process.env[name+"_PATH"];
  const pin=process.env[name+"_SHA256"];
  if(!file||!/^[a-f0-9]{64}$/.test(pin??"")||statSync(file).size>max)
    fail(name+"_PIN_REQUIRED");
  const bytes=readFileSync(file);
  if(sha(bytes)!==pin)fail(name+"_HASH_MISMATCH");
  if(encoding==="binary")return bytes;
  try{return JSON.parse(bytes.toString("utf8"))}
  catch{fail(name+"_JSON_INVALID");}
}
function main(){
  if(process.argv.length!==3||process.argv[2]!=="--verified-review-only")
    fail("EXPLICIT_REVIEW_MODE_REQUIRED");
  for(const key of ["SUPABASE_DB_URL","APP_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY","APP_SUPABASE_SERVICE_ROLE_KEY",
    "B2_KEY_ID","B2_APPLICATION_KEY","GEOMACRO_COMMERCE_LEDGER_TOKEN",
    "COINBASE_API_KEY","CLOUDFLARE_API_TOKEN"])
    if(process.env[key])fail("NETWORK_OR_PAYMENT_CREDENTIAL_FORBIDDEN");
  const pem=approvedIndependentReviewerFromEnv();
  if(!pem)fail("INDEPENDENT_REVIEWER_PIN_UNAVAILABLE");
  const results=verifyThreeDomainReviewerHandoff({
    intelligence:readPinned("GEOMACRO_REVIEWED_INTELLIGENCE",1024*1024),
    reviewedGri:readPinned("GEOMACRO_REVIEWED_GRI",1024*1024),
    countryCategoryCertificates:readPinned("GEOMACRO_COUNTRY_CERTIFICATES",512*1024),
    historicalB2Bytes:readPinned("GEOMACRO_HISTORICAL_B2_READBACK",2*1024*1024,"binary"),
    trustedReviewerPublicKeyPem:pem,
  });
  // Private publisher handoff; these files contain signed private evidence.
  // Never upload as public GitHub artifacts, website, logs or telemetry.
  const dir=resolve("artifacts/private-verified-three-domain-handoff");
  mkdirSync(dir,{mode:0o700,recursive:true});
  writeFileSync(join(dir,results.receipt.intelligence_input_sha256+".intelligence.json"),
    results.intelligenceInput,{mode:0o600,flag:"wx"});
  writeFileSync(join(dir,results.receipt.gri_input_sha256+".gri.json"),
    results.reviewedGriInput,{mode:0o600,flag:"wx"});
  return results.receipt;
}
try{console.log(JSON.stringify(main()))}
catch{console.error("THREE_DOMAIN_HANDOFF_FAILED_CLOSED");process.exitCode=2;}
