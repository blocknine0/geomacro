import test from "node:test";
import assert from "node:assert/strict";
import {
 ICC_OFFICIAL_NEWS_RSS,pinnedIccOriginalNewsLink,parseIccOfficialNewsRss
} from "../lib/icc-official-news-rss.mjs";
import {observeExistingPrivateP0Sources} from "../ops/observe-p0-private-source-runtime.mjs";
import {parseIccArticleHtml,discoverIccArticleUrls} from "../../global-intelligence/adapters/icc-news.mjs";
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
test("server-rendered ICC news listing yields only pinned first-party story URLs",()=>{
 const page='<html><body>International Criminal Court News '+
  '<a href="/news/high-representative/vice-president-kaja-kallas-visits-international-criminal-court">Press Release</a>'+
  '<a href="https://evil.example/news/fake-icc-story">spoof</a>'+
  '<a href="/news/subscribe">subscribe</a></body></html>';
 assert.deepEqual(discoverIccArticleUrls(page),[url]);
 assert.deepEqual(discoverIccArticleUrls('<html>International Criminal Court</html>'),[]);
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
test("ICC native publication clock comes from article metadata, not retrieval or RSS time",()=>{
 const page='<html><head><title>ICC official announcement</title><meta property="article:published_time" content="2026-11-12T15:17:17+01:00"></head><body>International Criminal Court</body></html>';
 const row=parseIccArticleHtml(page,{url:"https://www.icc-cpi.int/node/241777",retrievedAt:"2026-11-12T17:00:00Z"});
 assert.equal(row.published_at,"2026-11-12T14:17:17.000Z");
 assert.equal(row.observed_at,"2026-11-12T17:00:00Z");
 const dateOnly=parseIccArticleHtml('<html><head><title>ICC official announcement</title></head><body>International Criminal Court <time datetime="2026-11-12">12 November 2026</time></body></html>',
  {url:"https://www.icc-cpi.int/node/241777",retrievedAt:"2026-11-12T17:00:00Z"});
 assert.equal(dateOnly.published_at,"2026-11-12T00:00:00.000Z");
 const textualDate=parseIccArticleHtml('<html><head><title>ICC official announcement</title><meta name="article:published_time" content="12 November 2026"></head><body>International Criminal Court</body></html>',
  {url:"https://www.icc-cpi.int/node/241777",retrievedAt:"2026-11-12T17:00:00Z"});
 assert.equal(textualDate.published_at,"2026-11-12T00:00:00.000Z");
 const fieldDate=parseIccArticleHtml('<html><head><title>ICC official announcement</title></head><body>International Criminal Court <div class="field field--name-field-publication-date">12 November 2026</div></body></html>',
  {url:"https://www.icc-cpi.int/node/241777",retrievedAt:"2026-11-12T17:00:00Z"});
 assert.equal(fieldDate.published_at,"2026-11-12T00:00:00.000Z");
 const prefixedDate=parseIccArticleHtml('<html><head><title>ICC official announcement</title></head><body>International Criminal Court <div class="news-type-date">Press Release: 2 November 2026</div></body></html>',
  {url:"https://www.icc-cpi.int/node/241777",retrievedAt:"2026-11-12T17:00:00Z"});
 assert.equal(prefixedDate.published_at,"2026-11-02T00:00:00.000Z");
 const canonicalAlias=parseIccArticleHtml('<html><head><title>ICC official announcement</title><link rel="canonical" href="/news/official-announcement"><meta property="article:published_time" content="2026-11-12"></head><body>International Criminal Court</body></html>',
  {url:"https://www.icc-cpi.int/node/241777",retrievedAt:"2026-11-12T17:00:00Z"});
 assert.equal(canonicalAlias.published_at,"2026-11-12T00:00:00.000Z");
 assert.throws(()=>parseIccArticleHtml('<html><head><title>ICC official announcement</title><link rel="canonical" href="https://evil.example/news/official-announcement"><meta property="article:published_time" content="2026-11-12"></head><body>International Criminal Court</body></html>',
  {url:"https://www.icc-cpi.int/node/241777"}),/ICC_ARTICLE_CANONICAL_MISMATCH/);
 assert.throws(()=>parseIccArticleHtml('<html>International Criminal Court</html>',{url:"https://www.icc-cpi.int/node/241777"}),/ICC_ARTICLE_TITLE_MISSING/);
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
test("ICC listing discovers a first-party story then verifies its article-native publication clock",async()=>{
 const requests=[];
 const x=await observeExistingPrivateP0Sources({now,fetchImpl:async(url,opts)=>{
  requests.push(url);
  assert.equal(opts.redirect,"error");
  if(url==="https://www.icc-cpi.int/news")
   return new Response('<html><body>International Criminal Court News '+
     '<a href="/news/high-representative/vice-president-kaja-kallas-visits-international-criminal-court">Press Release</a>'+
     '</body></html>',{headers:{"content-type":"text/html"}});
  if(url==="https://www.icc-cpi.int/news/high-representative/vice-president-kaja-kallas-visits-international-criminal-court")
   return new Response('<html><head><title>High Representative visits the International Criminal Court</title><meta property="article:published_time" content="2026-10-23T08:00:00Z"></head><body>International Criminal Court</body></html>',{headers:{"content-type":"text/html"}});
  return new Response("Denied",{status:403});
 }});
 const row=x.results.find(z=>z.source_id==="icc_news");
 assert.equal(requests.length,11);assert.equal(x.http_requests,11);
 assert.equal(requests.filter(z=>z===ICC_OFFICIAL_NEWS_RSS).length,0);
 assert.equal(row.status,"PRIVATE_CANDIDATES_PARSED");
 assert.equal(row.first_party_article_fetch_verified,true);
 assert.equal(row.current_original_publication_verified,true);
 assert.equal(row.native_publication_at_utc,"2026-10-23T08:00:00.000Z");
 assert.equal(row.commercial_eligible,false);
 assert.equal(x.signed_intelligence_published,false);
 assert.equal(x.payments,0);
 for(const status of [401,403,429]){
  const arr=[];
  const y=await observeExistingPrivateP0Sources({now,fetchImpl:async(url)=>{
   arr.push(url);return new Response("Denied",{status});
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
 assert.equal(row.reason,"ICC_NEWS_LISTING_PARSE_FAILED");
 assert.equal(row.official_rss_alternate_unavailable,true);
 assert.equal(y.commercial_eligible,false);
});
