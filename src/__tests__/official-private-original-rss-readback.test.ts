import { describe,expect,it,vi } from "vitest";
import { readFileSync } from "node:fs";
import { OFFICIAL_NATIVE_FEEDS,fetchOfficialNativeArticles,
  recoverPrivateOfficialRssMissingDates } from "../../scripts/lib/official-native-rss.mjs";
const now=new Date("2026-10-10T07:00:00Z");
const URLS={
 macro:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010a.htm",
 rare_earth:"https://www.usgs.gov/news/national-news-release/critical-minerals-supply-chain",
};
const title={
 macro:"Federal Reserve releases monetary policy and interest rate decision",
 rare_earth:"USGS critical minerals lithium supply chain deposit assessment",
};
const feed=(domain:"macro"|"rare_earth",opts:{native?:string,url?:string}={})=>
 '<rss><channel><item><title>'+title[domain]+'</title><link>'+
 (opts.url??URLS[domain])+'</link>'+
 (opts.native?'<pubDate>'+opts.native+'</pubDate>':'')+'</item></channel></rss>';
const html=(clock="2026-10-10T06:25:00Z")=>
 '<html><meta property="article:published_time" content="'+clock+'"></html>';
const reply=(v:string,type:string)=>new Response(v,{headers:{"content-type":type}});
describe("#1827 first-party no-raw native original-page recovery to actual private classifier",()=>{
 it("admits a real precise publisher article in either canonical macro/minerals primary feed",async()=>{
  for(const domain of ["macro","rare_earth"] as const){
   const urls:string[]=[];
   const fetchImpl=vi.fn(async(url:string,opts:RequestInit)=>{
     urls.push(url);
     expect(opts.redirect).toBe("error");
     if(url===OFFICIAL_NATIVE_FEEDS[domain].url)
       return reply(feed(domain),"application/rss+xml");
     expect(url).toBe(URLS[domain]);
     return reply(html(),"text/html");
   });
   const details:Record<string,unknown>={};
   const rows=await fetchOfficialNativeArticles(domain,{now,fetchImpl,
     maxAgeMs:6*3600000,includeSecondPublisher:false,
     includeOriginalPageDateFallback:true,diagnostics:details});
   expect(urls).toEqual([OFFICIAL_NATIVE_FEEDS[domain].url,URLS[domain]]);
   expect(rows).toHaveLength(1);
   expect(rows[0]).toMatchObject({
     publishedAt:"2026-10-10T06:25:00.000Z",
     discoveryProvider:"official_native_rss",
     nativePublishedAtVerified:true,
     nativeTimeEvidence:"publisher_original_article_datePublished",
     privateOnly:true,rightsVerified:false,commercialEligible:false,
   });
   expect(rows[0]).not.toHaveProperty("severity");
   expect(rows[0]).not.toHaveProperty("score");
   expect(details.original_page_precise_date_checks).toBe(1);
   expect(details.original_page_precise_date_admitted).toBe(1);
  }
 });
 it("rejects modified-time-only pages, stale source dates and future per-item pubDate",async()=>{
  const future=feed("macro",{native:"Sun, 11 Oct 2026 06:25:00 GMT"});
  let called=0;
  const ignored=await recoverPrivateOfficialRssMissingDates(future,"macro",{
   now,fetchImpl:async()=>{called++;return reply(html(),"text/html");},
  });
  expect(ignored).toEqual([]);
  expect(called).toBe(0);
  const modified=html().replace("article:published_time","article:modified_time");
  const noDate=await recoverPrivateOfficialRssMissingDates(feed("macro"),"macro",{
   now,fetchImpl:async()=>reply(modified,"text/html"),
  });
  expect(noDate).toEqual([]);
  const old=await recoverPrivateOfficialRssMissingDates(feed("macro"),"macro",{
   now,maxAgeMs:90*60000,
   fetchImpl:async()=>reply(html("2026-10-10T03:00:00Z"),"text/html"),
  });
  expect(old).toEqual([]);
  const fake=await recoverPrivateOfficialRssMissingDates(
   feed("macro",{url:"https://www.federalreserve.gov.evil.test/newsevents/pressreleases/monetary20261010a.htm"}),
   "macro",{now,fetchImpl:async()=>{throw Error("must not network");}});
  expect(fake).toEqual([]);
 });
 it("limits publisher HTML GETs to exactly 2 and never emits raw customer article",async()=>{
  const src=OFFICIAL_NATIVE_FEEDS.macro;
  const xml="<rss><channel>"+["a","b","c"].map(letter=>
    "<item><title>Federal Reserve monetary policy interest rates "+letter+
    "</title><link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010"+
    letter+".htm</link></item>").join("")+"</channel></rss>";
  const calls:string[]=[];
  const details:Record<string,number>={};
  const result=await recoverPrivateOfficialRssMissingDates(xml,"macro",{
   now,fetchImpl:async(url:string)=>{
     calls.push(url);
     return reply(html(),"text/html");
   },diagnostics:details,
  });
  expect(src.url).toContain("press_monetary.xml");
  expect(calls).toHaveLength(2);
  expect(result).toHaveLength(2);
  expect(details.original_page_precise_date_checks).toBe(2);
  expect(details.original_page_precise_date_admitted).toBe(2);
  expect(result.every((x:any)=>x.commercialEligible===false&&x.rightsVerified===false)).toBe(true);
 });
 it("does not grant paid or source rights and does not affect ordinary public source checks",()=>{
  const source=readFileSync("scripts/lib/official-native-rss.mjs","utf8");
  const ingest=readFileSync("scripts/ingest-news.js","utf8");
  expect(ingest).toContain("if (PRIVATE_B2_STAGE)");
  expect(ingest).toContain("includeOriginalPageDateFallback: true");
  expect(source).toContain("includeOriginalPageDateFallback = false");
  expect(source).toContain("original_page_precise_date_admitted");
  expect(source).toContain('commercialEligible:false');
  const stage=readFileSync(".github/workflows/restricted-private-current-scoring.yml","utf8");
  expect(stage).toContain("contains(github.event.head_commit.message, '(#1929)')");
  expect(stage).toContain("B2_ACCOUNT_QUOTA_REQUIRED: \"1\"");
  expect(stage).not.toContain("schedule:");
  expect(source).not.toContain("source_title_public");
 });
});