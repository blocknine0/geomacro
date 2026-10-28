#!/usr/bin/env node
/**
 * Sanitize Cloudflare Wrangler D1 Insight query text inside protected runner.
 * The result is a SHA-only ranked query/workflow-attribution candidate list;
 * Insights covers a rolling 1d window, NOT an account-wide UTC quota day.
 */
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {attributeD1ReadInsights} from "./attribute-d1-query-insights.mjs";
const check=rows=>{
 if(!Array.isArray(rows)||rows.length<1||rows.length>150)
  throw Error("D1_DAILY_INSIGHTS_PROVIDER_INVALID");
 const seen=new Set();
 return rows.map(row=>{
  const summary=attributeD1ReadInsights([row],{top:1}).top_rows_read[0];
  if(seen.has(summary.query_sha256))throw Error("D1_DAILY_INSIGHTS_DUPLICATE_QUERY");
  seen.add(summary.query_sha256);
  return summary;
 });
};
export function rankedDailyD1Insights(readData,writeData,{now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw Error("D1_DAILY_INSIGHTS_CLOCK_INVALID");
 const reads=check(readData),writes=check(writeData);
 return Object.freeze({
  schema:"geomacro.d1-insights-read-write-hotspots.v1",
  observed_at_utc:now.toISOString(),
  provider_window:"ROLLING_1_DAY_NOT_UTC_DAILY_QUOTA",
  provider_database_scope:"geomacro-control-plane",
  account_wide_d1_totals_not_included:true,
  raw_sql_exported:false,bound_parameters_exported:false,
  exact_workflow_attribution_only_when_full_sql_match:true,
  read_query_count_observed:reads.length,write_query_count_observed:writes.length,
  top_read:reads.sort((a,b)=>b.total_rows_read-a.total_rows_read||
    a.query_sha256.localeCompare(b.query_sha256)).slice(0,25),
  top_write:writes.sort((a,b)=>b.total_rows_written-a.total_rows_written||
    a.query_sha256.localeCompare(b.query_sha256)).slice(0,25),
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==4)throw Error("D1_DAILY_INSIGHTS_FILES_REQUIRED");
  const data=rankedDailyD1Insights(
   JSON.parse(readFileSync(process.argv[2],"utf8")),
   JSON.parse(readFileSync(process.argv[3],"utf8")));
  mkdirSync("artifacts/d1-launch-72h",{recursive:true});
  writeFileSync("artifacts/d1-launch-72h/query-insights.json",
   JSON.stringify(data,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify({schema:data.schema,observed_at_utc:data.observed_at_utc,
   query_read_count:data.read_query_count_observed,
   query_write_count:data.write_query_count_observed,
   first_read:data.top_read[0]?.query_sha256,
   first_write:data.top_write[0]?.query_sha256,
   exact_attributions:data.top_read.filter(x=>x.status==="EXACT_SOURCE_STATEMENT").length}));
 }catch{
  console.error("D1_DAILY_QUERY_INSIGHTS_UNVERIFIED");process.exitCode=2;
 }
}
