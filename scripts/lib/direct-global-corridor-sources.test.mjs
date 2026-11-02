import test from "node:test";
import assert from "node:assert/strict";
import {DIRECT_GLOBAL_CORRIDOR_SOURCES,assertDirectGlobalCorridorRegistry,
 directGlobalCorridorNewsFeeds,directGlobalCorridorSourceCensus}
 from "./direct-global-corridor-sources.mjs";
import {registeredReusableNewsSources,collectRegisteredReusableNews}
 from "./registered-reusable-news-source-collector.mjs";

test("every supplied global, six-region, maritime, mineral and crypto source has a direct mapping",()=>{
 assert.equal(assertDirectGlobalCorridorRegistry(),true);
 const ids=new Set(DIRECT_GLOBAL_CORRIDOR_SOURCES.map(s=>s.id));
 for(const id of ["gdelt_v2_15m","gdelt_cameo_codebook","reliefweb_v2",
  "world_bank_wdi","imf_data","wto_tariffs","adb_open_data","recaap_isc",
  "boj_releases","rbi_releases","asean_customs_missing","ukmto_incidents",
  "ukmto_advisories","suez_navigation","arab_monetary_fund","ecb_data",
  "eurostat_data","boe_news","snb_data","panama_canal","eclac_cepal",
  "bcb_brazil","afdb_documents","afcfta","sarb","federal_reserve",
  "fred_api","bank_of_canada","freightos_fbx","nyfed_gscpi","imb_piracy",
  "usgs_mcs","iea_minerals","mining_com","cryptocompare_news",
  "coindesk_rss","cointelegraph_rss"])assert.ok(ids.has(id),id);
 assert.equal(ids.size,37);
 const removed=DIRECT_GLOBAL_CORRIDOR_SOURCES.find(s=>s.id==="asean_customs_missing");
 assert.equal(removed.url,null);
 assert.equal(removed.state,"REJECTED_REMOVED_LINK");
 assert.ok(DIRECT_GLOBAL_CORRIDOR_SOURCES.every(s=>s.url===null||s.url.startsWith("https://")));
});
test("direct feed activation never promotes portals or credential-restricted datasets",()=>{
 const active=directGlobalCorridorNewsFeeds();
 assert.deepEqual(active.map(s=>s.id).sort(),[
   "direct_boe_news","direct_coindesk_rss","direct_cointelegraph_rss"]);
 assert.ok(active.every(s=>s.categories.length>0&&s.commercial_eligible===false));
 const registry=registeredReusableNewsSources();
 for(const s of active)assert.ok(registry.some(x=>x.id===s.id&&x.url===s.url&&x.supported));
 for(const id of ["mining_com","fred_api","freightos_fbx","reliefweb_v2",
    "gdelt_cameo_codebook","iea_minerals"]){
   const source=DIRECT_GLOBAL_CORRIDOR_SOURCES.find(x=>x.id===id);
   assert.ok(!active.some(x=>x.url===source.url));
 }
 const receipt=directGlobalCorridorSourceCensus();
 assert.equal(receipt.registered,37);
 assert.equal(receipt.active_direct_native_feeds,3);
 assert.equal(receipt.production_readbacks_proven,false);
 assert.equal(receipt.paid_publication_authorized,false);
});
test("direct source native publication date flows into the existing factual D1 batch contract",async()=>{
 const now=new Date("2026-11-02T00:10:00.000Z");
 const registry=directGlobalCorridorNewsFeeds().filter(x=>x.id==="direct_boe_news")
   .map(x=>({...x,type:"rss",supported:true}));
 const rss='<rss><channel><item><title>Bank of England interest rates and inflation policy update</title>'+
   '<pubDate>Mon, 02 Nov 2026 00:00:00 GMT</pubDate></item></channel></rss>';
 const out=await collectRegisteredReusableNews({now,registry,
   fetchImpl:async()=>new Response(rss,{status:200}),
   normalize:input=>({schema:"geomacro.reusable-news-json.v1",category:input.category,
     source:{original_published_at:input.published_at},
     usage_rights:{commercial_reuse_authorized:false},
     delivery:{raw_article_included:false}})});
 assert.equal(out.items.length,1);
 assert.equal(out.checks[0].category,"macro");
 assert.equal(out.items[0].source.original_published_at,"2026-11-02T00:00:00.000Z");
 assert.equal(out.summary.paid_publication_authorized,false);
 assert.ok(!JSON.stringify(out).includes("Bank of England interest rates and inflation policy update"));
});
