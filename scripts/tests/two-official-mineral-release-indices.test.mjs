import test from "node:test";
import assert from "node:assert/strict";
import {MINERAL_ORIGINAL_INDICES,summarizeMineralOriginalIndex,observeTwoMineralIndices} from "../lib/two-official-mineral-release-indices.mjs";
const now=new Date("2026-10-20T08:00:00Z");
const peru='<!doctype html><html><h1>Ministerio de Energía y Minas</h1><p>Boletín Estadístico Minero Mayo 2026</p></html>';
const canada='<rss version="2.0"><channel><item><guid>first</guid><link>https://geoscan.nrcan.gc.ca/first</link>'+
  '<title>Critical minerals lithium mineral resources</title><pubDate>Mon, 19 Oct 2026 15:00:00 GMT</pubDate></item></channel></rss>';
test("exact official source allowlist for distinct national index publications",()=>{
 assert.deepEqual(MINERAL_ORIGINAL_INDICES.map(x=>x.iso3),["PER","CAN"]);
 assert.ok(MINERAL_ORIGINAL_INDICES.every(x=>new URL(x.url).protocol==="https:"));
 const p=summarizeMineralOriginalIndex(MINERAL_ORIGINAL_INDICES[0],peru,now);
 assert.equal(p.status,"MONTHLY_MINERAL_BULLETIN_INDEX_PRESENT");
 assert.equal(p.publisher_entries_with_native_publication_time,0);
 assert.equal(p.complete_current_month_data_verified,false);
 const c=summarizeMineralOriginalIndex(MINERAL_ORIGINAL_INDICES[1],canada,now);
 assert.equal(c.status,"FIRST_PARTY_PUBLICATION_INDEX_DATES_OBSERVED");
 assert.equal(c.recent_native_publisher_items,1);
 assert.equal(c.qualifying_relevant_entries,1);
});
test("stale/future/invalid publisher items are never upgraded",()=>{
 const s=MINERAL_ORIGINAL_INDICES[1];
 const future=canada.replace("Mon, 19 Oct 2026 15:00:00 GMT","Wed, 21 Oct 2026 15:00:00 GMT");
 assert.equal(summarizeMineralOriginalIndex(s,future,now).status,"NO_VERIFIED_DATED_PUBLICATIONS");
 assert.throws(()=>summarizeMineralOriginalIndex(s,"<html>sign in</html>",now),/MINERAL_SOURCE_SHAPE_UNVERIFIED/);
 assert.throws(()=>summarizeMineralOriginalIndex(MINERAL_ORIGINAL_INDICES[0],"<html>Access denied</html>",now),/MINERAL_SOURCE_SHAPE_UNVERIFIED/);
});
test("only two bounded source GETs, denials truthfully isolated",async()=>{
 let requests=0;
 const data=await observeTwoMineralIndices({now,fetchImpl:async(url,opts)=>{
   requests++;assert.equal(opts.redirect,"error");
   return new Response(url.includes("gob.pe")?peru:canada);
 }});
 assert.equal(requests,2);
 assert.equal(data.healthy_source_count,2);
 assert.equal(data.upstream_calls,2);
 assert.equal(data.all_195_mineral_countries_verified,false);
 assert.equal(data.raw_source_bytes_stored,false);
 assert.equal(data.d1_writes,0);
 const denied=await observeTwoMineralIndices({now,fetchImpl:async url=>
   url.includes("gob.pe")?new Response("forbidden",{status:403}):new Response(canada)});
 assert.equal(denied.sources[0].reason,"MINERAL_DENIED_OR_QUOTA");
 assert.equal(denied.healthy_source_count,1);
 assert.equal(denied.sources[1].status,"FIRST_PARTY_PUBLICATION_INDEX_DATES_OBSERVED");
});
