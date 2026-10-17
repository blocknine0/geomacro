#!/usr/bin/env node
/**
 * #1827: Supabase-free bridge from the independently read-back D1 ORIGINAL
 * article pulse to the existing canonical, PRIVATE scoring workflow.
 * An observation is NOT event verification, legal clearance, a signed GRO
 * or permission to charge. New fingerprints only authorize a bounded
 * private classifier attempt; all publication gates remain separate.
 */
import { readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA="geomacro.private-30m-source-pulse-d1-write-receipt.v1";
const MAX_AGE_MS=15*60*1000;
const MAX_NEW_FINGERPRINTS=240;
const ISO=/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;

export function evaluatePulsePrivateScoringTrigger(receipt,now=new Date()) {
  const at=now instanceof Date?now.getTime():NaN;
  const checked=typeof receipt?.checked_at==="string"&&ISO.test(receipt.checked_at)
    ?Date.parse(receipt.checked_at):NaN;
  const count=receipt?.new_private_original_article_fingerprints;
  // Authoritative current per-category D1 readback selector, including the
  // single bounded unfinished SHA retry. Legacy receipts retain old behavior.
  const selected=receipt?.selected_private_classifier_ref_count??count;
  const retryCount=receipt?.selected_private_classifier_retry_count??0;
  if (!Number.isFinite(at) || !Number.isFinite(checked) ||
      checked>at+30_000 || at-checked>MAX_AGE_MS ||
      receipt?.schema!==SCHEMA ||
      receipt?.rows_written!==3 ||
      receipt?.d1_readback_verified!==true ||
      receipt?.original_article_identity_is_risk_event!==false ||
      receipt?.source_current_scored_intelligence_verified!==false ||
      receipt?.b2_requests!==0 || receipt?.supabase_requests!==0 ||
      receipt?.payment_performed!==false ||
      !Number.isSafeInteger(count) || count<0 || count>MAX_NEW_FINGERPRINTS ||
      !Number.isSafeInteger(selected) || selected<0 || selected>3 ||
      !Number.isSafeInteger(retryCount) || retryCount<0 || retryCount>selected ||
      !Number.isSafeInteger(receipt?.repeated_private_original_article_fingerprints) ||
      receipt.repeated_private_original_article_fingerprints<0 ||
      receipt.repeated_private_original_article_fingerprints>MAX_NEW_FINGERPRINTS) {
    throw new Error("PRIVATE_SCORING_PULSE_D1_PROOF_INVALID");
  }
  return Object.freeze({
    private_scoring_needed:selected>0,
    new_original_fingerprints:count,
    selected_classifier_refs:selected,
    selected_retries:retryCount,
    status:selected>0?"D1_PRIVATE_ORIGINALS_CLAIM_AND_RECHECK":
      "NO_NEW_PRIVATE_ORIGINALS_NO_MODEL_OR_B2_REQUESTS",
    independently_verified_current_intelligence:false,
    public_published:false,commercial_eligible:false,
    supabase_writes:0,payment_performed:false,
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if(process.argv.length!==2 || !process.env.GITHUB_OUTPUT)
      throw new Error("PRIVATE_SCORING_TRIGGER_GITHUB_CONTEXT_REQUIRED");
    const bytes=readFileSync(
      "artifacts/private-intake/three-domain-30m-d1-readback.json");
    if(bytes.byteLength>16*1024)
      throw new Error("PRIVATE_SCORING_PULSE_D1_PROOF_TOO_LARGE");
    const verdict=evaluatePulsePrivateScoringTrigger(JSON.parse(bytes.toString("utf8")));
    // Output a constant boolean only. No source records, private refs,
    // headlines, original URLs or model outputs enter Actions job outputs.
    appendFileSync(process.env.GITHUB_OUTPUT,
      "private_scoring_needed="+String(verdict.private_scoring_needed)+"\n");
    console.log(JSON.stringify(verdict));
  }catch{
    console.error("::error::PRIVATE_SCORING_PULSE_D1_PROOF_INVALID");
    process.exitCode=2;
  }
}
