#!/usr/bin/env node
// Read only the already-scrubbed D1 account B2 reservation receipt. Never
// contact a provider or infer external B2 billing from a D1 ledger.
import {readFileSync,appendFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

export function projectP0HotQuotaDecision(input){
  if(input?.schema!=="geomacro.b2-account-ledger-readonly.v1" ||
    typeof input.ledger_observed!=="boolean" ||
    input.provider_account_usage_verified!==false ||
    input.b2_requests!==0 || input.d1_writes!==0 ||
    input.payment_performed!==false)
    throw Error("P0_QUOTA_LEDGER_CONTRACT_INVALID");
  const remaining=(x)=>Number.isSafeInteger(x)&&x>=0?x:null;
  const get=remaining(input.remaining_reserved_get_headroom);
  const total=remaining(input.remaining_reserved_total_headroom);
  const observed=input.ledger_observed===true;
  const allows=observed&&get!==null&&total!==null&&
    get>=8&&total>=8&&input.quota_allows_full_hot_audit===true;
  return Object.freeze({
    schema:"geomacro.p0-hot-503-readonly-quota-decision.v1",
    ledger_observed:observed,
    reserved_total_headroom:total,
    reserved_get_headroom:get,
    current_hot_eight_get_headroom_present:allows,
    hold_reason:allows?null:String(input.quota_hold_reason??
      (observed?"SHARED_DAILY_B2_GET_HEADROOM_HELD":"ACCOUNT_LEDGER_NOT_OBSERVED")),
    provider_account_usage_verified:false,
    data_signed_or_restored:false,
    b2_network_requests:0,d1_writes:0,payments:0,
  });
}
export function p0QuotaSummary(x){
  return [
    "## P0 signed-hot B2 admission (read-only)",
    "",
    "| Gate | Result |",
    "|---|---|",
    "| D1 reservation ledger observed | "+x.ledger_observed+" |",
    "| Remaining GET reservations | "+(x.reserved_get_headroom??"unknown")+" |",
    "| Remaining total reservations | "+(x.reserved_total_headroom??"unknown")+" |",
    "| Current-hot 8-GET audit admissible | "+x.current_hot_eight_get_headroom_present+" |",
    "| Hold reason | "+(x.hold_reason??"none")+" |",
    "",
    "D1 reservations are NOT independently verified Backblaze provider usage.",
    "No B2 GET, B2 PUT, D1 write, signed publication, Supabase or funds.",
    "",
  ].join("\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const input=JSON.parse(readFileSync(
      "artifacts/b2-quota-readonly/account-ledger.json","utf8"));
    const decision=projectP0HotQuotaDecision(input);
    console.log(JSON.stringify(decision));
    if(process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,p0QuotaSummary(decision));
  }catch{
    console.error("::error::P0_QUOTA_DECISION_RECEIPT_INVALID");
    process.exitCode=2;
  }
}
