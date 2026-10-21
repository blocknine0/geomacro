import test from "node:test";
import assert from "node:assert/strict";
import {assessWebsiteVisibleOriginals,inspectLiveWebsiteVisibility}
 from "./verify-original-to-website-visible-20m.mjs";
const NOW=new Date("2026-10-21T13:00:00.000Z");
const item=(id,category,at,first)=>({
 story:{id,category,title:"Geomacro finds monetary action concerning interest rates",
   published_at:at,date_precision:"exact"},
 meta:{id,first_seen_at:first},
});
const fresh=item("macro-1234abcd","macro","2026-10-21T12:43:00.000Z",
  "2026-10-21T12:59:00.000Z");
const prior=item("geopolitics-1234abcd","geopolitics","2026-10-21T12:39:00.000Z",
  "2026-10-21T12:58:00.000Z");
function report(records){
 return {ok:true,schema:"geomacro.website-derived-news-feed.v1",
  original_release_delay_minutes:15,retention_hours:72,
  ingest_clock_kind:"D1_FIRST_INSERT_NOT_WEBSITE_FIRST_RENDER",
  signals:records.map(x=>x.story),first_ingest:records.map(x=>x.meta)};
}
const website=(title="monetary action concerning interest rates")=>
 '<html><main><h3 class="mt-3 text-lg">'+title+'</h3></main></html>';
test("confirms one real source-clock event is observed in SSR within 20 minutes",()=>{
 const v=assessWebsiteVisibleOriginals({journal:report([fresh,prior]),html:website(),now:NOW});
 assert.equal(v.fresh_20min_exact_original_candidates,1);
 assert.equal(v.candidates_visible_and_first_d1_ingest_verified_under_20min,1);
 assert.equal(v.observed_visible_upper_bound_max_minutes,17);
 assert.equal(v.sampled_original_to_website_html_20min_evidence,true);
 assert.equal(v.universal_195x3_20min_sla_verified,false);
 assert.equal(v.real_browser_first_paint_verified,false);
});
test("a title merely serialized in JSON never certifies visible SSR",()=>{
 const fake='<html><script type="application/json">'+
 JSON.stringify({title:"monetary action concerning interest rates"})+
 '</script><iframe src="https://worker.example"></iframe></html>';
 const v=assessWebsiteVisibleOriginals({journal:report([fresh]),html:fake,now:NOW});
 assert.equal(v.candidates_visible_in_actual_website_ssr,0);
 assert.equal(v.missing_or_inconclusive_in_fresh_window,1);
 assert.equal(v.sampled_original_to_website_html_20min_evidence,false);
});
test("nested HTML/script text is never promoted into a positive SSR heading proof",()=>{
 const injected='<h3>monetary action <script>alert(1)</script>concerning interest rates</h3>';
 const v=assessWebsiteVisibleOriginals({journal:report([fresh]),html:injected,now:NOW});
 assert.equal(v.candidates_visible_in_actual_website_ssr,0);
 assert.equal(v.sampled_original_to_website_html_20min_evidence,false);
});
test("no fresh originals or blocked HTML cannot be certified",()=>{
 const v=assessWebsiteVisibleOriginals({journal:report([prior]),html:website(),now:NOW});
 assert.equal(v.fresh_20min_exact_original_candidates,0);
 assert.equal(v.sampled_original_to_website_html_20min_evidence,false);
 const rejected=assessWebsiteVisibleOriginals({
  journal:report([fresh]),html:website(),siteStatus:503,now:NOW,
 });
 assert.equal(rejected.candidates_visible_in_actual_website_ssr,0);
});
test("forged first insert is not accepted and doesn't hide existing story",()=>{
 const f={...fresh,meta:{id:fresh.story.id,first_seen_at:"2026-10-21T12:45:00.000Z"}};
 const v=assessWebsiteVisibleOriginals({journal:report([f]),html:website(),now:NOW});
 assert.equal(v.record_first_ingest_clock_verified,0);
 assert.equal(v.candidates_visible_and_first_d1_ingest_verified_under_20min,0);
 assert.equal(v.candidates_visible_in_actual_website_ssr,1);
});
test("only exact original publication clock qualifies, and record identity must align",()=>{
 const d={...fresh,story:{...fresh.story,date_precision:"day",published_at:"2026-10-21"}};
 const v=assessWebsiteVisibleOriginals({journal:report([d]),html:website(),now:NOW});
 assert.equal(v.fresh_20min_exact_original_candidates,0);
 const bad={...fresh,meta:{...fresh.meta,id:"wrong"}};
 assert.throws(()=>assessWebsiteVisibleOriginals({journal:report([bad]),html:website(),now:NOW}),/RECORD_INVALID/);
});
test("two read-only outside-in requests; never introduces upstream requests or tokens",async()=>{
 const urls=[];
 const found=await inspectLiveWebsiteVisibility(async(url,opts)=>{
  urls.push({url,opts});
  return String(url).includes("website-derived-news")?
   Response.json(report([fresh])):new Response(website(),{status:200});
 },NOW);
 assert.equal(urls.length,2);
 assert.equal(urls.every(x=>x.opts.method==="GET"&&x.opts.cache==="no-store"),true);
 assert.equal(found.payments,0);
 assert.equal(found.upstream_titles_logged,false);
});
