import test from "node:test";
import assert from "node:assert/strict";
import {rankedDailyD1Insights} from "../ops/capture-d1-launch-insights.mjs";
const q=(query,totalRowsRead,totalRowsWritten,numberOfTimesRun=1)=>
 ({query,totalRowsRead,totalRowsWritten,numberOfTimesRun});
test("read and write rankings are distinct and raw source SQL stays private",()=>{
 const a=q("SELECT story_json FROM website_derived_intelligence",300,0,3);
 const b=q("DELETE FROM website_derived_intelligence WHERE id=?",10,50,1);
 const c=q("SELECT * FROM pipeline_checkpoint",200,1,4);
 const r=rankedDailyD1Insights([a,c,b],[b,a,c],
  {now:new Date("2026-10-28T10:00:00.000Z")});
 assert.equal(r.top_read[0].total_rows_read,300);
 assert.equal(r.top_write[0].total_rows_written,50);
 assert.equal(r.top_read[0].executions,3);
 assert.equal(r.provider_window,"ROLLING_1_DAY_NOT_UTC_DAILY_QUOTA");
 assert.equal(JSON.stringify(r).includes("SELECT story_json"),false);
 assert.equal(JSON.stringify(r).includes("DELETE FROM"),false);
});
test("malformed and duplicate provider insights fail closed",()=>{
 const a=q("SELECT x FROM some_table",1,0);
 assert.throws(()=>rankedDailyD1Insights([a,a],[a]),/DUPLICATE/);
 assert.throws(()=>rankedDailyD1Insights([],[a]),/PROVIDER_INVALID/);
 assert.throws(()=>rankedDailyD1Insights([a],[{...a,totalRowsRead:-5}]),/PROVIDER_SCHEMA_INVALID/);
});
