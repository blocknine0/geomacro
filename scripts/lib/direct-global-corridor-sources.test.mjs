import test from "node:test";
import assert from "node:assert/strict";
import {DIRECT_GLOBAL_CORRIDOR_SOURCES,assertDirectGlobalCorridorRegistry,
  directGlobalCorridorNewsFeeds,directGlobalCorridorRouteSources,
  directGlobalCorridorSourceCensus,assertDirectCorridorWebsiteSeparation,
  suppliedGlobalCorridorDirectory} from "./direct-global-corridor-sources.mjs";
import {registeredReusableNewsSources} from "./registered-reusable-news-source-collector.mjs";

test("all 38 Markdown links including duplicate Panama/UKMTO references are preserved",()=>{
 assert.equal(assertDirectGlobalCorridorRegistry(),true);
 const input=suppliedGlobalCorridorDirectory();
 assert.equal(input.references.length,38);
 assert.equal(new Set(input.references.map(x=>x.linked_target_url)).size,36);
 assert.equal(new Set(input.references.map(x=>x.source_id)).size,36);
 assert.equal(input.unresolved_removed_links.length,1);
 assert.equal(input.unresolved_removed_links[0].source_id,"asean_customs_missing");
 assert.deepEqual(input.references.map((x,i)=>x.reference_index),Array.from({length:38},(_,i)=>i+1));
 assert.equal(input.references.filter(x=>x.source_id==="panama_canal").length,2);
 assert.equal(input.references.filter(x=>x.source_id==="ukmto_incidents").length,2);
 assert.ok(input.references.find(x=>x.source_id==="cryptocompare_news")
    .linked_target_url.startsWith("https://min-api.cryptocompare.com/documentation?"));
 assert.ok(input.references.some(x=>x.supplied_url.startsWith("http://data.gdeltproject.org/")));
 assert.ok(input.references.some(x=>x.supplied_url.startsWith("https://www.google.com/search?q=")));
});
test("all 37 registries remain in separate corridor lane, not D1 website news",()=>{
 const sources=directGlobalCorridorRouteSources();
 assert.equal(assertDirectCorridorWebsiteSeparation(),true);
 assert.equal(sources.length,37);
 assert.deepEqual(directGlobalCorridorNewsFeeds(),[]);
 assert.equal(new Set(sources.map(x=>x.id)).size,37);
 assert.equal(sources.reduce((n,x)=>n+x.source_references.length,0),38);
 assert.ok(sources.every(x=>x.channel==="CORRIDOR_ONLY"&&
   x.website_intelligence_enabled===false&&x.commercial_eligible===false));
 const existing=registeredReusableNewsSources();
 for(const id of ["boe_news","coindesk_rss","cointelegraph_rss"]){
   const src=DIRECT_GLOBAL_CORRIDOR_SOURCES.find(x=>x.id===id);
   assert.ok(src);
   assert.ok(!existing.some(x=>x.id==="direct_"+id));
 }
 const receipt=directGlobalCorridorSourceCensus();
 assert.equal(receipt.registered,37);
 assert.equal(receipt.source_link_occurrences,38);
 assert.equal(receipt.linked_unique_sources,36);
 assert.equal(receipt.website_intelligence_sourced_feeds,0);
 assert.equal(receipt.production_readbacks_proven,false);
 assert.equal(receipt.paid_publication_authorized,false);
});
test("source directory does not infer direct event extraction from documentation",()=>{
 const map=new Map(DIRECT_GLOBAL_CORRIDOR_SOURCES.map(x=>[x.id,x]));
 for(const id of ["gdelt_cameo_codebook","reliefweb_v2","world_bank_wdi",
   "imf_data","wto_tariffs","fred_api","freightos_fbx","iea_minerals"]){
   assert.ok(map.has(id));
 }
 assert.equal(map.get("asean_customs_missing").url,null);
 assert.ok(DIRECT_GLOBAL_CORRIDOR_SOURCES.every(x=>
   x.url===null||x.url.startsWith("https://")));
 assert.ok(directGlobalCorridorRouteSources().every(x=>x.risk_gate_verified===false));
});
