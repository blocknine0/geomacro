/**
 * Public status for private original-publisher monitoring, NOT public articles,
 * original headlines, GRO scores, commercial licensing or paid availability.
 * Every field is revalidated from an independently obtained D1 checkpoint.
 */
const DOMAINS=Object.freeze(["geopolitics","macro","rare_earth"]);
const MAX_STATUS_AGE_MS=75*60_000;
function validCount(value) { return Number.isSafeInteger(value)&&value>=0&&value<=1000; }
function dateMs(raw) {
  if(typeof raw!=="string"||!/^(?:20\d{2})-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(raw))return null;
  const n=Date.parse(raw);return Number.isFinite(n)?n:null;
}
export function projectPublic30mPulse(rows,now=new Date()) {
  if(!Array.isArray(rows)||rows.length>3||!Number.isFinite(now.getTime()))
    throw Error("SOURCE_PULSE_D1_RESULT_INVALID");
  const known=new Map();
  for(const row of rows) {
    if(!row||!DOMAINS.includes(row.scope)||known.has(row.scope))
      throw Error("SOURCE_PULSE_D1_ROWS_INVALID");
    known.set(row.scope,row);
  }
  const categories={};
  for(const domain of DOMAINS) {
    const row=known.get(domain);
    let received=null;
    try { received=JSON.parse(row?.metadata_json??"null"); } catch {/* invalid telemetry */}
    const checked=dateMs(received?.checked_at);
    const actual=dateMs(row?.last_attempt_at);
    const count=received?.original_publisher_30m_topic_count;
    const stale=checked===null||actual===null||checked!==actual||
      checked>now.getTime()+5*60_000||now.getTime()-checked>MAX_STATUS_AGE_MS;
    const healthy=!stale&&row?.status==="OBSERVED"&&
      received?.schema==="geomacro.private-source-pulse-checkpoint.v1"&&
      received?.domain===domain&&validCount(count)&&
      received?.original_publisher_date_observed===true&&
      received?.commercial_eligible===false;
    categories[domain]={
      status:!row?"UNKNOWN_NOT_YET_CHECKED":stale?"STALE_OR_UNAVAILABLE":
        healthy?"SOURCE_NATIVE_OBSERVED":"SOURCE_TRANSPORT_DEGRADED",
      last_checked_at:checked===null?null:new Date(checked).toISOString(),
      original_publisher_topic_items_within_30m:healthy?count:null,
      no_new_original_topic_item_observed:healthy&&count===0,
      independent_same_event_confirmation:false,
      source_commercial_rights_verified:false,
      current_signed_intelligence_available:false,
    };
  }
  return {
    schema:"geomacro.public-three-domain-source-pulse-30m.v1",
    checked_at:now.toISOString(),
    poll_target_minutes:30,
    schedule_guaranteed:false,
    is_real_current_verified_intelligence:false,
    chargeable:false,
    source_catalog_entries_are_not_news_events:true,
    categories,
  };
}
