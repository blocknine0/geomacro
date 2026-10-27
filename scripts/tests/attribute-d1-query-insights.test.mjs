import test from "node:test";
import assert from "node:assert/strict";
import {attributeD1ReadInsights,CURRENT_HIGH_READ_FINGERPRINTS}
 from "../ops/attribute-d1-query-insights.mjs";
const row=(query,n=5000,executions=10)=>({query,totalRowsRead:n,totalRowsWritten:0,numberOfTimesRun:executions});
test("real SQL is kept internal and exact matching requires entire statement",()=>{
 const source="SELECT story_json, first_seen_at FROM website_derived_intelligence WHERE published_at>=? AND first_seen_at>=? ORDER BY published_at DESC, id DESC LIMIT 251 OFFSET ?";
 const output=attributeD1ReadInsights([row(source)]);
 assert.equal(output.top_rows_read[0].status,"EXACT_SOURCE_STATEMENT");
 assert.equal(output.top_rows_read[0].query_id,"PUBLIC_WEBSITE_DERIVED_PAGE_V1");
 assert.equal(output.top_rows_read[0].rows_read_per_execution,500);
 assert.equal(output.raw_query_sql_logged,false);
 assert.equal(output.raw_sql_exported,false);
 assert.ok(!JSON.stringify(output).includes(source));
});
test("same table with changed WHERE is explicitly not exact attribution",()=>{
 const altered="SELECT story_json, first_seen_at FROM website_derived_intelligence WHERE id LIKE 'secret' AND published_at>=? ORDER BY published_at DESC LIMIT 9999";
 const output=attributeD1ReadInsights([row(altered)]);
 assert.equal(output.top_rows_read[0].status,"TABLE_FAMILY_ONLY");
 assert.equal(output.top_rows_read[0].callsite,null);
 assert.ok(!JSON.stringify(output).includes("secret"));
});
test("an unknown table and privacy-sensitive query cannot leak in public report",()=>{
 const x=attributeD1ReadInsights([row("SELECT * FROM super_private_users WHERE password='abc'")]);
 assert.equal(x.top_rows_read[0].status,"UNATTRIBUTED");
 assert.equal(x.top_rows_read[0].query_id,null);
 assert.ok(!JSON.stringify(x).includes("password"));
 assert.ok(!JSON.stringify(x).includes("super_private"));
});
test("provider schema mismatch and duplicate fingerprint are fail-closed",()=>{
 assert.throws(()=>attributeD1ReadInsights([]),/INVALID/);
 assert.throws(()=>attributeD1ReadInsights([row("SELECT 1",-1)]),/INVALID/);
 assert.throws(()=>attributeD1ReadInsights([row("SELECT 1"),row("SELECT 1")]),/DUPLICATE/);
 assert.equal(CURRENT_HIGH_READ_FINGERPRINTS.length,2);
});

test("SQL shape identifies hot query operation without leaking private SQL",()=>{
 const raw="DELETE FROM private_osint_news_25h WHERE item_id IN (SELECT item_id FROM private_osint_news_25h ORDER BY native_feed_published_at ASC LIMIT MAX(0,(SELECT COUNT(*) FROM private_osint_news_25h)-4000))";
 const report=attributeD1ReadInsights([row(raw,5000,1)]);
 const shape=report.top_rows_read[0].sql_shape;
 assert.equal(shape.statement_kind,"DELETE");
 assert.equal(shape.has_count_star,true);
 assert.equal(shape.has_subquery_count,true);
 assert.equal(shape.has_order_by,true);
 assert.equal(shape.has_nested_select,true);
 assert.equal(shape.has_limit,true);
 const json=JSON.stringify(report);
 assert.ok(!json.includes("private_osint_news_25h"));
 assert.ok(!json.includes("native_feed_published_at"));
});
test("public derived scan shape distinguishes SELECT OFFSET and no SQL exposure",()=>{
 const raw="SELECT story_json,first_seen_at FROM website_derived_intelligence WHERE published_at>=? ORDER BY published_at DESC LIMIT 251 OFFSET ?";
 const shape=attributeD1ReadInsights([row(raw,400,1)]).top_rows_read[0].sql_shape;
 assert.equal(shape.statement_kind,"SELECT");
 assert.equal(shape.has_order_by,true);
 assert.equal(shape.has_offset,true);
 assert.equal(shape.has_rowid_offset,true);
 assert.equal(shape.has_subquery_count,false);
});
