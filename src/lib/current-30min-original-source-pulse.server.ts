/**
 * Unpaid observational status on category discovery GET. Never a basis for
 * paid availability/rights/scoring. A missing control plane reports UNKNOWN.
 */
const PULSE_URL =
  "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/source-pulse-30m";
const DOMAINS={
  geopolitics:"geopolitics",
  "macro-fx":"macro",
  "critical-minerals":"rare_earth",
} as const;
type Category=keyof typeof DOMAINS;
let cached:{at:number;value:unknown}|null=null;
const CACHED_MS=60_000;

export async function categoryOriginalSourcePulse(
  category:Category,
  {fetchImpl=fetch,now=Date.now()}:{fetchImpl?:typeof fetch;now?:number}={},
){
  const domain=DOMAINS[category];
  if(!domain)throw Error("SOURCE_PULSE_CATEGORY_INVALID");
  const unknown={
    status:"UNKNOWN_OR_NOT_YET_SYNCED",
    checked_at:null as string|null,
    publisher_topic_items_in_last_30m:null as number|null,
    no_new_relevant_original_item_observed:false,
  };
  let raw:unknown=null;
  if(cached&&now-cached.at>=0&&now-cached.at<CACHED_MS){
    raw=cached.value;
  }else {
    try {
      const res=await fetchImpl(PULSE_URL,{
        method:"GET",redirect:"error",
        headers:{Accept:"application/json"},
        signal:AbortSignal.timeout(1800),
      });
      if(res.ok) {
        const payload=await res.json();
        if(payload?.schema==="geomacro.public-three-domain-source-pulse-30m.v1") {
          raw=payload;
          cached={at:now,value:payload};
        }
      }
    }catch { /* health status never blocks canonical discovery */ }
  }
  const row=(raw as {categories?:Record<string,any>}|null)?.categories?.[domain];
  const isHealthy=row?.status==="SOURCE_NATIVE_OBSERVED" &&
    typeof row.last_checked_at==="string" &&
    Number.isFinite(Date.parse(row.last_checked_at)) &&
    Number.isSafeInteger(row.original_publisher_topic_items_within_30m) &&
    row.original_publisher_topic_items_within_30m>=0 &&
    row.original_publisher_topic_items_within_30m<=1000 &&
    (raw as any)?.is_real_current_verified_intelligence===false &&
    (raw as any)?.chargeable===false;
  const status=typeof row?.status==="string"&&[
    "SOURCE_NATIVE_OBSERVED","SOURCE_TRANSPORT_DEGRADED",
    "STALE_OR_UNAVAILABLE","UNKNOWN_NOT_YET_CHECKED",
  ].includes(row.status)?row.status:unknown.status;
  return {
    schema:"geomacro.category-original-source-pulse-30m.v1",
    target_poll_minutes:30,
    source_status_endpoint:PULSE_URL,
    observation:{
      ...unknown,
      status,
      checked_at:typeof row?.last_checked_at==="string"?row.last_checked_at:null,
      publisher_topic_items_in_last_30m:isHealthy?row.original_publisher_topic_items_within_30m:null,
      publisher_pair_sample_complete:isHealthy&&row.publisher_pair_sample_complete===true,
      // Never advertise a no-news result from only one of two publishers.
      no_new_relevant_original_item_observed:isHealthy&&
        row.publisher_pair_sample_complete===true&&
        row.original_publisher_topic_items_within_30m===0,
    },
    observational_only:true,
    current_signed_risk_intelligence_verified:false,
    independent_corroboration_verified:false,
    source_commercial_rights_verified:false,
    paid_availability_proven:false,
  };
}
