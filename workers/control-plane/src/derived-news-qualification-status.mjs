// Fail-closed, source-neutral observation of the ALREADY authorized auto ingest
// writer. A current collector heartbeat is NOT a current original release.
const CATEGORIES=["geopolitics","macro","rare_earth"];
const STATUS="DERIVED_NEWS_PUBLISH_COMPLETED";
const SCHEMA="geomacro.derived-news-source-check.v1";
const MAX_CURRENT_MS=3*3_600_000;
const MAX_HISTORY_MS=72*3_600_000;
const empty=()=>({
  state:"SOURCE_CHECK_UNAVAILABLE",last_success_at:null,
  current_source_check_verified:false,
  sources_configured:null,sources_reachable:null,
  original_candidates_examined:null,accepted_derived_rows:null,
  raw_upstream_stored:false,commercial_rights_verified:false,
  paid_delivery_authorized:false,
});
export function projectNewsProducerCheckpoint(row,cat,now=Date.now()){
  const none=empty();
  if(!row||row.scope!==cat||row.status!==STATUS||
     typeof row.metadata_json!=="string"||row.metadata_json.length>4096)return none;
  let meta;
  try{meta=JSON.parse(row.metadata_json)}catch{return none}
  const t=Date.parse(String(row.last_success_at??""));
  if(!Number.isFinite(now)||!Number.isFinite(t)||t>now||
     now-t>MAX_HISTORY_MS||meta?.schema!==SCHEMA||meta.category!==cat||
     meta.checked_at!==row.last_success_at||
     meta.raw_upstream_stored!==false||
     meta.commercial_rights_verified!==false||
     meta.paid_delivery_authorized!==false)return none;
  const ok=x=>Number.isSafeInteger(x)&&x>=0&&x<=5000;
  if(!ok(meta.sources_configured)||!ok(meta.sources_reachable)||
     !ok(meta.original_candidates_examined)||!ok(meta.accepted_derived_rows)||
     meta.sources_reachable>meta.sources_configured||
     meta.accepted_derived_rows>meta.original_candidates_examined)return none;
  const current=now-t<=MAX_CURRENT_MS;
  return {
    state:current?"RECENT_AUTHENTICATED_COLLECTOR_CHECK":"HISTORICAL_COLLECTOR_CHECK",
    last_success_at:new Date(t).toISOString(),
    current_source_check_verified:current,
    sources_configured:meta.sources_configured,
    sources_reachable:meta.sources_reachable,
    original_candidates_examined:meta.original_candidates_examined,
    accepted_derived_rows:meta.accepted_derived_rows,
    raw_upstream_stored:false,commercial_rights_verified:false,
    paid_delivery_authorized:false,
  };
}
export async function getNewsProducerChecks(env,now=Date.now()){
  let rows=[];
  try{
    const r=await env.DB.prepare(
      "SELECT scope,status,last_success_at,metadata_json FROM pipeline_checkpoint WHERE pipeline=? AND scope IN ('geopolitics','macro','rare_earth') LIMIT 3"
    ).bind("website_derived_news_ingest").all();
    if(Array.isArray(r?.results)&&r.results.length<=3)rows=r.results;
  }catch{/* Live news survives a separate checkpoint read outage. */}
  return Object.fromEntries(CATEGORIES.map(cat=>[cat,
    projectNewsProducerCheckpoint(rows.find(r=>r.scope===cat),cat,now)]));
}
