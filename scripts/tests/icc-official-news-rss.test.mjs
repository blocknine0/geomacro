import test from "node:test";
import assert from "node:assert/strict";
import {
 ICC_OFFICIAL_NEWS_RSS,pinnedIccOriginalNewsLink,parseIccOfficialNewsRss,parseIccOfficialNewsItems
} from "../lib/icc-official-news-rss.mjs";
import {observeExistingPrivateP0Sources} from "../ops/observe-p0-private-source-runtime.mjs";
import {parseIccArticleHtml,discoverIccArticleUrls,parseIccNewsRss,ICC_NEWS_RSS_URL} from "../../global-intelligence/adapters/icc-news.mjs";
const now=new Date("2026-10-24T12:20:00Z");
const url="https://www.icc-cpi.int/news/high-representative/vice-president-kaja-kallas-visits-international-criminal-court";
const item='<item><title><![CDATA[High Representative visits the International Criminal Court]]></title>'+
 '<link>'+url+'</link><pubDate>Fri, 23 Oct 2026 08:00:00 GMT</pubDate></item>';
const rss=(items=item)=>'<?xml version="1.0"?><rss version="2.0"><channel>'+
 '<title>International Criminal Court - News</title>'+items+'</channel></rss>';
test("court-affiliated official media page pins exact RSS and original article paths",()=>{
 assert.equal(ICC_OFFICIAL_NEWS_RSS,"https://www.icc-cpi.int/rss.xml");
 assert.equal(ICC_NEWS_RSS_URL,ICC_OFFICIAL_NEWS_RSS);
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
 assert.deepEqual(discoverIccArticleUrls('<html>International Criminal Court <a HREF="/node/241777">Latest release</a></html>'),["https://www.icc-cpi.int/node/241777"]);
 assert.deepEqual(discoverIccArticleUrls('<html>International Criminal Court <a data-drupal-link-system-path="node/241778">Latest release</a></html>'),["https://www.icc-cpi.int/node/241778"]);
 assert.deepEqual(discoverIccArticleUrls('<html>International Criminal Court <article data-drupal-link-system-path="node/241780"><h2>ICC listing card</h2></article></html>'),["https://www.icc-cpi.int/node/241780"]);
 assert.deepEqual(discoverIccArticleUrls('<html>International Criminal Court <a href="/node/241779?ln=en&amp;page=1">Latest release</a></html>'),["https://www.icc-cpi.int/node/241779"]);
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

test("ICC official RSS native pubDate and dc:date become dated first-party items only",()=>{
 const dated='<item><title><![CDATA[ICC statement dated by publisher]]></title>'+
  '<link>'+url+'</link><pubDate>Fri, 23 Oct 2026 08:00:00 GMT</pubDate></item>'+
  '<item><title><![CDATA[ICC decision with Dublin Core date]]></title>'+
  '<link>https://www.icc-cpi.int/node/241778</link><dc:date>2026-10-22T09:30:00Z</dc:date></item>';
 const receipt=parseIccOfficialNewsRss(rss(dated));
 const items=parseIccOfficialNewsItems(rss(dated));
 assert.equal(receipt.publisher_native_feed_clock_verified,true);
 assert.equal(receipt.feed_date_assertion_count,2);
 assert.deepEqual(items.map(x=>x.publishedAt),
  ["2026-10-23T08:00:00.000Z","2026-10-22T09:30:00.000Z"]);
 assert.ok(items.every(x=>{
  const itemUrl=new URL(x.url);
  return itemUrl.protocol==="https:"&&itemUrl.hostname==="www.icc-cpi.int";
 }));
});
test("ICC RSS XML entities are decoded once",()=>{
 const escaped='<item><title>International Criminal Court &amp;lt;literal&amp;gt; &amp; news item</title>'+
  '<link>'+url+'</link><pubDate>Fri, 23 Oct 2026 08:00:00 GMT</pubDate></item>';
 const [row]=parseIccNewsRss(rss(escaped),{retrievedAt:now.toISOString()});
 assert.equal(row.title,"International Criminal Court &lt;literal&gt; & news item");
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
test("ICC runtime fetches official RSS once and keeps article/right claims false",async()=>{
 const requests=[];
 const result=await observeExistingPrivateP0Sources({now,fetchImpl:async(url,opts)=>{
  requests.push(url);assert.equal(opts.redirect,"error");
  if(url===ICC_OFFICIAL_NEWS_RSS)
   return new Response(rss(item),{headers:{"content-type":"application/rss+xml"}});
  return new Response("Denied",{status:403});
 }});
 const row=result.results.find(x=>x.source_id==="icc_news");
 assert.equal(requests.length,10);assert.equal(result.http_requests,10);
 assert.equal(requests.filter(url=>url===ICC_OFFICIAL_NEWS_RSS).length,1);
 assert.equal(requests.includes("https://www.icc-cpi.int/news"),false);
 assert.equal(row.status,"PRIVATE_CANDIDATES_PARSED");
 assert.equal(row.official_first_party_rss_verified,true);
 assert.equal(row.current_original_publication_verified,false);
 assert.equal(row.publisher_native_rss_dates_observed,1);
 assert.equal(row.commercial_eligible,false);
 assert.equal(result.signed_intelligence_published,false);
 assert.equal(result.payments,0);
 for(const status of [401,403,429]){
  const urls=[];
  const denied=await observeExistingPrivateP0Sources({now,fetchImpl:async(url)=>{
   urls.push(url);return new Response("Denied",{status});
  }});
  assert.equal(urls.length,10);assert.equal(denied.http_requests,10);
  assert.equal(denied.results.find(x=>x.source_id==="icc_news").reason,"HTTP_"+status);
 }
});
test("invalid ICC RSS fails closed without retry or entitlement",async()=>{
 let count=0;
 const result=await observeExistingPrivateP0Sources({now,fetchImpl:async(url)=>{
  count++;
  if(url===ICC_OFFICIAL_NEWS_RSS)
   return new Response("<html>Login, please</html>",{headers:{"content-type":"text/html"}});
  return new Response("Denied",{status:403});
 }});
 assert.equal(count,10);
 const row=result.results.find(x=>x.source_id==="icc_news");
 assert.equal(row.status,"UNAVAILABLE");
 assert.equal(row.reason,"ICC_OFFICIAL_RSS_MIME_INVALID");
 assert.equal(row.commercial_eligible,false);
});
