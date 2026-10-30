import test from "node:test";
import assert from "node:assert/strict";
import {createPhase2iSingleSweepOriginalIndex} from "../lib/phase2i-single-sweep-original-index.mjs";
const sourceA="https://issuer.example.org/rss";
const sourceB="https://syndication.example.org/rss";
const pinned=new Map([[sourceA,["geopolitics","macro","rare_earth"]],
 [sourceB,["geopolitics","macro","rare_earth"]]]);
const topics={geopolitics:/sanctions/iu,macro:/inflation/iu,
 rare_earth:/lithium/iu};
const raw=(category,source_url=sourceA,title="Issuer reports inflation and lithium")=>({
 category,source_url,title,article_url:"https://issuer.example.org/news/42",
 published_at:"2026-10-30T12:00:00.000Z",
});
test("one native article from two pinned feeds is read once and projected only into relevant domains",()=>{
 const x=createPhase2iSingleSweepOriginalIndex({pinnedCategories:pinned,topics});
 for(const category of ["geopolitics","macro","rare_earth"]){
  x.observe(raw(category));
  x.observe(raw(category,sourceB));
 }
 const a=x.finish();
 assert.equal(a.summary.original_callback_observations,6);
 assert.equal(a.summary.unique_original_article_identities,1);
 assert.deepEqual(a.candidates.map(c=>c.category),["macro","rare_earth"]);
 assert.equal(a.summary.additional_relevant_category_projections,1);
 assert.equal(a.summary.repeated_exact_original_category_callbacks_dropped,2);
 assert.equal(a.summary.off_category_callbacks_filtered,2);
 assert.equal(a.summary.durable_backlog_confirmed,false);
 assert.equal(a.summary.no_extra_publisher_requests,true);
});
test("same permalink and publisher clock with contradictory title quarantines all source copies",()=>{
 const x=createPhase2iSingleSweepOriginalIndex({pinnedCategories:pinned,topics});
 x.observe(raw("macro"));
 x.observe(raw("macro",sourceB,"New conflicting inflation headline"));
 x.observe(raw("macro"));
 const a=x.finish();
 assert.equal(a.candidates.length,0);
 assert.equal(a.summary.contradictory_immutable_originals_quarantined,1);
});
test("different native publication instants preserve version identity; exact repeat never creates another row",()=>{
 const x=createPhase2iSingleSweepOriginalIndex({pinnedCategories:pinned,topics});
 const row=raw("macro");
 x.observe(row);
 for(let i=0;i<1000;i++)x.observe({...row});
 x.observe({...row,published_at:"2026-10-30T13:00:00.000Z"});
 const a=x.finish();
 assert.equal(a.summary.unique_original_article_identities,2);
 assert.equal(a.summary.category_scoped_record_candidates,2);
 assert.equal(a.summary.repeated_exact_original_category_callbacks_dropped,1000);
});
test("malformed, unpinned and cross-category unrelated URLs are never admitted",()=>{
 const x=createPhase2iSingleSweepOriginalIndex({pinnedCategories:pinned,topics});
 x.observe(raw("macro","https://untrusted.example.org/rss"));
 x.observe({...raw("macro"),article_url:"http://issuer.example.org/news/42"});
 x.observe({...raw("macro"),article_url:"https://issuer.example.org/news/42#fragment"});
 x.observe(raw("rare_earth",sourceA,"Unrelated central bank statement"));
 const a=x.finish();
 assert.equal(a.candidates.length,0);
 assert.equal(a.summary.off_category_callbacks_filtered,2);
 assert.equal(a.summary.invalid_original_callbacks,2);
});
