#!/usr/bin/env node
/**
 * #1827 production-governed source: independently replay the compact remote
 * D1 readback against the already hash/readback-verified B2 run receipt.
 *
 * No B2 GET, D1 write, Supabase, private material, settlement or payment.
 * Keeping the verifier in a real file prevents bash single-quote corruption
 * of inline node -e JavaScript (production run #38024783516).
 */
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const GOVERNED_D1_SOURCE_SCOPES = Object.freeze({
  eia_api_v2: "MACRO",
  noaa_ncei_cdo_api: "MULTI_DOMAIN",
});
const SHA=/^[a-f0-9]{64}$/u;
const EXPECTED_ROLE="historical_or_latest_native_statistical_measurements_only";
const SUMMARY_PATH="artifacts/governed-source-ingestion/verification-summary.json";
const MAX_BYTES=256 * 1024;
const REQUIRED_SOURCES=Object.keys(GOVERNED_D1_SOURCE_SCOPES);

function fail(ok,code) {
  if(!ok)throw new Error(code);
}
function validUTC(value) {
  const parsed=Date.parse(String(value??""));
  return Number.isFinite(parsed) &&
    new Date(parsed).toISOString()===value;
}

export function verifyGovernedD1CheckpointReadback(databaseResponse,summary) {
  fail(summary?.schema==="geomacro.governed-b2-first-ingestion.v2" &&
    summary?.status==="PASS" &&
    summary?.durable_payload_store==="backblaze-b2" &&
    summary?.normalized_data_store==="backblaze-b2" &&
    summary?.compact_control_store==="cloudflare-d1" &&
    summary?.supabase_dependency===false &&
    summary?.payment_performed===false &&
    summary?.destructive_change===false &&
    summary?.b2_usage?.global_account_quota_guard_enabled===true &&
    Number.isInteger(summary?.b2_usage?.requests_started) &&
    summary.b2_usage.requests_started>=0 &&
    summary.b2_usage.requests_started<=20 &&
    validUTC(summary?.ingested_at) &&
    Array.isArray(summary?.sources) &&
    summary.sources.length===REQUIRED_SOURCES.length,
    "GOVERNED_D1_ORIGINAL_VERIFIED_B2_SUMMARY_REQUIRED");

  const envelope=Array.isArray(databaseResponse)
    ? databaseResponse
    : Array.isArray(databaseResponse?.result)
      ? databaseResponse.result : [databaseResponse];
  const rows=envelope.flatMap(item=>
    Array.isArray(item?.results)?item.results:[]);
  fail(rows.length===REQUIRED_SOURCES.length,
    "GOVERNED_D1_CHECKPOINT_COUNT_MISMATCH");

  const pending=new Set(REQUIRED_SOURCES);
  const sourceNames=new Set();
  for (const item of summary.sources) {
    fail(item && Object.hasOwn(GOVERNED_D1_SOURCE_SCOPES,item.source_id) &&
      !sourceNames.has(item.source_id),
      "GOVERNED_D1_SOURCE_LIST_INVALID");
    sourceNames.add(item.source_id);
  }

  for(const row of rows) {
    fail(row?.pipeline==="governed_source_ingestion" &&
      row?.status==="PASS" &&
      pending.has(row.scope) &&
      SHA.test(String(row.cursor??"")),
      "GOVERNED_D1_CHECKPOINT_INVALID");
    pending.delete(row.scope);
    let metadata;
    try {metadata=JSON.parse(row.metadata_json);}
    catch {throw new Error("GOVERNED_D1_CHECKPOINT_METADATA_JSON_INVALID");}
    const source=summary.sources.find(s=>s.source_id===row.scope);
    const expectedCategory=GOVERNED_D1_SOURCE_SCOPES[row.scope];
    fail(source && metadata &&
      row.cursor===source.fragment_set_sha256 &&
      metadata.fragment_set_sha256===source.fragment_set_sha256 &&
      metadata.normalized_observations===source.normalized_observations &&
      Number.isInteger(source.normalized_observations) &&
      source.normalized_observations>0 &&
      validUTC(source.earliest_source_observed_at) &&
      validUTC(source.latest_source_observed_at) &&
      Date.parse(source.latest_source_observed_at)>=
        Date.parse(source.earliest_source_observed_at) &&
      Date.parse(source.latest_source_observed_at)<=
        Date.parse(summary.ingested_at)+5*60_000 &&
      metadata.earliest_source_observed_at===
        source.earliest_source_observed_at &&
      metadata.latest_source_observed_at===
        source.latest_source_observed_at &&
      Number.isInteger(source.latest_native_observation_lag_days) &&
      source.latest_native_observation_lag_days>=0 &&
      metadata.latest_native_observation_lag_days===
        source.latest_native_observation_lag_days &&
      JSON.stringify(source.data_categories)===
        JSON.stringify([expectedCategory]) &&
      JSON.stringify(metadata.data_categories)===
        JSON.stringify([expectedCategory]) &&
      source.publisher_article_published_at_verified===false &&
      metadata.publisher_article_published_at_verified===false &&
      source.current_intelligence_available===false &&
      metadata.current_intelligence_available===false &&
      source.current_commercial_signal_eligible===false &&
      metadata.current_commercial_signal_eligible===false &&
      source.checked_at_is_not_source_observed_at===true &&
      metadata.checked_at_is_not_source_observed_at===true &&
      source.source_data_role===EXPECTED_ROLE &&
      metadata.source_data_role===EXPECTED_ROLE,
      "GOVERNED_D1_STATISTIC_SOURCE_CLOCK_OR_CATEGORY_MISMATCH");

    fail(metadata.durable_payload_store==="backblaze-b2" &&
      metadata.normalized_data_store==="backblaze-b2" &&
      metadata.compact_control_store==="cloudflare-d1" &&
      metadata.storage_mode==="gzip-fragment-bundles" &&
      metadata.compression==="gzip-9" &&
      Number.isInteger(metadata.fragment_count) &&
      metadata.fragment_count>=1 &&
      metadata.fragment_count===source.fragment_count &&
      metadata.b2_storage_metadata_verified===true &&
      metadata.b2_local_restore_verified===true &&
      metadata.b2_full_body_readback_verified===true &&
      metadata.verification_mode==="signed-put-full-readback-sha256" &&
      metadata.normalized_observations_durable_in_b2===true &&
      metadata.supabase_dependency===false &&
      SHA.test(String(metadata.fragment_set_sha256??"")) &&
      Array.isArray(metadata.fragments) &&
      metadata.fragments.length===source.fragments.length &&
      metadata.fragments.every((fragment,i)=>
        fragment.key===source.fragments[i]?.key &&
        fragment.sha256===source.fragments[i]?.sha256 &&
        SHA.test(String(fragment.sha256??"")) &&
        String(fragment.key).startsWith(
          "geomacro-evidence/v1/observation-bundles/") &&
        String(fragment.key).endsWith(".json.gz")),
      "GOVERNED_D1_B2_VERIFIED_FRAGMENT_METADATA_MISMATCH");
  }
  fail(pending.size===0,"GOVERNED_D1_CHECKPOINT_SCOPE_MISSING");
  return {
    ok:true,
    schema:"geomacro.governed-source-d1-readback-proof.v1",
    source_count:REQUIRED_SOURCES.length,
    private_archive_verified:true,
    source_news_publication_verified:false,
    current_intelligence_available:false,
    commercial_eligible:false,
    supabase_writes:0,
    b2_requests:0,
    d1_writes:0,
    usdc_spent:0,
  };
}

async function main() {
  if(process.argv.length!==2)
    throw new Error("GOVERNED_D1_VERIFIER_ARGS_INVALID");
  if(statSync(SUMMARY_PATH).size>MAX_BYTES)
    throw new Error("GOVERNED_D1_VERIFIER_SUMMARY_TOO_LARGE");
  const summary=JSON.parse(readFileSync(SUMMARY_PATH,"utf8"));
  let text="";
  for await (const bytes of process.stdin) {
    text+=bytes.toString("utf8");
    if(Buffer.byteLength(text)>MAX_BYTES)
      throw new Error("GOVERNED_D1_VERIFIER_INPUT_TOO_LARGE");
  }
  const result=verifyGovernedD1CheckpointReadback(JSON.parse(text),summary);
  console.log(JSON.stringify(result));
}
if(process.argv[1] &&
   resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{
    const message=error instanceof Error?error.message:"";
    const code=/^GOVERNED_D1_[A-Z0-9_]+$/u.test(message)
      ?message:"GOVERNED_D1_READBACK_FAILED_CLOSED";
    console.error(JSON.stringify({ok:false,error:code,
      commercial_eligible:false,current_intelligence_available:false,
      b2_requests:0,d1_writes:0,supabase_writes:0,usdc_spent:0}));
    process.exitCode=1;
  });
}
