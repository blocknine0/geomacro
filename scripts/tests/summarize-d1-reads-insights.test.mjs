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

test("top D1 write hotspots are sorted by provider physical rows, without raw SQL",()=>{
 const raw=[
  {query:"INSERT INTO confidential_batch VALUES (?)",totalRowsRead:30,totalRowsWritten:9000,numberOfTimesRun:80},
  {query:"SELECT * FROM private_source",totalRowsRead:30000,totalRowsWritten:0,numberOfTimesRun:200},
 ];
 const result=summarizeD1ReadInsights(raw,{top:2,sortBy:"writes"});
 assert.equal(result.sort_by,"writes");
 assert.equal(result.top_rows_written[0].total_rows_written,9000);
 assert.equal(result.top_rows_written[1].total_rows_written,0);
 assert.equal(result.top_rows_read,undefined);
 assert.ok(!JSON.stringify(result).includes("confidential_batch"));
 assert.throws(()=>summarizeD1ReadInsights(raw,{sortBy:"unknown"}),/UNVERIFIED/);
});

test("query workstream labels are coarse, never table names or sensitive SQL",()=>{
 const input=[
  {query:"UPDATE source_registry SET last_polled_at=? WHERE source_id=?",totalRowsRead:4,totalRowsWritten:18,numberOfTimesRun:3},
  {query:"SELECT * FROM phase2h_private_raw_news WHERE item_id=?",totalRowsRead:100,totalRowsWritten:0,numberOfTimesRun:2},
  {query:"SELECT * FROM unverified_observations WHERE entity_id=?",totalRowsRead:20,totalRowsWritten:0,numberOfTimesRun:1},
  {query:"SELECT * FROM secret_custom_table WHERE api_secret='private'",totalRowsRead:10,totalRowsWritten:0,numberOfTimesRun:1},
 ];
 const out=summarizeD1ReadInsights(input,{top:4,sortBy:"writes"});
 assert.deepEqual(out.top_rows_written.map(x=>x.workstream_heuristic),
  ["SOURCE_POLL","ARCHIVE_B2","RISK_GATE","OTHER"]);
 const text=JSON.stringify(out);
 assert.ok(!text.includes("source_registry"));
 assert.ok(!text.includes("phase2h_private_raw_news"));
 assert.ok(!text.includes("secret_custom_table"));
 assert.ok(!text.includes("private"));
});
