#!/usr/bin/env node
/**
 * Manual/private 195×3 geography × reviewed SAME-event evidence census.
 * Input MUST already contain internally attested, independently signed
 * source evidence and rights. Never log or upload the private source package.
 *
 * Usage:
 *   node scripts/ops/audit-trusted-country-event-evidence.mjs \
 *     --input=/private/signed-evidence.json \
 *     --reviewer-key=/private/trusted-reviewer-public.pem \
 *     --out=/private/new-country-evidence-ledger.json
 */
import { readFileSync, writeFileSync, statSync, lstatSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { auditTrustedCountryEventEvidence } from "../lib/trusted-country-event-evidence-census.mjs";

const ROOT=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const OUTSIDE=path=>path!==ROOT&&!path.startsWith(ROOT+sep);
const MAX_INPUT=512*1024;
const fail=()=>{throw Error("PRIVATE_COUNTRY_EVIDENCE_AUDIT_FAILED")};
function privatePath(raw){
  if(typeof raw!=="string"||raw.length<2||raw.length>1024)fail();
  const p=resolve(raw);
  if(!OUTSIDE(p))fail();
  return p;
}
function privateFile(path,maxBytes){
  const s=lstatSync(path);
  if(!s.isFile() || s.isSymbolicLink() ||s.size>maxBytes)fail();
  return readFileSync(path,"utf8");
}
function args(){
  const got=new Map();
  for(const value of process.argv.slice(2)){
    const m=/^--(input|reviewer-key|out)=(.+)$/u.exec(value);
    if(!m||got.has(m[1]))fail();
    got.set(m[1],privatePath(m[2]));
  }
  if(got.size!==3)fail();
  return got;
}
try{
  const options=args();
  const input=JSON.parse(privateFile(options.get("input"),MAX_INPUT));
  if(!input||typeof input!=="object"||Array.isArray(input)||
     !Array.isArray(input.rows)||!Array.isArray(input.eventPackages))fail();
  const trustedReviewerPublicKeyPem=privateFile(options.get("reviewer-key"),8192);
  const report=auditTrustedCountryEventEvidence({
    rows:input.rows,eventPackages:input.eventPackages,
    now:new Date(),trustedReviewerPublicKeyPem,
  });
  if(report.real_time_195x3_commercial_intelligence_verified!==false||
     report.x402_charge_authorized!==false||report.b2_writes!==0)fail();
  // Exclusive owner-readable output, never write private package to repo
  // or overwrite another attestation. No filenames, source data or keys logged.
  writeFileSync(options.get("out"),JSON.stringify(report,null,2)+"\n",
    {flag:"wx",mode:0o600});
  console.log(JSON.stringify({
    schema:report.schema, observed_at:report.observed_at,
    geographic_entities:report.canonical_geographic_entity_count,
    source_reviewed_events:report.trusted_ed25519_signed_review_count,
    signed_gro_and_b2_d1_verified:false,x402_charge_authorized:false,
  }));
}catch{
  console.error("::error::PRIVATE_COUNTRY_EVIDENCE_AUDIT_FAILED_NO_PUBLICATION");
  process.exitCode=3;
}
