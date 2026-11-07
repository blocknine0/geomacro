#!/usr/bin/env node
/**
 * Sanitized Cloudflare D1 query-insights summary. Source query text never
 * leaves this process; no bound parameters, raw SQL, source names or tables
 * are published into action logs. Experimental Wrangler JSON can change:
 * mismatches MUST fail, never invent read-pressure attribution.
 */
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

const integer=n=>Number.isSafeInteger(n)&&n>=0;
// Coarse workstream attribution only: no table names, raw SQL, URLs,
// publisher names or bound parameter values leave this process. Matches are
// heuristic and MUST NOT be treated as a certified source of write attribution.
export function classifyD1QueryWorkstream(query){
 if(typeof query!=="string"||query.length<1||query.length>32000)
  throw Error("D1_INSIGHTS_QUERY_CLASSIFICATION_INVALID");
 const t=query.toLowerCase();
 const groups=[
  ["SOURCE_POLL",/\b(?:source_registry|p1_source_poll_bundles|p0a_source|source_poll_dispatch_mutex)\b/u],
  ["ARCHIVE_B2",/\b(?:p0b_archive_outbox|phase2h_private_raw_news|b2_account_quota|b2_archive|ingestion_spool_queue)\b/u],
  ["RISK_GATE",/\b(?:risk_observations|unverified_observations|progressive_risk_gate|risk_gap_enrichment|unified_risk_snapshots)\b/u],
  ["PUBLIC_CACHE",/\b(?:ask_public_model_cache|public_free_d1_cache|materialized_public|public_news_cache)\b/u],
  ["SIGNING_GRO",/\b(?:gro_evidence|signed_gro|risk_index_signing|gri_)\b/u],
 ];
 return groups.find(([_,pattern])=>pattern.test(t))?.[0]??"OTHER";
}
export function summarizeD1ReadInsights(input,{top=10,sortBy="reads"}={}){
  if(!Array.isArray(input)||input.length<1||input.length>200||
     !Number.isSafeInteger(top)||top<1||top>25||
     !["reads","writes"].includes(sortBy))
    throw Error("D1_INSIGHTS_PROVIDER_SCHEMA_UNVERIFIED");
  const seen=new Set();
  const rows=input.map(item=>{
    if(typeof item?.query!=="string"||item.query.length<1||item.query.length>32_000||
       !integer(item?.totalRowsRead)||!integer(item?.totalRowsWritten)||
       !integer(item?.numberOfTimesRun))
      throw Error("D1_INSIGHTS_PROVIDER_SCHEMA_UNVERIFIED");
    const fingerprint=createHash("sha256").update(item.query).digest("hex");
    if(seen.has(fingerprint))throw Error("D1_INSIGHTS_DUPLICATE_FINGERPRINT");
    seen.add(fingerprint);
    return {
      query_sha256:fingerprint,
      workstream_heuristic:classifyD1QueryWorkstream(item.query),
      total_rows_read:item.totalRowsRead,
      total_rows_written:item.totalRowsWritten,
      executions:item.numberOfTimesRun,
    };
  }).sort((a,b)=>
     (sortBy==="writes"?b.total_rows_written-a.total_rows_written:
       b.total_rows_read-a.total_rows_read)||
     a.query_sha256.localeCompare(b.query_sha256)).slice(0,top);
  return Object.freeze({
    schema:"geomacro.d1-reads-pressure-hashed.v1",
    data_is_provider_insights_not_production_write_proof:true,
    raw_query_sql_logged:false,
    bound_parameters_logged:false,
    query_count_observed:input.length,
    sort_by:sortBy,
    ...(sortBy==="writes"?{top_rows_written:rows}:{top_rows_read:rows}),
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    if(process.argv.length<3||process.argv.length>4)throw Error("D1_INSIGHTS_FILE_REQUIRED");
    const data=JSON.parse(readFileSync(process.argv[2],"utf8"));
    const sortBy=process.argv[3]??"reads";
    console.log(JSON.stringify(summarizeD1ReadInsights(data,{sortBy})));
  }catch{
    console.error("D1_READ_PRESSURE_INSIGHTS_UNVERIFIED");
    process.exitCode=2;
  }
}
