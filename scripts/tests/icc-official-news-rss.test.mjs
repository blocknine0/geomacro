import test from "node:test";
import assert from "node:assert/strict";
import {
 ICC_OFFICIAL_NEWS_RSS,pinnedIccOriginalNewsLink,parseIccOfficialNewsRss
} from "../lib/icc-official-news-rss.mjs";
import {observeExistingPrivateP0Sources} from "../ops/observe-p0-private-source-runtime.mjs";
const now=new Date("2026-10-24T12:20:00Z");
const url="https://www.icc-cpi.int/news/high-representative/vice-president-kaja-kallas-visits-international-criminal-court";
const item='<item><title><![CDATA[High Representative visits the International Criminal Court]]></title>'+
 '<link>'+url+'</link><pubDate>Fri, 23 Oct 2026 08:00:00 GMT</pubDate></item>';
const rss=(items=item)=>'<?xml version="1.0"?><rss version="2.0"><channel>'+
 '<title>International Criminal Court - News</title>'+items+'</channel></rss>';
test("court-affiliated official media page pins exact RSS and original article paths",()=>{
 assert.equal(ICC_OFFICIAL_NEWS_RSS,"https://www.icc-cpi.int/rss/news/all");
 assert.equal(pinnedIccOriginalNewsLink(url),url);
 for(const bad of [
  "https://evil.example/news/kaja-kallas-visits-court",
  "https://www.icc-cpi.int.attacker.test/news/kaja-kallas-visits-court",
  "https://icccpi-web.icccpi-prod.uniccloud.org/news/kaja-kallas-visits-court",
  "https://www.icc-cpi.int/rss/news/all",
  "https://www.icc-cpi.int/news/subscribe",
  url+"?track=123",url+"#stale",
  "http://www.icc-cpi.int/news/kaja-kallas-visits-court",
  "https://www.icc-cpi.int/news/../rss/news/all",
  "https://www.icc-cpi.int/news/../../etc/passwd"
 ])assert.equal(pinnedIccOriginalNewsLink(bad),null);
});
test("RSS feed dates never verify original publication or grant licensing",()=>{
 const x=parseIccOfficialNewsRss(rss(item+item+
 '<item><title>Untrusted ICC title</title><link>https://other.example/news/long-story-name</link></item>'));
 assert.equal(x.first_party_original_link_leads,1);
 assert.equal(x.feed_date_assertion_count,1);
 assert.equal(x.original_article_html_readback_verified,false);
 assert.equal(x.native_first_publication_clock_verified,false);
 assert.equal(x.article_scoped_rights_verified,false);
 assert.equal(x.signed_products_created,false);
 assert.equal(x.commercial_eligible,false);
 assert.equal(x.payments,0);
 assert.doesNotMatch(JSON.stringify(x),/kaja-kallas|icc-cpi\.int|High Representative/);
});
test("DTD, shape spoofing, off-issuer, empty and oversized feeds fail closed",()=>{
 for(const x of [
  "<html>International Criminal Court News</html>",
  '<!DOCTYPE rss [<!ENTITY p SYSTEM "file:///etc/passwd">]>'+rss(),
  rss("<item><title>Unrelated court title</title><link>https://evil.example/news/important-event-news</link></item>"),
  rss(""),
  "X".repeat(2*1024*1024+1)
 ])assert.throws(()=>parseIccOfficialNewsRss(x),/ICC_OFFICIAL_RSS_/);
});
test("one court RSS fallback occurs after genuinely unparseable news HTML, not explicit 403/429",async()=>{
 const requests=[];
 const x=await observeExistingPrivateP0Sources({now,fetchImpl:async(url,opts)=>{
  requests.push(url);
  assert.equal(opts.redirect,"error");
  if(url==="https://www.icc-cpi.int/news")
   return new Response('<html><body>International Criminal Court News missing links</body></html>',
     {headers:{"content-type":"text/html"}});
  if(url===ICC_OFFICIAL_NEWS_RSS)
   return new Response(rss(),{headers:{"content-type":"application/rss+xml"}});
  return new Response("Denied",{status:403});
 }});
 const row=x.results.find(z=>z.source_id==="icc_news");
 assert.equal(requests.length,11);assert.equal(x.http_requests,11);
 assert.equal(requests.filter(z=>z===ICC_OFFICIAL_NEWS_RSS).length,1);
 assert.equal(row.status,"ICC_OFFICIAL_RSS_REFERENCE_ONLY");
 assert.equal(row.official_first_party_rss_leads,1);
 assert.equal(row.primary_news_html_parser_still_unverified,true);
 assert.equal(row.current_original_publication_verified,false);
 assert.equal(row.commercial_eligible,false);
 assert.equal(x.signed_intelligence_published,false);
 assert.equal(x.payments,0);
 for(const status of [401,403,429]){
  const arr=[];
  const y=await observeExistingPrivateP0Sources({now,fetchImpl:async(url)=>{
   arr.push(url);
   return new Response("Denied",{status});
  }});
  assert.equal(arr.length,10);assert.equal(y.http_requests,10);
  assert.equal(y.results.find(r=>r.source_id==="icc_news").reason,"HTTP_"+status);
 }
});
test("invalid ICC RSS response remains failed without a third retry or entitlement",async()=>{
 let n=0;
 const y=await observeExistingPrivateP0Sources({now,fetchImpl:async url=>{
  n++;
  if(url==="https://www.icc-cpi.int/news")
   return new Response("<html>International Criminal Court News</html>",
    {headers:{"content-type":"text/html"}});
  if(url===ICC_OFFICIAL_NEWS_RSS)
   return new Response("<html>Login, please</html>",{headers:{"content-type":"text/html"}});
  return new Response("Denied",{status:403});
 }});
 assert.equal(n,11);
 const row=y.results.find(z=>z.source_id==="icc_news");
 assert.equal(row.status,"UNAVAILABLE");
 assert.equal(row.reason,"PARSER_NOT_VERIFIED");
 assert.equal(row.official_rss_alternate_unavailable,true);
 assert.equal(y.commercial_eligible,false);
});