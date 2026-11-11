// Read-only live discovery, never evidence originality or commercial rights.
// Reuters/AP feed endpoints are best-effort: no invented availability or articles.
export const RSS_FEEDS=Object.freeze([
 {id:"REUTERS_INDEX",url:"https://www.reutersagency.com/feed/?best-topics=top-news&post_type=best"},
 {id:"AP_INDEX",url:"https://apnews.com/hub/ap-top-news?output=rss"},
 {id:"BBC_WORLD",url:"https://feeds.bbci.co.uk/news/world/rss.xml"},
 {id:"BBC_ASIA",url:"https://feeds.bbci.co.uk/news/world/asia/rss.xml"},
 {id:"BBC_BUSINESS",url:"https://feeds.bbci.co.uk/news/business/rss.xml"},
 {id:"BBC_TECH",url:"https://feeds.bbci.co.uk/news/technology/rss.xml"}
]);
const COUNTRIES=Object.freeze([
 ["USA",/\b(?:US|U\.S\.|United States|American|Trump|White House|Washington)\b/iu],
 ["CHN",/\b(?:China|Chinese|Beijing|Xi Jinping)\b/iu],
 ["IND",/\b(?:India|Indian|Modi|New Delhi)\b/iu],
 ["RUS",/\b(?:Russia|Russian|Moscow|Putin)\b/iu],
 ["UKR",/\b(?:Ukraine|Ukrainian|Kyiv|Zelensky)\b/iu],
 ["GBR",/\b(?:Britain|British|United Kingdom|UK|London)\b/iu],
 ["IRN",/\b(?:Iran|Iranian|Tehran)\b/iu],
 ["ISR",/\b(?:Israel|Israeli|Jerusalem|Gaza)\b/iu],
 ["SAU",/\b(?:Saudi Arabia|Saudi|Riyadh)\b/iu],
 ["DEU",/\b(?:Germany|German|Berlin)\b/iu],
 ["FRA",/\b(?:France|French|Paris)\b/iu],
 ["JPN",/\b(?:Japan|Japanese|Tokyo)\b/iu],
 ["KOR",/\b(?:South Korea|Seoul)\b/iu],
 ["TUR",/\b(?:Turkey|Türkiye|Turkish|Ankara)\b/iu],
 ["CAN",/\b(?:Canada|Canadian|Ottawa)\b/iu],
 ["AUS",/\b(?:Australia|Australian|Canberra)\b/iu],
 ["PAK",/\b(?:Pakistan|Pakistani|Islamabad)\b/iu]
]);
export function countryHints(title){
 return COUNTRIES.filter(([,re])=>re.test(title)).map(([code])=>code);
}
function decodeXml(s){
 return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu,"$1")
 .replace(/&amp;/giu,"&").replace(/&lt;/giu,"<")
 .replace(/&gt;/giu,">").replace(/&quot;/giu,"\"")
 .replace(/&#39;|&apos;/giu,"'").trim();
}
const tag=(body,name)=>{
 const m=body.match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","iu"));
 return m?decodeXml(m[1]):"";
};
export function parseIndexRss(xml,{feedId="RSS"}={}){
 if(typeof xml!=="string"||xml.length>900000||
   /<!DOCTYPE\b|<!ENTITY\b/iu.test(xml))return [];
 const result=[];
 const blocks=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/giu),
   ...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/giu)];
 for(const block of blocks.slice(0,100)){
  const title=tag(block[1],"title"),pubDate=tag(block[1],"pubDate")||
   tag(block[1],"published")||tag(block[1],"updated");
  let link=tag(block[1],"link");
  if(!link){
   const href=block[1].match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/iu);
   if(href)link=decodeXml(href[1]);
  }
  let url;try{url=new URL(link)}catch{continue}
  if(url.protocol!=="https:"||url.username||url.password||url.port||
     !title||!pubDate||!Number.isFinite(Date.parse(pubDate)))continue;
  const countries=countryHints(title);
  if(!countries.length)continue; // no unsupported country attribution
  result.push({url:url.href, pubDate, title, countries,
   feed_origin:"RSS",publisher_feed:feedId});
 }
 return result;
}
const realSleep=ms=>new Promise(r=>setTimeout(r,ms));
export function createGdeltLimiter({now=Date.now,sleep=realSleep}={}){
 let previous=-Infinity;
 return async()=>{const delay=Math.max(0,1000-(now()-previous));
  if(delay)await sleep(delay);
  previous=now();
 };
}
export async function discoverShadowArticles({fetchImpl=fetch,sleep=realSleep,
  now=Date.now,log=console.log}={}){
 const gdelt=new URL("https://api.gdeltproject.org/api/v2/doc/doc");
 for(const [k,v] of Object.entries({
  query:'"United States" (tariffs OR sanctions OR export controls)',
  mode:"artlist",format:"json",maxrecords:"50",timespan:"24h"
 }))gdelt.searchParams.set(k,v);
 const limiter=createGdeltLimiter({now,sleep}),articles=[];
 async function queryGdelt(){
  await limiter();
  try{
   const response=await fetchImpl(gdelt,{signal:AbortSignal.timeout(25000),
    headers:{Accept:"application/json"},redirect:"error"});
   if(response.status===429){log("GDELT_429_RESPECT_RETRY_RSS_FALLBACK");return "RATE_LIMIT"}
   if(!response.ok){log("GDELT_HTTP_UNAVAILABLE",response.status);return "UNAVAILABLE"}
   const data=await response.json();
   if(!Array.isArray(data?.articles))return "UNAVAILABLE";
   articles.push(...data.articles.slice(0,50).map(a=>({
    ...a,countries:["USA"],feed_origin:"GDELT_INDEX"})));
   return "OK";
  }catch{log("GDELT_TEMPORARILY_UNAVAILABLE");return "UNAVAILABLE"}
 }
 const initial=await queryGdelt();
 if(initial!=="OK"||articles.length<20){
  // RSS is used immediately after the FIRST 429, before any GDELT retry.
  for(const feed of RSS_FEEDS){
   if(articles.length>=50)break;
   try{
    const response=await fetchImpl(feed.url,{signal:AbortSignal.timeout(18000),
     headers:{Accept:"application/rss+xml,application/atom+xml,application/xml,text/xml"},
     redirect:"error"});
    if(!response.ok){log("RSS_FEED_UNAVAILABLE",feed.id,response.status);continue}
    const body=await response.text();
    const items=parseIndexRss(body,{feedId:feed.id});
    articles.push(...items);
    log("RSS_INDEX_COUNTRY_HINTS",feed.id,items.length);
   }catch{log("RSS_FEED_TEMPORARILY_UNAVAILABLE",feed.id)}
  }
 }
 if(initial==="RATE_LIMIT"&&articles.length<20){
  // Bounded three-stage exponential backoff; never hammer provider or infer
  // successful retrieval from a 429. 1 request/s is a minimum spacing.
  for(let stage=0;stage<3&&articles.length<20;stage++){
   await sleep(1000*2**stage);
   const next=await queryGdelt();
   if(next==="OK")break;
   if(next!=="RATE_LIMIT")break;
  }
 }
 return articles;
}
