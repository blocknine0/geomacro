/**
 * Independent production deep-health for the free 72h D1 derived-news
 * product. This is NOT the legacy signed Intelligence/GRI/Risk Indices health.
 * Every 200 is backed by real original-dated unscored D1 records.
 */
const FEED_URL="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-immediate";
const RETENTION=72*60*60_000;
const MIN_DELAY=0;
const CAT=["geopolitics","macro","rare_earth"] as const;
type Category=typeof CAT[number];
type FreeStory={
  category?:unknown;date_precision?:unknown;published_at?:unknown;
  title?:unknown;severity?:unknown;same_event_corrob_verified?:unknown;
  status?:unknown;id?:unknown;source_url?:unknown;
};
type FreeFeed={
  ok?:unknown;schema?:unknown;checked_at?:unknown;
  original_release_delay_minutes?:unknown;
  retention_hours?:unknown;retention_days?:unknown;delivery_scope?:unknown;
  scored?:unknown;chargeable?:unknown;supabase_dependency?:unknown;
  signals?:unknown;page_offset?:unknown;page_size?:unknown;
  has_more?:unknown;next_offset?:unknown;
};
const empty=()=>({geopolitics:0,macro:0,rare_earth:0});
function validPublication(story:FreeStory,now:number){
  if(typeof story.published_at!=="string")return false;
  if(story.date_precision==="exact"){
    if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u.test(story.published_at))return false;
    const t=Date.parse(story.published_at);
    return Number.isFinite(t)&&t>=now-RETENTION&&t<=now-MIN_DELAY;
  }
  if(story.date_precision==="day"){
    if(!/^\d{4}-\d\d-\d\d$/u.test(story.published_at))return false;
    const t=Date.parse(story.published_at+"T00:00:00.000Z");
    return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===story.published_at&&
      t>=now-RETENTION&&t+36*60*60_000+MIN_DELAY<=now;
  }
  return false;
}
function result(ok:boolean,reason:string,counts=empty()){
  const rows=Object.values(counts).reduce((a,b)=>a+b,0);
  return {statusCode:ok?200:503,body:{
    schema:"geomacro.free-derived-deep-health.v1",ok,
    product:"free-derived-news",reason,
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
     input.page_offset!==0||input.page_size!==250||
     !Array.isArray(input.signals)||input.signals.length>250)
    return result(false,"FREE_D1_CONTRACT_INVALID");
  // Retrieval/checkpoint time does not turn old events into fresh evidence.
  const checked=Date.parse(String(input.checked_at??""));
  if(!Number.isFinite(checked)||checked>now+60_000||now-checked>120_000)
    return result(false,"FREE_D1_RESPONSE_CLOCK_STALE");
  const counts=empty();
  const ids=new Set<string>();
  for(const unknown of input.signals){
    if(!unknown||typeof unknown!=="object"||Array.isArray(unknown))
      return result(false,"FREE_D1_ROW_INVALID");
    const row=unknown as FreeStory;
    if(!CAT.includes(row.category as Category)||
      typeof row.id!=="string"||!new RegExp("^(geopolitics|macro|rare_earth)-[a-f0-9]{8}$","u").test(row.id)||
      ids.has(row.id)||typeof row.title!=="string"||
      !row.title.startsWith("Geomacro finds ")||
      row.title.length>240||
      row.severity!==null||row.same_event_corrob_verified!==false||
      !["official_release_observed_unscored","official_feed_candidate_unscored"].includes(String(row.status))||
      !validPublication(row,now)||
      /https?:\/\/|www\.|<script/iu.test(JSON.stringify(row)))
      return result(false,"FREE_D1_ROW_ORIGINAL_RIGHTS_BOUNDARY_INVALID");
    ids.add(row.id);
    counts[row.category as Category]++;
  }
  if(ids.size===0)return result(false,"NO_CURRENT_FREE_ORIGINAL_OBSERVATION");
  return result(true,"FREE_D1_DERIVED_NEWS_READBACK_OK",counts);
}
export async function probeFreeDerivedDeepHealth({
  fetcher=fetch,now=()=>Date.now(),
}:{
  fetcher?:typeof fetch;now?:()=>number;
}={}){
  try{
    const response=await fetcher(FEED_URL,{
      method:"GET",redirect:"error",headers:{Accept:"application/json","Cache-Control":"no-cache"},
      signal:AbortSignal.timeout(7_000),
    });
    if(response.status!==200||
       !(response.headers.get("content-type")??"").includes("application/json"))
      return result(false,"FREE_D1_TRANSPORT_UNAVAILABLE");
    const text=await response.text();
    if(text.length>1_000_000)return result(false,"FREE_D1_RESPONSE_OVERSIZE");
    return classifyFreeDerivedFeed(JSON.parse(text) as FreeFeed,now());
  }catch{
    return result(false,"FREE_D1_TRANSPORT_UNAVAILABLE");
  }
}
