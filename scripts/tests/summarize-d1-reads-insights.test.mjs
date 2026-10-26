import test from "node:test";
import assert from "node:assert/strict";
import {summarizeD1ReadInsights} from "../ops/summarize-d1-reads-insights.mjs";

test("D1 Insights report identifies most expensive queries by SHA, never SQL",()=>{
 const raw=[
  {query:"SELECT * FROM secret_provider_records WHERE name='private'",totalRowsRead:15000,totalRowsWritten:0,numberOfTimesRun:10},
  {query:"SELECT id FROM public_cache LIMIT 1",totalRowsRead:5,totalRowsWritten:0,numberOfTimesRun:3},
 ];
 const output=summarizeD1ReadInsights(raw,{top:2});
 assert.equal(output.top_rows_read[0].total_rows_read,15000);
 assert.match(output.top_rows_read[0].query_sha256,/^[a-f0-9]{64}$/);
 assert.equal(output.raw_query_sql_logged,false);
 assert.equal(output.bound_parameters_logged,false);
 const exposed=JSON.stringify(output);
 assert.ok(!exposed.includes("secret_provider_records"));
 assert.ok(!exposed.includes("private"));
 assert.ok(!exposed.includes("SELECT"));
});
test("unknown or duplicate Wrangler Insights schema fails closed",()=>{
 assert.throws(()=>summarizeD1ReadInsights([]),/UNVERIFIED/);
 assert.throws(()=>summarizeD1ReadInsights([{query:"SELECT 1",totalRowsRead:-1,totalRowsWritten:0,numberOfTimesRun:1}]),/UNVERIFIED/);
 assert.throws(()=>summarizeD1ReadInsights([{query:"SELECT 1",totalRowsRead:1,totalRowsWritten:0,numberOfTimesRun:1},{query:"SELECT 1",totalRowsRead:1,totalRowsWritten:0,numberOfTimesRun:1}]),/DUPLICATE/);
 assert.throws(()=>summarizeD1ReadInsights([{query:"",totalRowsRead:1,totalRowsWritten:0,numberOfTimesRun:1}]),/UNVERIFIED/);
});
