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
// Audit the real React Story card, whose displayed heading intentionally drops
// "Geomacro finds ". No source title, URL or article bytes are logged.
const decode = txt=>txt.replace(/&#x([0-9a-f]+);/giu,(_,n)=>String.fromCodePoint(parseInt(n,16)))
  .replace(/&#([0-9]+);/gu,(_,n)=>String.fromCodePoint(Number(n)))
  .replace(/&(amp|quot|apos|lt|gt);/giu,(_,n)=>({
    amp:"&",quot:'"',apos:"'",lt:"<",gt:">",
  })[n.toLowerCase()]);
const normalized = txt => decode(String(txt)).replace(/<[^>]*>/gu," ")
  .replace(/[\u2014\u2013;]/gu," ").replace(/\s+/gu," ").trim().toLowerCase();
function realD1CardDomains(html,signals){
  const rendered=new Set();
  if(typeof html!=="string"||html.length>6_000_000)return rendered;
  for(const article of html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/giu)){
    if(!/data-testid=["']geomacro-(?:find-card-v1|release-finding)["']/iu.test(article[1]))
      continue;
    const text=normalized(article[2]);
    for(const domain of DOMAINS){
      if(!text.includes(CATEGORIES[domain]))continue;
      if(signals.some(s=>s.category===domain&&typeof s.title==="string"&&
          text.includes(normalized(s.title.replace(/^Geomacro finds\s+/iu,"")))))
        rendered.add(domain);
    }
  }
  return rendered;
}
function categoryIsActive(html,domain){
  const label=CATEGORIES[domain];
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/giu)]
    .some(m=>/aria-pressed=["']true["']/iu.test(m[1])&&normalized(m[2]).includes(label));
}

export function evaluatePublicNews(doc,dom,now=Date.now(),categoryPages={}) {
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
  const rendered=realD1CardDomains(dom,doc.signals);
  // First page shows only 12 newest cards. A busy geopolitical category
  // can push Macro below the fold; inspect its real category-specific page.
  for(const domain of DOMAINS){
    if(rendered.has(domain)||typeof categoryPages[domain]!=="string")continue;
    const page=categoryPages[domain];
    if(!/<main\b[^>]*data-testid=["']geomacro-derived-news-desk["']/iu.test(page))
      continue;
    if(!categoryIsActive(page,domain))continue;
    if(realD1CardDomains(page,doc.signals).has(domain))rendered.add(domain);
  }
  const d1Domains=DOMAINS.filter(x=>counts[x].stored_72h>0);
  // Publisher quiet periods cannot manufacture articles. All three browse
  // controls must still render, while only D1-backed news needs a story card.
  const deskPresent=/<main\b[^>]*data-testid=["']geomacro-derived-news-desk["']/iu.test(dom);
  const tabs=new Set();
  for(const match of dom.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/giu)){
    const label=match[1].replace(/<[^>]*>/gu," ").replace(/\s+/gu," ").toLowerCase();
    for(const domain of DOMAINS)
      if(label.includes(CATEGORIES[domain]))tabs.add(domain);
  }
  const browserTabs=[...tabs].sort();
  const browserDomains=[...rendered].sort();
  return {
    schema:"geomacro.public-three-domain-freshness-observability.v1",
    checked_at:new Date(now).toISOString(),
    d1_domains_present:d1Domains,
    browser_domains_rendered:browserDomains,
    browser_tabs_available:browserTabs,
    actual_story_domains_required:d1Domains,
    category_counts:counts,
    last_original_publication_day:lastDates,
    publisher_realtime_guaranteed:false,
    current_signed_gro_verified:false,
    commercial_payments_authorized:false,
    raw_source_data_logged:false,
    accepted:deskPresent && browserTabs.length===3 &&
      d1Domains.every(domain=>rendered.has(domain)),
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
    process.env.GEOMACRO_BROWSER_CHROME_PATH,
    "/usr/bin/google-chrome","/usr/bin/chromium","/usr/bin/chromium-browser",
  ].filter(Boolean).find(p=>{
    try{execFileSync("test",["-x",p],{stdio:"ignore"});return true;}catch{return false;}
  });
  if(!chrome)throw Error("PUBLIC_NEWS_HEADLESS_BROWSER_MISSING");
  let html="";
  const {mkdtempSync,rmSync}=await import("node:fs");
  const {tmpdir}=await import("node:os");
  const {join}=await import("node:path");
  const profile=mkdtempSync(join(tmpdir(),"geomacro-browser-"));
  const render=(target)=>execFileSync(chrome,[
    "--headless=new","--no-sandbox","--no-zygote","--disable-gpu",
    "--disable-dev-shm-usage","--disable-extensions",
    "--disable-background-networking","--no-first-run",
    "--no-default-browser-check","--timeout=25000",
    "--virtual-time-budget=12000","--user-data-dir="+profile,
    "--dump-dom",target,
  ],{encoding:"utf8",timeout:60_000,maxBuffer:6_000_000,stdio:["ignore","pipe","ignore"]});
  const parsed=JSON.parse(body);
  const categoryPages={};
  let report;
  try{
    html=render(SITE);
    report=evaluatePublicNews(parsed,html);
    // No speculative navigation for quiet categories. The actual category
    // URL only resolves a D1 domain missing from the 12-card default page.
    for(const domain of report.d1_domains_present){
      if(report.browser_domains_rendered.includes(domain))continue;
      categoryPages[domain]=render(SITE+"?category="+encodeURIComponent(domain));
    }
    report=evaluatePublicNews(parsed,html,Date.now(),categoryPages);
  }catch { throw Error("PUBLIC_NEWS_BROWSER_RENDER_UNAVAILABLE"); }
  finally{rmSync(profile,{recursive:true,force:true});}
  console.log(JSON.stringify(report));
  if(!report.accepted) throw Error("PUBLIC_NEWS_BROWSER_TABS_OR_ACTUAL_CARDS_NOT_RENDERED");
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
