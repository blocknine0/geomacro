import test from "node:test";
import assert from "node:assert/strict";
import {DIRECT_CORRIDOR_SUPPLEMENTAL_NATIVE_FEEDS,
 assertDirectCorridorSupplementalNativeFeeds,PINNED_CORRIDOR_OFFICIAL_FEED_URLS}
 from "./direct-corridor-official-news-feeds.mjs";
import {DIRECT_GLOBAL_CORRIDOR_SOURCES} from "./direct-global-corridor-sources.mjs";
import {collectDirectCorridorNativeNews} from "./direct-corridor-native-news.mjs";

const NOW=new Date("2026-11-02T12:00:00.000Z");
const rss=(title,url)=>'<rss><channel><item><title>'+title+'</title><pubDate>Mon, 02 Nov 2026 11:45:00 GMT</pubDate><link>'+url+'</link></item></channel></rss>';

test("additional WTO and USGS feeds preserve the original 37-entry registry",()=>{
 assert.equal(assertDirectCorridorSupplementalNativeFeeds(),true);
 assert.equal(DIRECT_GLOBAL_CORRIDOR_SOURCES.length,37);
 assert.equal(DIRECT_CORRIDOR_SUPPLEMENTAL_NATIVE_FEEDS.length,4);
 assert.deepEqual(DIRECT_CORRIDOR_SUPPLEMENTAL_NATIVE_FEEDS.map(x=>x.original_registry_source_id),
  ["wto_tariffs","usgs_mcs","usgs_mcs","rbi_releases"]);
 assert.ok(DIRECT_CORRIDOR_SUPPLEMENTAL_NATIVE_FEEDS.every(x=>
  x.channel==="CORRIDOR_ONLY"&&x.website_intelligence_enabled===false&&
  x.event_verified===false&&x.commercial_eligible===false));
});
test("WTO first-party native-dated policy release becomes a private candidate",async()=>{
 const out=await collectDirectCorridorNativeNews({
  now:NOW,sources:DIRECT_CORRIDOR_SUPPLEMENTAL_NATIVE_FEEDS.slice(0,1),
  fetchImpl:async()=>new Response(rss("WTO members discuss trade policy and tariffs",
    "https://www.wto.org/english/news_e/news26_e/test26_e.htm"),
    {headers:{"Content-Type":"application/rss+xml"}})
 });
 assert.equal(out.candidate_count,1);
 assert.equal(out.news_candidates[0].source_id,"wto_official_news");
 assert.equal(out.news_candidates[0].original_article_verified,false);
 assert.equal(out.news_candidates[0].commercial_rights_verified,false);
 assert.equal(out.news_candidates[0].customer_delivery_enabled,false);
 assert.equal(out.news_candidates[0].published_at,"2026-11-02T11:45:00.000Z");
});
test("USGS minerals feed ingests relevant announcements but not generic geology",async()=>{
 const sources=DIRECT_CORRIDOR_SUPPLEMENTAL_NATIVE_FEEDS.filter(x=>x.id==="usgs_official_minerals_news");
 const endpoint="https://www.usgs.gov/news/national-news-release/critical-mineral-deposits";
 const out=await collectDirectCorridorNativeNews({now:NOW,sources,
  fetchImpl:async()=>new Response(rss("USGS updates critical mineral deposits",endpoint))
 });
 assert.equal(out.candidate_count,1);
 assert.deepEqual(out.news_candidates[0].categories,["rare_earth"]);
 const unrelated=await collectDirectCorridorNativeNews({now:NOW,sources,
  fetchImpl:async()=>new Response(rss("New aircraft survey over Utah canyon",endpoint))
 });
 assert.equal(unrelated.candidate_count,0);
});
test("same-publisher, no redirect, strict native clock and no paid authorization",async()=>{
 const sources=DIRECT_CORRIDOR_SUPPLEMENTAL_NATIVE_FEEDS;
 const out=await collectDirectCorridorNativeNews({now:NOW,sources,
  fetchImpl:async url=>{
   if(url===PINNED_CORRIDOR_OFFICIAL_FEED_URLS.wto_official_news) return Response.redirect("https://example.org/invalid",302);
   return new Response(rss("USGS updates critical mineral deposits",
    "https://evil.example/critical-mineral-report"));
  }
 });
 assert.equal(out.candidate_count,0);
 assert.ok(out.source_checks.every(c=>c.event_verified===false));
 assert.equal(out.paid_delivery_enabled,false);
 assert.equal(out.website_intelligence_writes,0);
});

test("RBI first-party press releases keep numeric prid so different notices never collide",async()=>{
 const source=DIRECT_CORRIDOR_SUPPLEMENTAL_NATIVE_FEEDS.filter(x=>x.id==="rbi_official_press_releases");
 const urlA="https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?PRID=55555";
 const urlB="https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=55556";
 const feed="<rss><channel>"+[urlA,urlB].map((url,i)=>"<item><title>Reserve Bank of India monetary policy release "+i+"</title><pubDate>Mon, 02 Nov 2026 11:45:00 GMT</pubDate><link>"+url+"</link></item>").join("")+"</channel></rss>";
 const out=await collectDirectCorridorNativeNews({now:NOW,sources:source,
  fetchImpl:async()=>new Response(feed)});
 assert.equal(out.candidate_count,2);
 assert.equal(new Set(out.news_candidates.map(x=>x.id)).size,2);
 assert.ok(out.news_candidates.every(x=>x.article_url.includes("?prid=")));
 assert.ok(out.news_candidates.every(x=>x.customer_delivery_enabled===false));
 const polluted=await collectDirectCorridorNativeNews({now:NOW,sources:source,
  fetchImpl:async()=>new Response(rss("RBI press release with unsafe parameters",
    "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=55555&token=secret"))});
 assert.equal(polluted.candidate_count,0);
});

test("DOE original source is an independent fallback, never a fictitious USGS corroboration",async()=>{
 const source=DIRECT_CORRIDOR_SUPPLEMENTAL_NATIVE_FEEDS
  .filter(x=>x.id==="doe_official_critical_materials_news");
 assert.equal(source.length,1);
 assert.equal(source[0].independent_alternative_for,"usgs_official_minerals_news");
 assert.equal(source[0].url,"https://www.energy.gov/rss/energygov/2193718");
 const url="https://www.energy.gov/articles/energy-department-designates-helium-critical-material";
 const out=await collectDirectCorridorNativeNews({now:NOW,sources:source,
   fetchImpl:async()=>new Response(rss(
    "Energy Department designates helium as a critical material",url))});
 assert.equal(out.candidate_count,1);
 assert.equal(out.news_candidates[0].source_id,"doe_official_critical_materials_news");
 assert.equal(out.news_candidates[0].original_publisher_url,
   "https://www.energy.gov/rss/energygov/2193718");
 assert.deepEqual(out.news_candidates[0].categories,["rare_earth"]);
 assert.equal(out.news_candidates[0].independent_corroboration_verified,false);
 assert.equal(out.news_candidates[0].commercial_rights_verified,false);
 assert.equal(out.news_candidates[0].customer_delivery_enabled,false);
 const unrelated=await collectDirectCorridorNativeNews({now:NOW,sources:source,
   fetchImpl:async()=>new Response(rss(
     "Energy Department awards research grants for the electrical grid",url))});
 assert.equal(unrelated.candidate_count,0);
 const wrongDomain=await collectDirectCorridorNativeNews({now:NOW,sources:source,
   fetchImpl:async()=>new Response(rss(
     "Critical minerals export restrictions announced",
     "https://usgs.gov/news/critical-minerals"))});
 assert.equal(wrongDomain.candidate_count,0);
});

test("official source URL contracts reject same-host path/query, prefix hosts and obfuscated suffixes",()=>{
 const checked=assertDirectCorridorSupplementalNativeFeeds();
 assert.equal(checked,true);
 for(const s of DIRECT_CORRIDOR_SUPPLEMENTAL_NATIVE_FEEDS)
   assert.equal(s.url,PINNED_CORRIDOR_OFFICIAL_FEED_URLS[s.id]);
 const tamper=(id,url)=>DIRECT_CORRIDOR_SUPPLEMENTAL_NATIVE_FEEDS.map(s=>
  s.id===id?{...s,url}:s);
 const wto="wto_official_news",rbi="rbi_official_press_releases";
 for(const url of [
  "https://www.wto.org/library/rss/latest_news_e.xml/evil",
  "https://www.wto.org/library/rss/latest_news_e.xml?next=https://evil.example",
  "https://www.wto.org.evil.example/library/rss/latest_news_e.xml",
  "https://www.wto.org/library/rss/%6catest_news_e.xml",
  "https://www.wto.org@evil.example/library/rss/latest_news_e.xml",
  "http://www.wto.org/library/rss/latest_news_e.xml"
 ]){
  assert.throws(()=>assertDirectCorridorSupplementalNativeFeeds(tamper(wto,url)),
   /CORRIDOR_SUPPLEMENT_PUBLISHER_INVALID/);
 }
 assert.throws(()=>assertDirectCorridorSupplementalNativeFeeds(
  tamper(rbi,"https://www.rbi.org.in/pressreleases_rss.xml?feed=other")),
 /CORRIDOR_SUPPLEMENT_PUBLISHER_INVALID/);
});
