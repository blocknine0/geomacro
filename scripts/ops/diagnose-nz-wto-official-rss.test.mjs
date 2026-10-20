import test from "node:test";
import assert from "node:assert/strict";
import {probeOfficialTradeNewsFeeds} from "./diagnose-nz-wto-official-rss.mjs";

const feed='<?xml version="1.0"?><rss version="2.0"><channel>'+
 '<item><title>Not delivered upstream</title><pubDate>Tue, 20 Oct 2026 15:00:00 GMT</pubDate></item></channel></rss>';
const answer=(status,mime,body)=>new Response(body,{status,headers:{"content-type":mime}});
test("accepts exactly pinned official RSS XML as transport only, with zero source content",async()=>{
 const seen=[];
 const doc=await probeOfficialTradeNewsFeeds({fetchImpl:async(url,opts)=>{
  seen.push({url,opts});
  return answer(200,"application/rss+xml; charset=UTF-8",feed);
 }});
 assert.equal(seen.length,6);
 assert.deepEqual(seen.map(x=>x.url),[
  "https://www.beehive.govt.nz/rss.xml",
  "https://www.beehive.govt.nz/releases/feed",
  "https://www.beehive.govt.nz/taxonomy/term/6830/feed",
  "https://www.beehive.govt.nz/taxonomy/term/6789/feed",
  "https://www.beehive.govt.nz/taxonomy/term/6715/feed",
  "https://www.wto.org/library/rss/latest_news_e.xml",
 ]);
 for(const x of seen){
  assert.equal(x.opts.method,"GET");
  assert.equal(x.opts.redirect,"manual");
  assert.equal(x.opts.cache,"no-store");
  assert.equal(x.opts.headers.Accept,"application/rss+xml, application/xml, text/xml");
 }
 assert.equal(doc.rows.every(x=>x.verified_rss_envelope===true&&x.item_count===1),true);
 const printable=JSON.stringify(doc);
 assert.equal(doc.no_raw_sources_or_payload_logged,true);
 assert.equal(doc.no_b2_d1_supabase_or_funds,true);
 assert.equal(doc.nz_portfolio_feeds_one_publisher_family,true);
 assert.equal(doc.observed_endpoints,6);
 assert.equal(doc.rss_mime_readback_not_current_news_or_commercial_authority,true);
 assert.equal(doc.publisher_licence_still_required,true);
 assert.equal(printable.includes("Not delivered upstream"),false);
 assert.equal(printable.includes("https:"),false);
});
test("HTML impersonation, auth restrictions and invalid XML do not become news",async()=>{
 const responses=[
  answer(200,"text/html","<html><rss><item></item></rss></html>"),
  answer(403,"application/rss+xml",feed),
  answer(200,"application/rss+xml","<!DOCTYPE rss><rss><item></item></rss>"),
  answer(200,"application/rss+xml",feed),
  answer(200,"application/rss+xml",feed),
  answer(200,"application/rss+xml",feed),
 ];
 let i=0;
 const doc=await probeOfficialTradeNewsFeeds({fetchImpl:async()=>responses[i++]});
 assert.equal(doc.rows[0].mime_class,"HTML_NOT_RSS");
 assert.equal(doc.rows[1].http_status,403);
 assert.equal(doc.rows[2].mime_class,"XML_INVALID_OR_NO_ITEMS");
 assert.equal(doc.rows.slice(0,3).every(x=>!x.verified_rss_envelope),true);
 assert.deepEqual(doc.rows.slice(0,3).map(x=>x.item_count),[0,0,0]);
 assert.deepEqual(doc.rows.slice(3).map(x=>x.item_count),[1,1,1]);
});
test("a network error fails only that source and never retries or leaks a URL",async()=>{
 let i=0;
 const doc=await probeOfficialTradeNewsFeeds({fetchImpl:async()=>{
  if(++i===2)throw Error("SECRET_HTTP_UPSTREAM_URL");
  return answer(200,"text/xml",feed);
 }});
 assert.equal(i,6);
 assert.equal(doc.rows[1].mime_class,"NETWORK_OR_TIMEOUT");
 assert.equal(doc.rows[0].verified_rss_envelope,true);
 assert.equal(doc.rows[2].verified_rss_envelope,true);
 assert.equal(doc.rows[5].verified_rss_envelope,true);
 assert.equal(JSON.stringify(doc).includes("SECRET_HTTP_UPSTREAM_URL"),false);
 await assert.rejects(probeOfficialTradeNewsFeeds({timeout:50000}),/BOUNDED_TIMEOUT_REQUIRED/);
});
