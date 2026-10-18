/**
 * A bounded publisher audit can complete its observation while one upstream
 * HTTP transport is degraded. Such a receipt may satisfy the *scheduler
 * transport-observation* step, but NEVER its source-health/freshness gates.
 * Only the actual fixed-source CLI receipt and exit code 3 qualify.
 *
 * We deliberately do not infer a legal source licence, original event,
 * independent corroboration or signed GRI/GRO from an HTTP survey.
 */
const DOMAINS=["geopolitics","macro","rare_earth"];
export function recognizeDegradedOfficialMeshObservation({code,stdout}={}){
  if(code!==3||typeof stdout!=="string"||stdout.length>128*1024)
    return null;
  const rows=stdout.split(/\r?\n/u).filter(x=>x.trim());
  // Probe logs can include harmless bounded diagnostics from first-party
  // parser libraries, but the LAST complete record must be our safe JSON.
  const candidate=rows.at(-1);
  if(!candidate||candidate.length>16*1024)return null;
  let data;
  try{data=JSON.parse(candidate);}
  catch{return null;}
  if(!data||typeof data!=="object"||Array.isArray(data)||
     data.status!=="ACTIVE_OFFICIAL_ISSUERS_DEGRADED"||
     data.active_source_count!==15||
     data.quarantined_not_polled!==3||
     !Number.isSafeInteger(data.active_transport_failures)||
     data.active_transport_failures<1||data.active_transport_failures>15||
     data.original_events_qualified_for_scoring!==0||
     data.commercial_eligible!==false||
     !Array.isArray(data.categories)||data.categories.length!==3||
     JSON.stringify(data.categories.map(x=>x?.category))!==JSON.stringify(DOMAINS)||
     data.categories.some(row=>
       !Number.isSafeInteger(row.sampled_original_issuer_count)||
       !Number.isSafeInteger(row.active_original_issuer_count)||
       row.original_topics_within_24h<0||
       !Number.isSafeInteger(row.original_topics_within_24h)||
       row.article_country_relevance_verified!==false||
       row.article_commercial_rights_verified!==false||
       row.current_scored_event_verified!==false))
    return null;
  return Object.freeze({
    observed:true,source_transport_healthy:false,
    active_transport_failures:data.active_transport_failures,
    original_events_qualified_for_scoring:0,
    commercial_eligible:false,
    source_status:"degraded",
  });
}
