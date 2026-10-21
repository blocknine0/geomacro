#!/usr/bin/env node
/**
 * Real outside-in ORIGINAL publication -> FIRST verified Geomacro website HTML
 * observation. No fake event, no publisher GET, no tokens, no model or funds.
 * The first visible time is an UPPER BOUND based on observation (NOT the
 * actual browser's earliest render). Never certify a global 20-minute SLA
 * from an empty window or a single successful event.
 */
const D1="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news";
const SITE="https://geomacro.live/intelligence";
const DAY=86400_000,MINUTE=60_000;
const AGE_LIMIT=72*3600_000,MIN_DELAY=15*MINUTE,TARGET=20*MINUTE;
const CATEGORIES=["geopolitics","macro","rare_earth"];
const fail=(s)=>{throw Error("WEBSITE_VISIBILITY_PROOF_"+s);};
const date=(s)=>typeof s==="string"&&Number.isFinite(Date.parse(s))?Date.parse(s):NaN;
const decode=(s)=>s.replace(/&#x([0-9a-f]+);/giu,(_,hex)=>String.fromCodePoint(parseInt(hex,16)))
 .replace(/&#(\d+);/gu,(_,n)=>String.fromCodePoint(Number(n)))
 .replace(/&(?:amp|quot|apos|lt|gt|nbsp);/gu,m=>({
 "&amp;":"&","&quot;":'"',"&apos;":"'","&lt;":"<","&gt;":">","&nbsp;":" "}[m]));
const textOnly=(s)=>decode(s.replace(/<[^>]*>/gu,"")).replace(/\s+/gu," ").trim();
export function assessWebsiteVisibleOriginals({journal,html,now=new Date(),siteStatus=200}={}){
 if(!journal||journal.ok!==true||
    journal.schema!=="geomacro.website-derived-news-feed.v1"||
    journal.original_release_delay_minutes!==15||
    journal.retention_hours!==72||
    journal.ingest_clock_kind!=="D1_FIRST_INSERT_NOT_WEBSITE_FIRST_RENDER"||
    !Array.isArray(journal.signals)||!Array.isArray(journal.first_ingest)||
    journal.signals.length!==journal.first_ingest.length||
    journal.signals.length>250||
    !(now instanceof Date)||!Number.isFinite(now.getTime()))fail("JOURNAL_INVALID");
 const clock=now.getTime();
 // Only real SSR heading nodes qualify. A matching title in embedded JSON,
 // metadata or an iframe src is NOT first-HTML evidence.
 const headings=typeof html==="string"&&siteStatus===200?
  [...html.matchAll(/<h3\b[^>]*>([\s\S]{0,1250}?)<\/h3>/giu)]
   .map(m=>textOnly(m[1])):[];
 const latest={geopolitics:0,macro:0,rare_earth:0};
 let timeEligible=0,ssrVisible=0,within20=0,over20=0,
  validIngest=0,missingIngest=0,verifiedClockRows=0;
 const visibleElapsed=[];
 for(let i=0;i<journal.signals.length;i++){
  const row=journal.signals[i],meta=journal.first_ingest[i];
  if(!CATEGORIES.includes(row?.category)||typeof row?.id!=="string"||
     meta?.id!==row.id||typeof row.title!=="string"||
     !row.title.startsWith("Geomacro finds "))fail("RECORD_INVALID");
  const publish=date(row.published_at),first=date(meta.first_seen_at);
  if(Number.isFinite(first)&&Number.isFinite(publish)&&
     first>=publish+MIN_DELAY&&first<=clock+MINUTE)validIngest++;
  else missingIngest++;
  // Native exact clock only; never turn day precision, feed updated-at or
  // first-ingest time into a fabricated precise original publication.
  if(row.date_precision!=="exact"||!Number.isFinite(publish)||
     publish>clock||publish<clock-AGE_LIMIT)continue;
  verifiedClockRows++;
  if(clock-publish>TARGET)continue;
  timeEligible++;latest[row.category]++;
  const title=textOnly(row.title.replace(/^Geomacro finds\s+/iu,""));
  const headingSeen=headings.some(h=>h===title);
  if(!headingSeen)continue;
  ssrVisible++;
  const elapsed=clock-publish;
  visibleElapsed.push(Math.round(elapsed/MINUTE*100)/100);
  if(elapsed<=TARGET && Number.isFinite(first) && first>=publish+MIN_DELAY &&
      first<=clock+MINUTE)within20++;
  else over20++;
 }
 visibleElapsed.sort((a,b)=>a-b);
 return {
  schema:"geomacro.original-to-website-html-observation.v1",
  checked_at:now.toISOString(),
  journal_rows:journal.signals.length,
  server_html_http_status:siteStatus,
  server_html_heading_count:headings.length,
  exact_original_clock_rows:verifiedClockRows,
  record_first_ingest_clock_verified:validIngest,
  record_first_ingest_clock_missing_or_invalid:missingIngest,
  fresh_20min_exact_original_candidates:timeEligible,
  fresh_20min_original_by_category:latest,
  candidates_visible_in_actual_website_ssr: ssrVisible,
  candidates_visible_and_first_d1_ingest_verified_under_20min:within20,
  missing_or_inconclusive_in_fresh_window:timeEligible-within20,
  observed_visible_upper_bound_max_minutes:visibleElapsed.length?visibleElapsed.at(-1):null,
  sampled_original_to_website_html_20min_evidence:within20>0,
  universal_195x3_20min_sla_verified:false,
  real_browser_first_paint_verified:false,
  original_to_website_first_render_exact_instant_claimed:false,
  observed_website_html_only:true,
  source_rights_qualified:false,commercial_delivery_authorized:false,
  signed_gri_verified:false,
  upstream_titles_logged:false,upstream_urls_logged:false,
  supabase_requests:0,b2_requests:0,d1_writes:0,payments:0,
 };
}
async function read(url,type,fetcher){
 const response=await fetcher(url,{method:"GET",redirect:"error",cache:"no-store",
  headers:{Accept:type},signal:AbortSignal.timeout(12_000)});
 const body=await response.text();
 if(body.length>1_600_000)fail("OVERSIZED_RESPONSE");
 return {status:response.status,body};
}
export async function inspectLiveWebsiteVisibility(fetcher=fetch,now=new Date()){
 const [one,two]=await Promise.all([
  read(D1,"application/json",fetcher),
  read(SITE,"text/html",fetcher),
 ]);
 if(one.status!==200)fail("JOURNAL_UNAVAILABLE");
 const journal=JSON.parse(one.body);
 return assessWebsiteVisibleOriginals({
  journal,html:two.body,siteStatus:two.status,now,
 });
}
if(process.argv[1]?.endsWith("verify-original-to-website-visible-20m.mjs")){
 try{console.log(JSON.stringify(await inspectLiveWebsiteVisibility()))}
 catch{console.error("::warning::ORIGINAL_TO_WEBSITE_HTML_20M_EVIDENCE_UNAVAILABLE");process.exitCode=2;}
}
