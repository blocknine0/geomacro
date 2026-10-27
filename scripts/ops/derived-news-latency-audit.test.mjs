import test from "node:test";
import assert from "node:assert/strict";
import {auditDerivedJournalPages,auditLiveDerivedJournal,auditObservedWebsiteLatency} from "./derived-news-latency-audit.mjs";
const NOW=new Date("2026-10-21T12:00:00.000Z");
const sample=(id,cat,at,ingested,date_precision="exact")=>({
 signal:{id,category:cat,published_at:at,date_precision,sources_credited:[]},
 clock:{id,first_seen_at:ingested},
});
const p=(rows,hasMore=false,offset=0)=>({
 ok:true,schema:"geomacro.website-derived-news-feed.v1",
 checked_at:NOW.toISOString(),original_release_delay_minutes:0,
 retention_hours:72,delivery_scope:"free_website_only",
 ingest_clock_kind:"D1_FIRST_INSERT_NOT_WEBSITE_FIRST_RENDER",
 page_offset:offset,page_size:250,has_more:hasMore,next_offset:hasMore?offset+250:null,
 signals:rows.map(x=>x.signal),first_ingest:rows.map(x=>x.clock),
});
const a=sample("macro-a","macro","2026-10-21T11:00:00.000Z","2026-10-21T11:17:00.000Z");
const b=sample("geo-b","geopolitics","2026-10-21T10:00:00.000Z","2026-10-21T10:24:00.000Z");
test("counts real D1 first-insert delay without claiming website display",()=>{
 const v=auditDerivedJournalPages([p([a,b])],NOW);
 assert.equal(v.retained_unique_rows,2);
 assert.equal(v.remaining_record_slots,598);
 assert.equal(v.counts.macro,1);
 assert.equal(v.counts.rare_earth,0);
 assert.equal(v.d1_first_insert_within_20m,1);
 assert.equal(v.d1_first_insert_over_20m,1);
 assert.equal(v.d1_first_insert_p95_minutes,24);
 assert.equal(v.website_first_render_timestamp_verified,false);
 assert.equal(v.actual_website_20min_sla_verified,false);
 assert.equal(v.live_585_original_cells_verified_by_this_audit,0);
});
test("fails closed on duplicate ID, forged clock and a missing audit field",()=>{
 assert.throws(()=>auditDerivedJournalPages([p([a,a])],NOW),/IDENTITY_MISMATCH/);
 const forged={...a,clock:{...a.clock,first_seen_at:"2026-10-21T10:59:59.999Z"}};
 assert.throws(()=>auditDerivedJournalPages([p([forged])],NOW),/TIME_OR_PROVENANCE_INVALID/);
 assert.throws(()=>auditDerivedJournalPages([{...p([a]),first_ingest:undefined}],NOW),/PAGE_INVALID/);
 assert.throws(()=>auditDerivedJournalPages([p([a],true,0)],NOW),/PAGE_INVALID/);
});
test("reads only 250-row pages and doesn't echo source content",async()=>{
 const seen=[];
 const out=await auditLiveDerivedJournal(async(url,opts)=>{
  seen.push({url,opts});
  return Response.json(p([a]));
 },NOW);
 assert.equal(seen.length,1);
 assert.ok(seen[0].url.endsWith("/website-derived-news-immediate"));
 assert.equal(seen[0].opts.method,"GET");
 assert.equal(out.raw_upstream_content_logged,false);
 assert.equal(out.commercial_rights_verified,false);
});
test("detects pagination and does not pretend 600 retained rows are all world news",()=>{
 const vals=Array.from({length:251},(_,i)=>{
  const id="macro-"+String(i).padStart(4,"0");
  return sample(id,"macro","2026-10-21T11:00:00.000Z","2026-10-21T11:17:00.000Z");
 });
 const value=auditDerivedJournalPages([p(vals.slice(0,250),true),p(vals.slice(250),false,250)],NOW);
 assert.equal(value.retained_unique_rows,251);
 assert.equal(value.total_source_history_complete,false);
 assert.equal(value.readback_pages,2);
});
test("proves a served 17-minute sample only from article markup, not embedded JSON or D1 insertion",()=>{
 const row={...a.signal,id:"macro-1234abcd",status:"official_release_observed_unscored",topic:"monetary policy"};
 const at=new Date("2026-10-21T11:17:00Z");
 const html='<article data-geomacro-story-id="macro-1234abcd"><h3>Derived card</h3></article>';
 const out=auditObservedWebsiteLatency({signals:[row]},html,at);
 assert.equal(out.actual_website_20min_sample_verified,true);
 assert.equal(out.samples[0].latency_upper_bound_seconds,1020);
 assert.equal(out.universal_20min_sla_verified,false);
 assert.equal(auditObservedWebsiteLatency({signals:[row]},JSON.stringify(row),at)
  .actual_website_20min_sample_verified,false);
 assert.equal(auditObservedWebsiteLatency({signals:[row]},html,new Date("2026-10-21T11:21:00Z"))
  .actual_website_20min_sample_verified,false);
 assert.equal(auditObservedWebsiteLatency({signals:[row]},html,new Date("2026-10-21T10:59:59Z"))
  .actual_website_20min_sample_verified,false);
 assert.equal(auditObservedWebsiteLatency({signals:[{...row,date_precision:"day"}]},html,at)
  .actual_website_20min_sample_verified,false);
 assert.equal(auditObservedWebsiteLatency({signals:[{...row,status:"official_feed_candidate_unscored"}]},html,at)
  .actual_website_20min_sample_verified,false);
});
