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

test("provider DELETE NOT IN shape finds the actual historical ring callsite, NOT false exact-byte SQL attribution",()=>{
 const raw="DELETE FROM private_osint_news_25h WHERE item_id NOT IN (SELECT item_id FROM private_osint_news_25h ORDER BY native_feed_published_at DESC,item_id DESC LIMIT 4000)";
 const row={query:raw,totalRowsRead:5000,totalRowsWritten:0,numberOfTimesRun:1};
 const v=attributeD1ReadInsights([row]).top_rows_read[0];
 assert.equal(v.sql_shape.has_not_in,true);
 assert.equal(v.sql_shape.has_order_desc,true);
 assert.equal(v.sql_shape.has_limit_4000,true);
 assert.equal(v.historical_source_pattern.pattern,"HISTORIC_NOT_IN_4000_RING_RETENTION");
 assert.equal(v.historical_source_pattern.attribution,"STRUCTURAL_MATCH_NONEXACT");
 assert.equal(v.status,"TABLE_FAMILY_ONLY");
 assert.equal(v.callsite,null);
 assert.ok(!JSON.stringify(v).includes(raw));
});
test("modern indexed ring DELETE may look similar, but is not historical NOT IN",()=>{
 const query="DELETE FROM private_osint_news_25h WHERE item_id IN (SELECT item_id FROM private_osint_news_25h ORDER BY native_feed_published_at ASC,item_id ASC LIMIT MAX(0,(SELECT item_count FROM private_osint_ring_cardinality_v1 WHERE single=1)-4000))";
 const v=attributeD1ReadInsights([{query,totalRowsRead:9,totalRowsWritten:0,numberOfTimesRun:1}]).top_rows_read[0];
 assert.equal(v.sql_shape.has_not_in,false);
 assert.equal(v.historical_source_pattern,null);
});
test("paged Website journal can be traced structurally while retained as nonexact",()=>{
 const query="SELECT story_json,first_seen_at FROM website_derived_intelligence WHERE published_at>=? AND first_seen_at>=? ORDER BY published_at DESC,id DESC LIMIT 251 OFFSET ?";
 const v=attributeD1ReadInsights([{query,totalRowsRead:427,totalRowsWritten:0,numberOfTimesRun:1}]).top_rows_read[0];
 assert.equal(v.historical_source_pattern.pattern,"PAGED_WEBSITE_DERIVED_JOURNAL_READ");
 assert.equal(v.historical_source_pattern.attribution,"STRUCTURAL_MATCH_NONEXACT");
});

test('provider P0B hotspot fingerprints match actual protected source statements',async()=>{
 const {getP0bIngestionStatus}=await import('../../workers/control-plane/src/p0b-ingestion-status.mjs');
 const statements=[];
 const DB={prepare(sql){statements.push(sql);const s={bind(){return s},async first(){return sql.includes("AS sources_over")?
  {sources_over:0,queue_over:0,normalized_over:0,bundles_over:0,outbox_over:0}:{}
 },async all(){return {results:[]}}};return s;}};
 await getP0bIngestionStatus({DB},{deep:true});
 const deep=statements.find(sql=>sql.includes('bundle_journal_mismatch'));
 const report=attributeD1ReadInsights([row(deep),row('SELECT COUNT(*) AS n FROM normalized_articles'),
  row('SELECT COUNT(*) AS committed_today FROM ingestion_spool_queue WHERE d1_committed_at>=?')]);
 assert.equal(report.exact_sql_callsite_matches,3);
 assert.ok(report.top_rows_read.some(x=>x.query_sha256==='fa578c6e5f335b9765e714ce1793b95f7f6680c67353705a3a71a7b9f118ad7d'&&x.query_id==='P0B_DEEP_OUTBOX_PARITY_V1'));
 assert.ok(report.top_rows_read.some(x=>x.query_sha256==='b37dabd5f591b130c997e7b9a578f46e40aa5bf839781c7209f9238c8a3db109'&&x.query_id==='P0B_DAILY_COMMITTED_CEILING_V1'));
 assert.ok(!JSON.stringify(report).includes(deep));
 assert.equal(attributeD1ReadInsights([row(deep+' WHERE 1=1')]).exact_sql_callsite_matches,0);
});
