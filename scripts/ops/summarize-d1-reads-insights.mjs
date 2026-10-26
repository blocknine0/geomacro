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
export function summarizeD1ReadInsights(input,{top=10}={}){
  if(!Array.isArray(input)||input.length<1||input.length>200||
     !Number.isSafeInteger(top)||top<1||top>25)
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
      total_rows_read:item.totalRowsRead,
      total_rows_written:item.totalRowsWritten,
      executions:item.numberOfTimesRun,
    };
  }).sort((a,b)=>b.total_rows_read-a.total_rows_read||
     a.query_sha256.localeCompare(b.query_sha256)).slice(0,top);
  return Object.freeze({
    schema:"geomacro.d1-reads-pressure-hashed.v1",
    data_is_provider_insights_not_production_write_proof:true,
    raw_query_sql_logged:false,
    bound_parameters_logged:false,
    query_count_observed:input.length,
    top_rows_read:rows,
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    if(process.argv.length!==3)throw Error("D1_INSIGHTS_FILE_REQUIRED");
    const data=JSON.parse(readFileSync(process.argv[2],"utf8"));
    console.log(JSON.stringify(summarizeD1ReadInsights(data)));
  }catch{
    console.error("D1_READ_PRESSURE_INSIGHTS_UNVERIFIED");
    process.exitCode=2;
  }
}
