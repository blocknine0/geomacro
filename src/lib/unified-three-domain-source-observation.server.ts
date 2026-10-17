import {fetchWithoutRedirectUsing} from "./fetch-without-redirect";
/**
 * One source-private observational status read for all three category surfaces.
 * This reuses the existing bounded public D1 projection; it never scrapes,
 * fetches raw publisher text, triggers classification, signs a GRO or charges.
 */
const PULSE_URL =
  "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/source-pulse-30m";
const CATEGORIES = Object.freeze({
  geopolitics: "geopolitics",
  "macro-fx": "macro",
  "critical-minerals": "rare_earth",
} as const);
const STATUS = new Set([
  "SOURCE_NATIVE_OBSERVED",
  "SOURCE_TRANSPORT_DEGRADED",
  "STALE_OR_UNAVAILABLE",
  "UNKNOWN_NOT_YET_CHECKED",
]);
const MAX_AGE_MS = 75 * 60_000;
const MAX_FUTURE_MS = 5 * 60_000;
type SourceStatus = {
  status:string;
  last_checked_at:string|null;
  publisher_pairs_sampled:boolean;
  recent_original_topic_items:number|null;
  live_feed_event_verified:false;
};
const fail = ():SourceStatus => ({
  status: "UNKNOWN_OR_NOT_YET_SYNCED",
  last_checked_at: null,
  publisher_pairs_sampled: false,
  recent_original_topic_items: null,
  live_feed_event_verified: false,
});
export async function unifiedThreeDomainSourceObservation({
  fetchImpl = fetch,
  now = new Date(),
}: {fetchImpl?: typeof fetch;now?: Date} = {}) {
  const observed_at=now instanceof Date&&Number.isFinite(now.getTime())
    ?now.toISOString():new Date(0).toISOString();
  let rows: Record<string, unknown> | null=null;
  if(now instanceof Date&&Number.isFinite(now.getTime())){
    try {
      const response=await fetchWithoutRedirectUsing(fetchImpl,PULSE_URL,{
        method:"GET",redirect:"error",
        headers:{Accept:"application/json"},
        signal:AbortSignal.timeout(2500),
      });
      if(response.ok){
        const payload=await response.json();
        if(payload?.schema==="geomacro.public-three-domain-source-pulse-30m.v1"&&
          payload?.is_real_current_verified_intelligence===false&&
          payload?.chargeable===false&&
          payload?.categories&&typeof payload.categories==="object"&&
          !Array.isArray(payload.categories)){
          rows=payload.categories;
        }
      }
    } catch { /* unknown, never a green source status */ }
  }
  const categories=Object.create(null) as Record<string,SourceStatus>;
  let observed=0;
  for(const [name,domain] of Object.entries(CATEGORIES)){
    const row=rows?.[domain] as Record<string,unknown>|undefined;
    const stamp=typeof row?.last_checked_at==="string"?Date.parse(row.last_checked_at):NaN;
    const current=Number.isFinite(stamp)&&stamp<=now.getTime()+MAX_FUTURE_MS&&
      now.getTime()-stamp<=MAX_AGE_MS;
    const status=current&&typeof row?.status==="string"&&STATUS.has(row.status)
      ?row.status:row?"STALE_OR_UNAVAILABLE":"UNKNOWN_OR_NOT_YET_SYNCED";
    const sourceObserved=status==="SOURCE_NATIVE_OBSERVED" &&
      row?.publisher_pair_sample_complete===true&&
      typeof row?.original_publishers_attempted==="number"&&
      Number.isSafeInteger(row.original_publishers_attempted)&&
      typeof row.original_publishers_successful==="number"&&
      Number.isSafeInteger(row.original_publishers_successful)&&
      row.original_publishers_attempted>=2&&
      row.original_publishers_successful>=2&&
      typeof row.original_publisher_topic_items_within_30m==="number"&&
      Number.isSafeInteger(row.original_publisher_topic_items_within_30m)&&
      row.original_publisher_topic_items_within_30m>=0&&
      row.original_publisher_topic_items_within_30m<=1000;
    if(sourceObserved)observed++;
    categories[name]={
      status,
      last_checked_at:Number.isFinite(stamp)&&current
        ?new Date(stamp).toISOString():null,
      publisher_pairs_sampled:sourceObserved,
      recent_original_topic_items:sourceObserved
        ?Number(row.original_publisher_topic_items_within_30m):null,
      live_feed_event_verified:false,
    };
  }
  return {
    schema:"geomacro.unified-three-category-source-observation.v1",
    observed_at,endpoint_scope:"GEOMACRO_SOURCE_HEALTH_ONLY",
    categories,
    observed_category_count:observed,
    category_count:3,
    all_catalogued_sources_active_verified:false,
    catalogued_source_references_are_active_feeds:false,
    continuous_real_time_delivery_proven:false,
    raw_source_or_provider_identity_disclosed:false,
    original_article_content_delivered:false,
    confirmed_intelligence:false,
    commercial_eligibility_verified:false,
    chargeable:false,
    payment_required_now:false,
    x402_payment_authorized:false,
  };
}
