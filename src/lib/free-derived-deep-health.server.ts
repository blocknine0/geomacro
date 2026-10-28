/**
 * Independent production deep-health for the free 72h permanent static Finds
 * archive. This is NOT legacy signed Intelligence/GRI/Risk Indices health.
 * Public health reads do not consume D1 quota; only genuinely original-dated,
 * unscored official observations count toward availability.
 */
const FEED_URL="https://geomacro-public-finds-archive.daspallab202391.workers.dev/latest.json";
const RETENTION=72*60*60_000;
// Three-hour static rebuilds can cross the 72h boundary between publishes.
// Allow a single missed refresh, but never certify an abandoned archive.
const MAX_STATIC_REFRESH_LAG=6*60*60_000;
const MIN_DELAY=0;
const CAT=["geopolitics","macro","rare_earth"] as const;
type Category=typeof CAT[number];
type FreeStory={
  category?:unknown;date_precision?:unknown;published_at?:unknown;
  title?:unknown;severity?:unknown;same_event_corrob_verified?:unknown;
  status?:unknown;id?:unknown;source_url?:unknown;
  development_type?:unknown;geography?:unknown;sources_credited?:unknown;
};
type FreeFeed={
  ok?:unknown;schema?:unknown;checked_at?:unknown;
  original_release_delay_minutes?:unknown;
  retention_hours?:unknown;retention_days?:unknown;delivery_scope?:unknown;
  scored?:unknown;chargeable?:unknown;supabase_dependency?:unknown;
  signals?:unknown;page_offset?:unknown;page_size?:unknown;
  has_more?:unknown;next_offset?:unknown;
};
/** The unverified-only source hostname is not an upstream article URL. */
const FEED_HOST_LABEL=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
function safeOsintMonitoredHostCredit(value:unknown):value is string{
 if(typeof value!=="string"||value.length>230||
    !value.startsWith("Monitored feed: "))return false;
 let host=value.slice("Monitored feed: ".length);
 const suffix=" (aggregator; original publisher not verified)";
 if(host.endsWith(suffix)){
  host=host.slice(0,-suffix.length);
  if(host!=="news.google.com")return false;
 }
 if(!host||host.length>120||host!==host.toLowerCase()||
    host.startsWith(".")||host.endsWith(".")||host.includes(".."))return false;
 const labels=host.split(".");
 return labels.length>=2&&labels.every(x=>x.length<=63&&FEED_HOST_LABEL.test(x))&&
   /^[a-z]{2,63}$/u.test(labels.at(-1)??"");
}
const empty=()=>({geopolitics:0,macro:0,rare_earth:0});
/** At-build validation prevents backfilled/stale/future rows being hidden.
 * At-read expiration never promotes an expired record to current. */
function publicationState(story:FreeStory,now:number):"CURRENT"|"EXPIRED"|"INVALID"{
  if(typeof story.published_at!=="string")return "INVALID";
  let at:number;
  if(story.date_precision==="exact"){
    if(!/^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(?:\\.\\d+)?Z$/u.test(story.published_at))
      return "INVALID";
    at=Date.parse(story.published_at);
    if(!Number.isFinite(at)||new Date(at).toISOString().slice(0,19)!==
       story.published_at.slice(0,19)||at>now-MIN_DELAY)return "INVALID";
  }else if(story.date_precision==="day"){
    if(!/^\\d{4}-\\d\\d-\\d\\d$/u.test(story.published_at))
      return "INVALID";
    at=Date.parse(story.published_at+"T00:00:00.000Z");
    if(!Number.isFinite(at)||new Date(at).toISOString().slice(0,10)!==
       story.published_at||at+36*60*60_000+MIN_DELAY>now)return "INVALID";
  }else return "INVALID";
  return at<now-RETENTION?"EXPIRED":"CURRENT";
}
function result(ok:boolean,reason:string,counts=empty()){
  const rows=Object.values(counts).reduce((a,b)=>a+b,0);
  return {statusCode:ok?200:503,body:{
    schema:"geomacro.free-derived-deep-health.v1",ok,
    product:"free-derived-news",reason,feed_source:"permanent_static_archive",d1_reads_performed:false,
    current_72h_derived_rows:ok?rows:0,
    categories:counts,
    all_three_categories_have_recent_originals:
      ok&&CAT.every(c=>counts[c]>0),
    original_release_delay_minutes:0,original_retention_hours:72,
    legacy_signed_intelligence_gri_risk_indices:"NOT_EVALUATED_IN_THIS_PROFILE",
    current_signed_hot_snapshots_attested:false,
    current_numerical_gri_verified:false,
    all_195_countries_fresh_news_verified:false,
    free_website_ssr_attested:false,
    consumer_commercial_rights_verified:false,
    x402_payment_authorized:false,chargeable:false,settlement_performed:false,
    b2_read_performed:false,supabase_access_performed:false,
  }};
}
export function classifyFreeDerivedFeed(input:FreeFeed,now=Date.now()){
  if(!Number.isFinite(now)||!input||input.ok!==true||
     input.schema!=="geomacro.website-derived-news-feed.v1"||
     (input.original_release_delay_minutes!==0&&input.original_release_delay_minutes!==15)||
     input.retention_hours!==72||input.retention_days!==3||
     input.delivery_scope!=="free_website_only"||
     input.scored!==false||input.chargeable!==false||
     input.supabase_dependency!==false||
     (input.page_offset!==undefined&&input.page_offset!==0)||
     (input.page_size!==undefined&&input.page_size!==250)||
     (input.has_more!==undefined&&input.has_more!==false)||
     (input.next_offset!==undefined&&input.next_offset!==null)||
     !Array.isArray(input.signals)||input.signals.length>250)
    return result(false,"FREE_ARCHIVE_CONTRACT_INVALID");
  // The archive's generated_at clock can be cached; it never makes an old
  // story current. The actual event/feed timestamps below are the freshness gate.
  const checked=Date.parse(String(input.checked_at??""));
  if(!Number.isFinite(checked)||checked>now+60_000||
     now-checked>MAX_STATIC_REFRESH_LAG)
    return result(false,"FREE_ARCHIVE_CLOCK_INVALID");
  const counts=empty();
  const ids=new Set<string>();
  for(const unknown of input.signals){
    if(!unknown||typeof unknown!=="object"||Array.isArray(unknown))
      return result(false,"FREE_ARCHIVE_ROW_INVALID");
    const row=unknown as FreeStory;
    if(!CAT.includes(row.category as Category)||
      typeof row.id!=="string"||!new RegExp("^(geopolitics|macro|rare_earth)-[a-f0-9]{8}$","u").test(row.id)||
      ids.has(row.id)||typeof row.title!=="string"||
      !row.title.startsWith("Geomacro finds ")||
      row.title.length>240||
      row.severity!==null||row.same_event_corrob_verified!==false||
      publicationState(row,checked)!=="CURRENT"||
      publicationState(row,now)==="INVALID"||
      /https?:\/\/|www\.|<script/iu.test(JSON.stringify(
        row.status==="osint_feed_observed_unverified"?
          {...row,sources_credited:[]} : row
      )))
      return result(false,"FREE_ARCHIVE_ROW_ORIGINAL_RIGHTS_BOUNDARY_INVALID");
    ids.add(row.id);
    if(row.status==="osint_feed_observed_unverified"){
      const credits=Array.isArray(row.sources_credited)?row.sources_credited:[];
      if(row.date_precision!=="exact"||
         row.development_type!=="unverified OSINT feed observation"||
         row.geography!==null||credits.length!==1||
         !safeOsintMonitoredHostCredit(credits[0]))
        return result(false,"FREE_ARCHIVE_OSINT_ROW_INVALID");
      // Never count unverified feeds, regardless of expiry.
      continue;
    }
    if(!["official_release_observed_unscored","official_feed_candidate_unscored"].includes(String(row.status)))
      return result(false,"FREE_ARCHIVE_ROW_ORIGINAL_RIGHTS_BOUNDARY_INVALID");
    // Browser public-derived-news-client already filters expired rows at read time.
    // Match its behavior, without relaxing the source/rights/at-build checks.
    if(publicationState(row,now)==="EXPIRED")continue;
    counts[row.category as Category]++;
  }
  if(Object.values(counts).reduce((sum,value)=>sum+value,0)===0)
    return result(false,"NO_CURRENT_FREE_OFFICIAL_ORIGINAL",counts);
  return result(true,"FREE_ARCHIVE_READBACK_OK",counts);
}
export async function probeFreeDerivedDeepHealth({
  fetcher=fetch,now=()=>Date.now(),
}:{
  fetcher?:typeof fetch;now?:()=>number;
}={}){
  try{
    // The static Worker may issue a canonical-path redirect. The deploy
    // acceptance follows redirects, so health must do the same while refusing
    // any redirect that leaves the pinned archive origin.
    const response=await fetcher(FEED_URL,{
      method:"GET",redirect:"follow",headers:{Accept:"application/json","Cache-Control":"no-cache"},
      signal:AbortSignal.timeout(7_000),
    });
    const finalUrl=response.url;
    if(finalUrl){
      let finalOrigin="";
      try{finalOrigin=new URL(finalUrl).origin;}catch{}
      if(finalOrigin!==new URL(FEED_URL).origin)
        return result(false,"FREE_ARCHIVE_REDIRECT_ORIGIN_INVALID");
    }
    if(response.status!==200||
       !(response.headers.get("content-type")??"").includes("application/json"))
      return result(false,"FREE_ARCHIVE_TRANSPORT_UNAVAILABLE");
    const text=await response.text();
    if(text.length>1_000_000)return result(false,"FREE_ARCHIVE_RESPONSE_OVERSIZE");
    return classifyFreeDerivedFeed(JSON.parse(text) as FreeFeed,now());
  }catch{
    return result(false,"FREE_ARCHIVE_TRANSPORT_UNAVAILABLE");
  }
}
