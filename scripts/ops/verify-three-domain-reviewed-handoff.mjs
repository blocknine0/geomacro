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
import {prepareImmutableReviewedGriHandoff} from "../lib/gri-reviewed-immutable-b2-handoff.mjs";

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
  const mode=process.argv[2];
  if(process.argv.length!==3||!["--verified-review-only","--prepare-immutable-b2"].includes(mode))
    fail("EXPLICIT_REVIEW_MODE_REQUIRED");
  process.umask(0o077);
  for(const key of ["SUPABASE_DB_URL","APP_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY","APP_SUPABASE_SERVICE_ROLE_KEY",
    "B2_KEY_ID","B2_APPLICATION_KEY","GEOMACRO_COMMERCE_LEDGER_TOKEN",
    "COINBASE_API_KEY","CLOUDFLARE_API_TOKEN"])
    if(process.env[key])fail("NETWORK_OR_PAYMENT_CREDENTIAL_FORBIDDEN");
  const pem=approvedIndependentReviewerFromEnv();
  if(!pem)fail("INDEPENDENT_REVIEWER_PIN_UNAVAILABLE");
  const intelligence=readPinned("GEOMACRO_REVIEWED_INTELLIGENCE",1024*1024);
  const reviewedGri=readPinned("GEOMACRO_REVIEWED_GRI",1024*1024);
  const countryCategoryCertificates=readPinned("GEOMACRO_COUNTRY_CERTIFICATES",512*1024);
  const historicalB2Bytes=readPinned("GEOMACRO_HISTORICAL_B2_READBACK",2*1024*1024,"binary");
  const results=verifyThreeDomainReviewerHandoff({
    intelligence,reviewedGri,countryCategoryCertificates,
    historicalB2Bytes,trustedReviewerPublicKeyPem:pem,
  });
  if(mode==="--prepare-immutable-b2"){
    // All the independent signatures, canonical scoring INPUTS, original
    // clocks, country/domain proofs and historical bytes must pass *before*
    // a private file is created. The actual scorer/publisher independently
    // rechecks history, full calculations and source/native review.
    const staged=prepareImmutableReviewedGriHandoff({
      reviewedGri,countryCategoryCertificates,historicalB2Bytes,
      trustedReviewerPublicKeyPem:pem,
    });
    const dir=resolve("artifacts/private-reviewed-gri-b2-staging");
    mkdirSync(dir,{recursive:true,mode:0o700});
    for(const file of staged.uploadFiles){
      const safe=file.sha256+".json";
      writeFileSync(join(dir,safe),file.bytes,{mode:0o600,flag:"wx"});
    }
    // Exactly two private signed JSON blobs must be placed at the two
    // immutable B2 keys. No keys, licensed originals or B2 credentials
    // are loaded by this offline operator; SHA hints never self-authorize.
    writeFileSync(join(dir,"safe-receipt.json"),
      JSON.stringify(staged.receipt,null,2),{mode:0o600,flag:"wx"});
    return staged.receipt;
  }
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
