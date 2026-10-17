#!/usr/bin/env node
/**
 * #2052 production read-only newsroom observability.
 *
 * The journal is DERIVED only. Never print story text, publisher name,
 * article URL, authenticated endpoint payload, browser DOM or auth headers.
 * Report original publication times separate from poll/deployment time.
 */
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";

const DOMAINS=["geopolitics","macro","rare_earth"];
const CATEGORIES={geopolitics:"geopolitics",macro:"macro / fx",rare_earth:"critical minerals"};
const PUBLIC_D1="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news";
const SITE="https://geomacro.live/intelligence";
const DAY=86_400_000;

export function evaluatePublicNews(doc,dom,now=Date.now()) {
  if(!doc || doc.ok!==true || doc.schema!=="geomacro.website-derived-news-feed.v1" ||
     doc.original_release_delay_minutes!==15 || doc.retention_days!==3 || doc.retention_hours!==72 ||
     doc.delivery_scope!=="free_website_only" || !Array.isArray(doc.signals) ||
     doc.signals.length>250) throw Error("PUBLIC_NEWS_D1_SCHEMA_FAILED");
  if(typeof dom!=="string" || dom.length>6_000_000)throw Error("PUBLIC_NEWS_BROWSER_DOM_INVALID");
  const counts={},lastDates={};
  for(const domain of DOMAINS){
    const rows=doc.signals.filter(x=>x && x.category===domain);
    let lastDate=null,n24=0,n7=0;
    for(const row of rows){
      if(!/^(?:geopolitics|macro|rare_earth)-[0-9a-f]{8}$/u.test(row.id)||
         typeof row.title!=="string" || !row.title.startsWith("Geomacro finds ")||
         row.severity!==null || row.same_event_corrob_verified!==false ||
         !["exact","day"].includes(row.date_precision))
        throw Error("PUBLIC_NEWS_DERIVED_CONTRACT_FAILED");
      const ms=Date.parse(row.published_at);
      if(!Number.isFinite(ms)||ms>now || ms<now-72*60*60_000)
        throw Error("PUBLIC_NEWS_ORIGINAL_TIMESTAMP_INVALID");
      if(ms>=now-DAY)n24++;
      if(ms>=now-7*DAY)n7++;
      if(lastDate===null || ms>lastDate)lastDate=ms;
    }
    counts[domain]={stored_72h:rows.length,original_last_24h:n24,original_last_7d:n7};
    lastDates[domain]=lastDate===null?null:new Date(lastDate).toISOString().slice(0,10);
  }
  const cards=[...dom.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/giu)];
  const rendered=new Set();
  for(const card of cards){
    const text=card[1].replace(/<[^>]*>/gu," ").replace(/\s+/gu," ").toLowerCase();
    if(!text.includes("geomacro finds"))continue;
    for(const domain of DOMAINS){
      if(text.includes(CATEGORIES[domain]))rendered.add(domain);
    }
  }
  const d1Domains=DOMAINS.filter(x=>counts[x].stored_72h>0);
  const browserDomains=[...rendered].sort();
  return {
    schema:"geomacro.public-three-domain-freshness-observability.v1",
    checked_at:new Date(now).toISOString(),
    d1_domains_present:d1Domains,
    browser_domains_rendered:browserDomains,
    category_counts:counts,
    last_original_publication_day:lastDates,
    publisher_realtime_guaranteed:false,
    current_signed_gro_verified:false,
    commercial_payments_authorized:false,
    raw_source_data_logged:false,
    accepted:d1Domains.length===3 && browserDomains.length===3,
  };
}
export async function main(){
  const response=await fetch(PUBLIC_D1,{
    method:"GET",redirect:"error",cache:"no-store",
    headers:{Accept:"application/json"},signal:AbortSignal.timeout(12_000),
  });
  if(!response.ok||Number(response.headers.get("content-length")??0)>512_000)
    throw Error("PUBLIC_NEWS_D1_READBACK_HTTP_UNAVAILABLE");
  const body=await response.text();
  if(body.length>512_000)throw Error("PUBLIC_NEWS_D1_BODY_TOO_LARGE");
  const chrome=[
    "/usr/bin/google-chrome","/usr/bin/chromium","/usr/bin/chromium-browser",
  ].find(p=>{
    try{execFileSync("test",["-x",p],{stdio:"ignore"});return true;}catch{return false;}
  });
  if(!chrome)throw Error("PUBLIC_NEWS_HEADLESS_BROWSER_MISSING");
  let html="";
  try{
    html=execFileSync(chrome,[
      "--headless","--no-sandbox","--disable-gpu",
      "--disable-dev-shm-usage","--disable-background-networking",
      "--virtual-time-budget=18000","--dump-dom",SITE,
    ],{encoding:"utf8",timeout:47_000,maxBuffer:6_000_000,stdio:["ignore","pipe","ignore"]});
  }catch { throw Error("PUBLIC_NEWS_BROWSER_RENDER_UNAVAILABLE"); }
  const report=evaluatePublicNews(JSON.parse(body),html);
  console.log(JSON.stringify(report));
  if(!report.accepted) throw Error("PUBLIC_NEWS_THREE_DOMAINS_NOT_RENDERED");
  // Missing a 24h publisher release is a truthful business observation,
  // not itself ingestion failure or a trigger to backdate an older release.
  for(const domain of DOMAINS){
    if(report.category_counts[domain].original_last_24h===0){
      console.log("::warning title=Official source event quiet::"+domain+
        " has no original-dated free publisher release in the last 24 hours; do not fabricate one.");
    }
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{console.error("::error::"+String(error?.message??"UNKNOWN_PUBLIC_NEWS_AUDIT_FAILURE"));process.exitCode=2});
}
